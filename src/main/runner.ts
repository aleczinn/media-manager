import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { buildFfmpegArgs } from '../shared/build-args'
import { decideGain } from '../shared/peak'
import { planTracks } from '../shared/pipeline'
import type { ApplyFileResult, ApplyJob, ApplyPhase, ApplyProgress, ApplySummary, Settings } from '../shared/types'
import { parseProgressLine, resolveBinaries, runProcess } from './ffmpeg'
import { clampConcurrency, type PeakService } from './peak-service'
import { downloadImage } from './tmdb'

export interface RunnerEvents {
    progress(progress: ApplyProgress): void
    fileDone(result: ApplyFileResult): void
}

class CancelledError extends Error {}

/** Arbeitet die Dateien mit mehreren gleichzeitigen Jobs ab. Quelldateien werden nie verändert. */
export class Runner {
    private children = new Set<ChildProcess>()
    private cancelWaiters = new Set<() => void>()
    private cancelled = false
    private running = false

    constructor(private peaks: PeakService) {}

    get isRunning(): boolean {
        return this.running
    }

    cancel(): void {
        this.cancelled = true
        this.children.forEach((child) => child.kill())
        this.cancelWaiters.forEach((wake) => wake())
    }

    async run(jobs: ApplyJob[], outputDir: string, settings: Settings, events: RunnerEvents): Promise<ApplySummary> {
        if (this.running) throw new Error('Es läuft bereits ein Vorgang')
        this.running = true
        this.cancelled = false
        const summary: ApplySummary = { ok: 0, skipped: 0, error: 0, cancelled: 0 }

        try {
            await fsp.mkdir(outputDir, { recursive: true })

            const queue = [...jobs]
            const worker = async () => {
                for (let job = queue.shift(); job; job = queue.shift()) {
                    const { fileId } = job
                    const result: ApplyFileResult = this.cancelled
                        ? { fileId, status: 'cancelled' }
                        : await this.processJob(job, outputDir, settings, (phase, percent, etaSec) =>
                              events.progress({ fileId, phase, percent, etaSec })
                          )
                    summary[result.status]++
                    events.fileDone(result)
                }
            }
            await Promise.all(Array.from({ length: Math.min(clampConcurrency(settings.concurrency), jobs.length) }, worker))
        } finally {
            this.running = false
            this.children.clear()
            this.cancelWaiters.clear()
        }

        return summary
    }

