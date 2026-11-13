import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { YtBinaryStatus } from '../shared/youtube-dl'
import type { Settings } from '../shared/types'
import { runProcess } from './ffmpeg'

const DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

/** Eigene Kopie in den App-Daten; nur die wird automatisch aktualisiert */
export const managedPath = () => path.join(app.getPath('userData'), 'bin', 'yt-dlp.exe')

const exists = (file: string) =>
    fsp.access(file).then(
        () => true,
        () => false
    )

/**
 * Verwaltet yt-dlp: Ohne eingestellten Pfad wird die aktuelle Version von GitHub in die App-Daten geladen und bei
 * jedem Programmstart per `yt-dlp -U` aktualisiert, damit Anpassungen an YouTube sofort ankommen.
 */
export class YtDlpBinary {
    private status: YtBinaryStatus = { state: 'checking', version: null, managed: true }
    private pending: Promise<string> | null = null

    constructor(
        private readonly getSettings: () => Settings,
        private readonly onStatus: (status: YtBinaryStatus) => void
    ) {}

    getStatus(): YtBinaryStatus {
        return this.status
    }

    private setStatus(status: YtBinaryStatus) {
        this.status = status
        this.onStatus(status)
    }

    private configuredPath(): string {
        return this.getSettings().youtube.ytdlpPath.trim()
    }

    /** JS-Laufzeit für YouTube: die Node-Laufzeit von Electron selbst (spart einen Deno-Download) */
    runtimeArgs(): string[] {
        return ['--js-runtimes', `node:${process.execPath}`]
    }

    runtimeEnv(): Record<string, string> {
        return { ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    }

    /** Pfad zu einem nutzbaren yt-dlp (lädt es beim ersten Mal herunter) */
    ensure(): Promise<string> {
        const configured = this.configuredPath()
        if (configured) return Promise.resolve(configured)
        if (!this.pending) {
            this.pending = this.ensureManaged().catch((error) => {
                this.pending = null
                throw error
            })
        }
        return this.pending
    }

    private async ensureManaged(): Promise<string> {
        const target = managedPath()
        if (await exists(target)) return target
        this.setStatus({ state: 'downloading', version: null, managed: true, message: 'yt-dlp wird heruntergeladen …' })
        try {
            await fsp.mkdir(path.dirname(target), { recursive: true })
            const response = await fetch(DOWNLOAD_URL, { signal: AbortSignal.timeout(120_000) })
            if (!response.ok) throw new Error(`GitHub antwortet mit ${response.status}`)
            const data = Buffer.from(await response.arrayBuffer())
            const partial = `${target}.partial`
            await fsp.writeFile(partial, data)
            await fsp.rename(partial, target)
        } catch (error) {
            const message = `yt-dlp konnte nicht heruntergeladen werden: ${error instanceof Error ? error.message : String(error)}`
            this.setStatus({ state: 'error', version: null, managed: true, message })
            throw new Error(message)
        }
        return target
    }

    async readVersion(bin: string): Promise<string | null> {
        try {
            const { code, stdout } = await runProcess(bin, ['--version'])
            return code === 0 ? stdout.trim().split('\n')[0] || null : null
        } catch {
            return null
        }
    }

    /**
     * Beim Programmstart: sicherstellen, dass yt-dlp da ist, und die eigene Kopie aktualisieren.
     * `canUpdate` verhindert ein Update, während gerade heruntergeladen wird (die .exe wäre gesperrt).
     */
    async refresh(canUpdate: () => boolean = () => true): Promise<YtBinaryStatus> {
        const configured = this.configuredPath()
        this.setStatus({ state: 'checking', version: this.status.version, managed: !configured })
        let bin: string
        try {
            bin = await this.ensure()
        } catch {
            return this.status
        }

        if (!configured && canUpdate()) {
            this.setStatus({ state: 'updating', version: this.status.version, managed: true, message: 'yt-dlp wird aktualisiert …' })
            try {
                const { code, stdout, stderrTail } = await runProcess(bin, ['-U', '--update-to', 'stable'])
                if (code !== 0) {
                    const version = await this.readVersion(bin)
                    const detail = stderrTail.filter((line) => line.trim()).at(-1) ?? `Code ${code}`
                    this.setStatus({ state: 'ready', version, managed: true, message: `Update fehlgeschlagen: ${detail}` })
                    return this.status
                }
                const updated = /Updated yt-dlp to/i.test(stdout)
                const version = await this.readVersion(bin)
                this.setStatus({ state: 'ready', version, managed: true, message: updated ? `Aktualisiert auf ${version}` : undefined })
                return this.status
            } catch (error) {
                const version = await this.readVersion(bin)
                this.setStatus({
                    state: 'ready',
                    version,
                    managed: true,
                    message: `Update fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
                })
                return this.status
            }
        }

        const version = await this.readVersion(bin)
        this.setStatus(
            version
                ? { state: 'ready', version, managed: !configured }
                : { state: 'error', version: null, managed: !configured, message: `yt-dlp unter „${bin}“ nicht nutzbar` }
        )
        return this.status
    }
}
