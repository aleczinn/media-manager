import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { buildFfmpegArgs } from '../shared/build-args'
import { planTracks } from '../shared/pipeline'
import type { ApplyFileResult, ApplyJob, ApplyPhase, ApplyProgress, ApplySummary, Settings } from '../shared/types'
import { parseProgressLine, resolveBinaries, runProcess } from './ffmpeg'
import { analyzePeakVolume, decideGain } from './normalize'

export interface RunnerEvents {
    progress(progress: ApplyProgress): void
    fileDone(result: ApplyFileResult): void
}

class CancelledError extends Error {}

/** Arbeitet die Dateien nacheinander ab. Quelldateien werden nie verändert. */
export class Runner {
    private child: ChildProcess | null = null
    private cancelled = false
    private running = false

    get isRunning(): boolean {
        return this.running
    }

    cancel(): void {
        this.cancelled = true
        this.child?.kill()
    }

    async run(jobs: ApplyJob[], outputDir: string, settings: Settings, events: RunnerEvents): Promise<ApplySummary> {
        if (this.running) throw new Error('Es läuft bereits ein Vorgang')
        this.running = true
        this.cancelled = false
        const summary: ApplySummary = { ok: 0, skipped: 0, error: 0, cancelled: 0 }

        try {
            await fsp.mkdir(outputDir, { recursive: true })

            for (const [index, job] of jobs.entries()) {
                let result: ApplyFileResult
                if (this.cancelled) {
                    result = { fileId: job.fileId, status: 'cancelled' }
                } else {
                    result = await this.processJob(job, outputDir, settings, (phase, percent, etaSec) =>
                        events.progress({ fileId: job.fileId, phase, percent, etaSec, index, total: jobs.length })
                    )
                }
                summary[result.status]++
                events.fileDone(result)
            }
        } finally {
            this.running = false
            this.child = null
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
        const onSpawn = (child: ChildProcess) => {
            this.child = child
            if (this.cancelled) child.kill()
        }
        const progressFor = (phase: ApplyPhase) => (outTimeSec: number, speed: number | null) => {
            const percent = duration > 0 ? Math.min(100, (outTimeSec / duration) * 100) : 0
            const etaSec = speed && duration > 0 ? Math.max(0, (duration - outTimeSec) / speed) : null
            report(phase, percent, etaSec)
        }

        try {
            const plan = planTracks(job.analysis, settings)
            const notes: string[] = []

            let gainDb: number | null = null
            if (plan.normalize) {
                report('analyze', 0, null)
                try {
                    const peak = await analyzePeakVolume(ffmpeg, job.inputPath, plan.normalize, progressFor('analyze'), onSpawn)
                    this.throwIfCancelled()
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
            const onBuildProgress = progressFor('build')
            const { code, stderrTail } = await runProcess(ffmpeg, args, {
                onSpawn,
                onStdoutLine: (line) => {
                    const progress = parseProgressLine(line)
                    if (progress.speed !== undefined) speed = progress.speed
                    if (progress.outTimeSec !== undefined) onBuildProgress(progress.outTimeSec, speed)
                }
            })
            this.throwIfCancelled()
            if (code !== 0) throw new Error(stderrTail.slice(-5).join('\n') || `ffmpeg beendet mit Code ${code}`)

            await fsp.rename(tempPath, targetPath)
            return { fileId: job.fileId, status: 'ok', message: notes.join(' · ') || undefined }
        } catch (error) {
            await fsp.rm(tempPath, { force: true }).catch(() => undefined)
            if (error instanceof CancelledError || this.cancelled) {
                return { fileId: job.fileId, status: 'cancelled', message: 'Abgebrochen' }
            }
            return { fileId: job.fileId, status: 'error', message: error instanceof Error ? error.message : String(error) }
        } finally {
            this.child = null
        }
    }

    private throwIfCancelled(): void {
        if (this.cancelled) throw new CancelledError()
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