    private async processJob(
        job: ApplyJob,
        outputDir: string,
        settings: Settings,
        report: (phase: ApplyPhase, percent: number, etaSec: number | null) => void
    ): Promise<ApplyFileResult> {
        const targetPath = path.join(outputDir, job.targetName)
        const tempPath = `${targetPath}.partial`

        if (fs.existsSync(targetPath)) {
            return { fileId: job.fileId, status: 'skipped', message: 'Zieldatei existiert bereits' }
        }

        const { ffmpeg } = resolveBinaries(settings)
        const duration = job.analysis.durationSec

        try {
            const plan = planTracks(job.analysis, settings)
            const notes: string[] = []

            let gainDb: number | null = null
            if (plan.normalize) {
                report('analyze', 0, null)
                try {
                    // Meist schon im Hintergrund erledigt, sonst wird die Analyse vorgezogen
                    const peak = await this.untilCancelled(
                        this.peaks.get(
                            { inputPath: job.inputPath, size: job.size, trackIndex: plan.normalize.source.index, durationSec: duration },
                            (percent, etaSec) => report('analyze', percent, etaSec)
                        )
                    )
                    gainDb = decideGain(peak, settings.normalizeMinGain, settings.normalizeMaxGain)
                    notes.push(
                        gainDb === null
                            ? `Normalisierung übersprungen (Peak ${peak.maxVolume} dB)`
                            : `Normalisiert +${gainDb.toFixed(1)} dB${gainDb < peak.gainNeeded ? ' (begrenzt)' : ''}`
                    )
                } catch (error) {
                    this.throwIfCancelled()
                    // Wie im alten Projekt: Datei trotzdem bauen, nur ohne normalisierte Spur
                    notes.push(error instanceof Error ? error.message : String(error))
                }
            } else if (plan.normalizeSkipReason) {
                notes.push(plan.normalizeSkipReason)
            }

            const description = settings.pipeline.cleanMetadata ? await readDescription(job) : null
            const args = buildFfmpegArgs({ inputPath: job.inputPath, outputPath: tempPath, plan, settings, gainDb, description })

            report('build', 0, null)
            let speed: number | null = null
            const { code, stderrTail } = await runProcess(ffmpeg, args, {
                onSpawn: (child) => {
                    this.children.add(child)
                    child.once('close', () => this.children.delete(child))
                    if (this.cancelled) child.kill()
                },
                onStdoutLine: (line) => {
                    const progress = parseProgressLine(line)
                    if (progress.speed !== undefined) speed = progress.speed
                    if (progress.outTimeSec !== undefined && duration > 0) {
                        const percent = Math.min(100, (progress.outTimeSec / duration) * 100)
                        report('build', percent, speed ? Math.max(0, (duration - progress.outTimeSec) / speed) : null)
                    }
                }
            })
            this.throwIfCancelled()
            if (code !== 0) throw new Error(stderrTail.slice(-5).join('\n') || `ffmpeg beendet mit Code ${code}`)

            await fsp.rename(tempPath, targetPath)

            if (job.thumbUrl) {
                // Ein fehlendes Bild macht die fertige Datei nicht kaputt, es wird nur vermerkt
                try {
                    await saveThumbnail(job.thumbUrl, targetPath)
                    notes.push('Vorschaubild gespeichert')
                } catch (error) {
                    notes.push(`Vorschaubild fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
                }
            }

            return { fileId: job.fileId, status: 'ok', message: notes.join(' · ') || undefined }
        } catch (error) {
            await fsp.rm(tempPath, { force: true }).catch(() => undefined)
            if (error instanceof CancelledError || this.cancelled) {
                return { fileId: job.fileId, status: 'cancelled', message: 'Abgebrochen' }
            }
            return { fileId: job.fileId, status: 'error', message: error instanceof Error ? error.message : String(error) }
        }
    }

    /** Wartet auf das Promise, bricht aber sofort ab, wenn der Lauf abgebrochen wird. */
    private untilCancelled<T>(promise: Promise<T>): Promise<T> {
        this.throwIfCancelled()
        return new Promise<T>((resolve, reject) => {
            const wake = () => reject(new CancelledError())
            this.cancelWaiters.add(wake)
            promise.then(resolve, reject).finally(() => this.cancelWaiters.delete(wake))
        })
    }

    private throwIfCancelled(): void {
        if (this.cancelled) throw new CancelledError()
    }
}

/** Speichert das Episodenbild als `<Zielname>-thumb.jpg` neben der MKV (erst als .partial, dann umbenannt) */
async function saveThumbnail(url: string, targetPath: string): Promise<void> {
    const thumbPath = targetPath.replace(/\.mkv$/i, '') + '-thumb.jpg'
    const tempPath = `${thumbPath}.partial`
    try {
        await fsp.writeFile(tempPath, await downloadImage(url))
        await fsp.rename(tempPath, thumbPath)
    } finally {
        await fsp.rm(tempPath, { force: true }).catch(() => undefined)
    }
}

/** Beschreibung aus einer `<name>.txt` neben der Quelldatei. */
async function readDescription(job: ApplyJob): Promise<string | null> {
    const parsed = path.parse(job.inputPath)
    try {
        const text = (await fsp.readFile(path.join(parsed.dir, `${parsed.name}.txt`), 'utf8')).trim()
        return text || null
    } catch {
        return null
    }
}
