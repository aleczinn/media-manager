import { spawn, type ChildProcess } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Settings, TmdbResult } from '../shared/types'
import {
    DETAIL_CANCELLED,
    parseProgressLine,
    parseSource,
    parseVideo,
    phaseOfLine,
    PROGRESS_TEMPLATE,
    translateError,
    type YtDownloadJob,
    type YtItemResult,
    type YtProgress,
    type YtSource,
    type YtVideo
} from '../shared/youtube-dl'
import { renderImage } from './artwork'
import { runProcess } from './ffmpeg'
import type { YtDlpBinary } from './ytdlp-binary'

/** Gleichzeitige Detail-Abfragen (Formate je Video) */
const DETAIL_CONCURRENCY = 3
/** Automatische neue Versuche bei Netzwerkfehlern */
const RETRIES = 2

/** yt-dlp.exe startet sich selbst als Unterprozess (und ffmpeg): unter Windows den ganzen Baum beenden */
function killTree(child: ChildProcess | null): void {
    if (!child?.pid) return
    if (process.platform === 'win32')
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill())
    else child.kill()
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
const exists = (file: string) =>
    fsp.access(file).then(
        () => true,
        () => false
    )

/** Erstes ladbare Bild als JPG schreiben; gibt die letzte Fehlermeldung zurück oder `null` */
async function renderFirst(settings: Settings, urls: string[], target: string): Promise<string | null> {
    let lastError: string | null = null
    for (const url of urls) {
        try {
            await renderImage(settings, url, 'thumb', target)
            return null
        } catch (error) {
            lastError = errorText(error)
        }
    }
    return lastError
}

interface Listeners {
    progress: (progress: YtProgress) => void
    itemDone: (result: YtItemResult) => void
}

/** Analyse von Links und Warteschlange der Downloads (wie bei JDownloader: läuft, solange etwas ansteht) */
export class YoutubeService {
    private readonly details = new Map<string, Promise<YtVideo>>()
    private detailSlots = DETAIL_CONCURRENCY
    private readonly detailWaiters: { id: string; resolve: () => void; reject: (error: Error) => void }[] = []

    private readonly queue: YtDownloadJob[] = []
    private readonly active = new Map<string, { child: ChildProcess | null; cancelled: boolean }>()
    private workers = 0
    /** Ordner, in die in diesem Lauf schon ein folder.jpg geschrieben wurde */
    private readonly folderImages = new Set<string>()

    constructor(
        private readonly binary: YtDlpBinary,
        private readonly getSettings: () => Settings,
        private readonly listeners: Listeners
    ) {}

    get isRunning(): boolean {
        return this.active.size > 0 || this.queue.length > 0
    }

    /** Gemeinsame Argumente: JS-Laufzeit, ffmpeg, Cookies */
    private commonArgs(settings: Settings): string[] {
        const args = ['--ignore-config', '--no-warnings', ...this.binary.runtimeArgs()]
        if (settings.ffmpegPath.trim()) args.push('--ffmpeg-location', settings.ffmpegPath.trim())
        if (settings.youtube.cookiesFromBrowser) args.push('--cookies-from-browser', settings.youtube.cookiesFromBrowser)
        return args
    }

    private async json(url: string, extra: string[]): Promise<Record<string, unknown>> {
        const settings = this.getSettings()
        const bin = await this.binary.ensure()
        const { code, stdout, stderrTail } = await runProcess(bin, [...this.commonArgs(settings), '-J', ...extra, url], {
            env: this.binary.runtimeEnv()
        })
        if (code !== 0 || !stdout.trim()) throw new Error(translateError(stderrTail).message)
        return JSON.parse(stdout) as Record<string, unknown>
    }

    /** Link einlesen: Einzelvideo (mit Formaten) oder Playlist (nur Einträge, Details folgen einzeln) */
    async analyze(url: string): Promise<TmdbResult<YtSource>> {
        try {
            const source = parseSource(await this.json(url, ['--flat-playlist']), url)
            if (source.video) this.details.set(source.video.id, Promise.resolve(source.video))
            if (source.kind === 'playlist' && source.entries.length === 0) return { ok: false, error: 'Die Playlist ist leer oder privat' }
            return { ok: true, data: source }
        } catch (error) {
            return { ok: false, error: errorText(error) }
        }
    }

