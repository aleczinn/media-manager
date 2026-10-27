import type { ChildProcess } from 'node:child_process'
import {
    fileKey,
    peakKey,
    type PeakResult,
    type PeakState,
    type PeakUpdate,
    type ScanRequest,
    type SubtitleCountsUpdate
} from '../shared/peak'
import type { Settings } from '../shared/types'
import { resolveBinaries } from './ffmpeg'
import { runScan } from './scan'

type ProgressListener = (percent: number, etaSec: number | null) => void

interface Deferred<T> {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (error: Error) => void
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    // Vorab-Scans ohne Abnehmer sollen keine "unhandled rejection" auslösen
    promise.catch(() => undefined)
    return { promise, resolve, reject }
}

interface PeakEntry {
    key: string
    state: PeakState
    result: Deferred<PeakResult>
    job: Job
}

interface CountEntry {
    key: string
    result: Deferred<number[]>
    job: Job
}

/** Ein ffmpeg-Lauf über eine Datei; erledigt Peak und/oder Zählung auf einmal */
interface Job {
    inputPath: string
    size: number
    durationSec: number
    peakTrackIndex: number | null
    peak?: PeakEntry
    count?: CountEntry
    started: boolean
    listeners: Set<ProgressListener>
}

export function clampConcurrency(value: number | undefined): number {
    return Math.min(4, Math.max(1, Math.round(value || 2)))
}

/**
 * Hintergrund-Scans: Peak-Analyse und Untertitel-Zählung lesen beide die ganze Datei, deshalb
 * laufen sie pro Datei in einem gemeinsamen ffmpeg-Lauf. Ergebnisse werden gemerkt; beim Anwenden
 * wird ein wartender Scan vorgezogen.
 */
export class ScanService {
    private peaks = new Map<string, PeakEntry>()
    private counts = new Map<string, CountEntry>()
    private queue: Job[] = []
    private running = 0
    private children = new Set<ChildProcess>()

    constructor(
        private getSettings: () => Settings,
        private onPeakUpdate: (update: PeakUpdate) => void,
        private onCounts: (update: SubtitleCountsUpdate) => void
    ) {}

    /** Stellt Scans in die Warteschlange; bereits bekannte oder laufende werden nicht wiederholt. */
    prefetch(requests: ScanRequest[]): void {
        requests.forEach((request) => this.ensure(request))
        this.pump()
    }

    getPeak(
        request: { inputPath: string; size: number; durationSec: number; trackIndex: number },
        onProgress?: ProgressListener
    ): Promise<PeakResult> {
        const { peak } = this.ensure({ ...request, peakTrackIndex: request.trackIndex, countSubtitles: false })
        return this.wait(peak!.job, peak!.result.promise, onProgress)
    }

    getCounts(request: { inputPath: string; size: number; durationSec: number }, onProgress?: ProgressListener): Promise<number[]> {
        const { count } = this.ensure({ ...request, peakTrackIndex: null, countSubtitles: true })
        return this.wait(count!.job, count!.result.promise, onProgress)
    }

    killAll(): void {
        this.queue = []
        this.children.forEach((child) => child.kill())
    }

    /** Sorgt für Einträge zu allem, was die Anfrage braucht; neue werden an einen wartenden Job derselben Datei gehängt */
    private ensure(request: ScanRequest): { peak?: PeakEntry; count?: CountEntry } {
        const key = fileKey(request)
        const pKey = request.peakTrackIndex !== null ? peakKey({ ...request, trackIndex: request.peakTrackIndex }) : null
        let peak = pKey ? this.peaks.get(pKey) : undefined
        let count = request.countSubtitles ? this.counts.get(key) : undefined
        const needPeak = pKey !== null && !peak
        const needCount = request.countSubtitles && !count
        if (!needPeak && !needCount) return { peak, count }

        let job = this.queue.find(
            (queued) =>
                fileKey(queued) === key && (!needPeak || queued.peakTrackIndex === null || queued.peakTrackIndex === request.peakTrackIndex)
        )
        if (!job) {
            job = { ...request, peakTrackIndex: null, started: false, listeners: new Set() }
            this.queue.push(job)
        }
        if (needPeak) {
            job.peakTrackIndex = request.peakTrackIndex
            peak = { key: pKey, state: { status: 'queued', percent: 0 }, result: deferred(), job }
            job.peak = peak
            this.peaks.set(pKey, peak)
            this.updatePeak(peak, peak.state)
        }
        if (needCount) {
            count = { key, result: deferred(), job }
            job.count = count
            this.counts.set(key, count)
        }
        return { peak, count }
    }

    private async wait<T>(job: Job, promise: Promise<T>, onProgress?: ProgressListener): Promise<T> {
        if (!job.started) this.queue = [job, ...this.queue.filter((queued) => queued !== job)]
        if (onProgress) job.listeners.add(onProgress)
        this.pump()
        try {
            return await promise
        } finally {
            if (onProgress) job.listeners.delete(onProgress)
        }
    }

    private pump(): void {
        const limit = clampConcurrency(this.getSettings().concurrency)
        while (this.running < limit && this.queue.length > 0) {
            void this.start(this.queue.shift()!)
        }
    }

    private async start(job: Job): Promise<void> {
        job.started = true
        this.running++
        if (job.peak) this.updatePeak(job.peak, { status: 'running', percent: 0 })

        try {
            const outcome = await runScan(
                resolveBinaries(this.getSettings()).ffmpeg,
                job.inputPath,
                job.peak ? job.peakTrackIndex : null,
                !!job.count,
                (outTimeSec, speed) => {
                    const percent = job.durationSec > 0 ? Math.min(100, (outTimeSec / job.durationSec) * 100) : 0
                    const etaSec = speed && job.durationSec > 0 ? Math.max(0, (job.durationSec - outTimeSec) / speed) : null
                    if (job.peak) job.peak.state = { status: 'running', percent }
                    job.listeners.forEach((listener) => listener(percent, etaSec))
                },
                (child) => {
                    this.children.add(child)
                    child.once('close', () => this.children.delete(child))
                }
            )
            if (job.peak && outcome.maxVolume !== null) {
                this.updatePeak(job.peak, { status: 'done', maxVolume: outcome.maxVolume })
                job.peak.result.resolve({ maxVolume: outcome.maxVolume, gainNeeded: -outcome.maxVolume })
            }
            if (job.count) {
                const counts = outcome.subtitleCounts ?? []
                this.onCounts({ fileKey: job.count.key, counts })
                job.count.result.resolve(counts)
            }
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error))
            // Fehlgeschlagene Scans nicht merken, damit ein späterer Versuch neu startet
            if (job.peak) {
                this.peaks.delete(job.peak.key)
                this.updatePeak(job.peak, { status: 'error', error: failure.message })
                job.peak.result.reject(failure)
            }
            if (job.count) {
                this.counts.delete(job.count.key)
                this.onCounts({ fileKey: job.count.key, counts: null })
                job.count.result.reject(failure)
            }
        } finally {
            this.running--
            this.pump()
        }
    }

    private updatePeak(entry: PeakEntry, state: PeakState): void {
        entry.state = state
        this.onPeakUpdate({ key: entry.key, state })
    }
}