    /** Formate, Beschreibung usw. eines Videos (gemerkt, höchstens drei Abfragen gleichzeitig) */
    async video(id: string, url: string): Promise<TmdbResult<YtVideo>> {
        let result = this.details.get(id)
        if (!result) {
            result = this.withDetailSlot(id, () => this.json(url, ['--no-playlist']).then(parseVideo))
            this.details.set(id, result)
            result.catch(() => this.details.delete(id))
        }
        return result.then(
            (data) => ({ ok: true as const, data }),
            (error) => ({ ok: false as const, error: errorText(error) })
        )
    }

    private async withDetailSlot<T>(id: string, task: () => Promise<T>): Promise<T> {
        if (this.detailSlots === 0) await new Promise<void>((resolve, reject) => this.detailWaiters.push({ id, resolve, reject }))
        else this.detailSlots--
        try {
            return await task()
        } finally {
            const next = this.detailWaiters.shift()
            if (next) next.resolve()
            else this.detailSlots++
        }
    }

    /** Noch wartende Detail-Abfragen verwerfen (Videos abgewählt oder Link entfernt) */
    dropDetails(ids: string[]): void {
        const drop = new Set(ids)
        for (let index = this.detailWaiters.length - 1; index >= 0; index--) {
            const waiter = this.detailWaiters[index]
            if (!drop.has(waiter.id)) continue
            this.detailWaiters.splice(index, 1)
            waiter.reject(new Error(DETAIL_CANCELLED))
        }
    }

    /** Videos in die Warteschlange stellen; Ergebnisse kommen über die Listener */
    enqueue(jobs: YtDownloadJob[]): void {
        const known = new Set([...this.queue.map((job) => job.id), ...this.active.keys()])
        this.queue.push(...jobs.filter((job) => !known.has(job.id)))
        if (this.workers === 0) this.folderImages.clear()
        const wanted = Math.max(1, Math.min(4, this.getSettings().youtube.concurrency))
        while (this.workers < wanted && this.queue.length > 0) {
            this.workers++
            void this.work().finally(() => this.workers--)
        }
    }

    private async work(): Promise<void> {
        for (let job = this.queue.shift(); job; job = this.queue.shift()) {
            const state = { child: null as ChildProcess | null, cancelled: false }
            this.active.set(job.id, state)
            let result: YtItemResult
            try {
                result = await this.download(job, state)
            } catch (error) {
                result = { id: job.id, status: state.cancelled ? 'cancelled' : 'error', message: errorText(error) }
            }
            this.active.delete(job.id)
            this.listeners.itemDone(result)
        }
    }

    /** Alles abbrechen: Laufende Prozesse beenden, Wartende als abgebrochen melden */
    cancelAll(): void {
        for (const job of this.queue.splice(0)) this.listeners.itemDone({ id: job.id, status: 'cancelled' })
        for (const state of this.active.values()) {
            state.cancelled = true
            killTree(state.child)
        }
    }

    cancel(id: string): void {
        const index = this.queue.findIndex((job) => job.id === id)
        if (index >= 0) {
            this.queue.splice(index, 1)
            this.listeners.itemDone({ id, status: 'cancelled' })
            return
        }
        const state = this.active.get(id)
        if (state) {
            state.cancelled = true
            killTree(state.child)
        }
    }

    private async download(job: YtDownloadJob, state: { child: ChildProcess | null; cancelled: boolean }): Promise<YtItemResult> {
        const settings = this.getSettings()
        await fsp.mkdir(job.workDir, { recursive: true })
        const target = path.join(job.workDir, `${job.stem}.${job.ext}`)
        const notes: string[] = []

        // folder.jpg einmal je Ordner
        if (job.folderImageDir && job.folderImageUrls.length > 0 && !this.folderImages.has(job.folderImageDir)) {
            this.folderImages.add(job.folderImageDir)
            await fsp.mkdir(job.folderImageDir, { recursive: true })
            const folderImage = path.join(job.folderImageDir, 'folder.jpg')
            if (!(await exists(folderImage))) {
                const error = await renderFirst(settings, job.folderImageUrls, folderImage)
                if (error) notes.push(`folder.jpg nicht gespeichert: ${error}`)
            }
        }

        const already = await exists(target)
        if (!already) {
            for (let attempt = 0; ; attempt++) {
                const outcome = await this.runDownload(job, target, state)
                if (outcome === 'ok') break
                if (state.cancelled) return { id: job.id, status: 'cancelled' }
                if (!outcome.retryable || attempt >= RETRIES) return { id: job.id, status: 'error', message: outcome.message }
                await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)))
                if (state.cancelled) return { id: job.id, status: 'cancelled' }
            }
        }

        // Bild und Beschreibung gleichnamig daneben, die Nachbearbeitung kopiert sie mit
        this.listeners.progress({ id: job.id, phase: 'post', fraction: 0.99, speed: null, etaSec: null })
        if (job.thumbnailUrl) {
            const image = path.join(job.workDir, `${job.stem}.jpg`)
            if (!(await exists(image))) {
                const error = await renderFirst(settings, [job.thumbnailUrl], image)
                if (error) notes.push(`Bild nicht gespeichert: ${error}`)
            }
        }
        if (job.description !== null && job.description.trim()) {
            const text = path.join(job.workDir, `${job.stem}.txt`)
            if (!(await exists(text))) {
                await fsp
                    .writeFile(text, job.description.replace(/\r?\n/g, '\r\n'), 'utf8')
                    .catch((error) => notes.push(`Beschreibung nicht gespeichert: ${errorText(error)}`))
            }
        }

        // Ein vorheriger Lauf hat das Video schon geladen (z. B. abgebrochene Verarbeitung): wiederverwenden
        if (already) return { id: job.id, status: 'ok', message: ['Schon geladen', ...notes].join(' · '), path: target }
        return { id: job.id, status: 'ok', message: notes.join(' · ') || undefined, path: target }
    }

    /** Ein Durchgang yt-dlp in einen eigenen Arbeitsordner; danach die fertige Datei ans Ziel verschieben */
    private async runDownload(
        job: YtDownloadJob,
        target: string,
        state: { child: ChildProcess | null; cancelled: boolean }
    ): Promise<'ok' | { message: string; retryable: boolean }> {
        const settings = this.getSettings()
        const bin = await this.binary.ensure()
        const workDir = path.join(job.workDir, `.${job.id.replace(/[^\w-]/g, '_').slice(-40)}`)
        await fsp.mkdir(workDir, { recursive: true })

        const args = [
            ...this.commonArgs(settings),
            '--no-playlist',
            '--newline',
            '--progress-template',
            PROGRESS_TEMPLATE,
            '--retries',
            '10',
            '--fragment-retries',
            '10',
            '-f',
            job.formatSpec,
            '-o',
            path.join(workDir, 'download.%(ext)s')
        ]
        if (job.audioOnly) args.push('-x', '--audio-format', job.audioOnly === 'aac' ? 'm4a' : job.audioOnly, '--audio-quality', '0')
        else args.push('--merge-output-format', 'mkv', '--embed-chapters')
        if (settings.youtube.rateLimit.trim()) args.push('--limit-rate', settings.youtube.rateLimit.trim())
        args.push(job.url)

        // Fortschritt über alle Teile (Video, Audio): fertige Teile mit ihrer echten Größe, offene geschätzt
        const finished: number[] = []
        let part = -1
        let current = { downloaded: 0, total: 0 }
        let lastSent = 0
        let sample: { bytes: number; at: number } | null = null
        let measured: number | null = null
        const send = (progress: Omit<YtProgress, 'id'>, force = false) => {
            const now = Date.now()
            if (!force && now - lastSent < 250) return
            lastSent = now
            this.listeners.progress({ id: job.id, ...progress })
        }
        const onLine = (line: string) => {
            if (/^\[download\] Destination:/.test(line)) {
                if (part >= 0) finished.push(current.total || current.downloaded)
                part++
                current = { downloaded: 0, total: 0 }
                return
            }
            const phase = phaseOfLine(line)
            if (phase) {
                send({ phase, fraction: phase === 'merge' ? 0.97 : 0.98, speed: null, etaSec: null }, true)
                return
            }
            const progress = parseProgressLine(line)
            if (!progress) return
            // Bei Fragment-Downloads fehlen Geschwindigkeit und Restzeit: aus der Änderung der Bytes schätzen
            const now = Date.now()
            if (sample && progress.downloaded > sample.bytes && now - sample.at >= 1000) {
                const rate = ((progress.downloaded - sample.bytes) * 1000) / (now - sample.at)
                measured = measured === null ? rate : measured * 0.7 + rate * 0.3
                sample = { bytes: progress.downloaded, at: now }
            } else if (!sample || progress.downloaded < sample.bytes) sample = { bytes: progress.downloaded, at: now }
            const speed = progress.speed ?? measured
            const partTotal = progress.total ?? current.total
            const etaSec = progress.etaSec ?? (speed && partTotal ? Math.max(0, (partTotal - progress.downloaded) / speed) : null)
            current = { downloaded: progress.downloaded, total: progress.total ?? current.total }
            const index = Math.max(0, part)
            const done = finished.reduce((sum, size) => sum + size, 0) + progress.downloaded
            const remaining = job.partSizes.slice(index + 1).reduce((sum, size) => sum + size, 0)
            const total = finished.reduce((sum, size) => sum + size, 0) + (current.total || job.partSizes[index] || 0) + remaining
            const fraction = total > 0 ? Math.min(0.96, (done / total) * 0.96) : 0
            send({ phase: 'download', fraction, speed, etaSec })
        }

        try {
            send({ phase: 'download', fraction: 0, speed: null, etaSec: null }, true)
            const { code, stderrTail } = await runProcess(bin, args, {
                env: this.binary.runtimeEnv(),
                onStdoutLine: onLine,
                onSpawn: (child) => {
                    state.child = child
                    if (state.cancelled) killTree(child)
                }
            })
            state.child = null
            if (state.cancelled) return { message: 'Abgebrochen', retryable: false }
            if (code !== 0) return translateError(stderrTail)

            const files = await fsp.readdir(workDir)
            const output =
                files.find((file) => file.toLowerCase() === `download.${job.ext}`) ?? files.find((file) => /^download\.[^.]+$/.test(file))
            if (!output) return { message: 'yt-dlp hat keine Datei erzeugt', retryable: false }
            // Falls das Ziel inzwischen existiert (z. B. doppelt eingereiht), nicht überschreiben
            if (await exists(target)) return 'ok'
            await fsp.rename(path.join(workDir, output), target)
            return 'ok'
        } catch (error) {
            return { message: errorText(error), retryable: false }
        } finally {
            await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
        }
    }

    /**
     * Nur-Audio-Downloads laufen nicht durch die Video-Verarbeitung: direkt mit Bild und Beschreibung in den Output.
     * Vorhandene Dateien werden nicht überschrieben.
     */
    async deliver(files: { path: string; targetStem: string }[], outputDir: string): Promise<YtItemResult[]> {
        const results: YtItemResult[] = []
        await fsp.mkdir(outputDir, { recursive: true })
        for (const { path: file, targetStem } of files) {
            const ext = path.extname(file)
            const stem = file.slice(0, -ext.length)
            const target = path.join(outputDir, `${targetStem}${ext}`)
            try {
                if (await exists(target)) {
                    results.push({ id: file, status: 'skipped', message: 'Datei ist im Output schon vorhanden' })
                    continue
                }
                await fsp.rename(file, target).catch(async () => {
                    await fsp.copyFile(file, target)
                    await fsp.rm(file, { force: true })
                })
                for (const sidecar of ['.jpg', '.txt']) {
                    const source = `${stem}${sidecar}`
                    const destination = path.join(outputDir, `${targetStem}${sidecar}`)
                    if ((await exists(source)) && !(await exists(destination))) await fsp.rename(source, destination).catch(() => undefined)
                    await fsp.rm(source, { force: true }).catch(() => undefined)
                }
                results.push({ id: file, status: 'ok', path: target })
            } catch (error) {
                results.push({ id: file, status: 'error', message: errorText(error) })
            }
        }
        return results
    }

    /** Heruntergeladene Rohdateien (samt Bild und Beschreibung) löschen, den Arbeitsordner, wenn er leer ist */
    async cleanup(files: string[], workDir: string): Promise<void> {
        for (const file of files) {
            const stem = file.replace(/\.[^.\\]+$/, '')
            for (const candidate of [file, `${stem}.jpg`, `${stem}.txt`]) await fsp.rm(candidate, { force: true }).catch(() => undefined)
        }
        await fsp.rmdir(workDir).catch(() => undefined)
    }
}
