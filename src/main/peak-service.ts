import type { ChildProcess } from 'node:child_process'
import { peakKey, type PeakRequest, type PeakResult, type PeakState, type PeakUpdate } from '../shared/peak'
import type { Settings } from '../shared/types'
import { resolveBinaries } from './ffmpeg'
import { analyzePeakVolume } from './normalize'

type ProgressListener = (percent: number, etaSec: number | null) => void

interface Entry {
    key: string
    request: PeakRequest
    state: PeakState
    promise: Promise<PeakResult>
    resolve: (result: PeakResult) => void
    reject: (error: Error) => void
    listeners: Set<ProgressListener>
}

export function clampConcurrency(value: number | undefined): number {
    return Math.min(4, Math.max(1, Math.round(value || 2)))
}

/**
 * Führt Peak-Analysen im Hintergrund aus (z. B. direkt nach dem Einlesen) und merkt sich die Ergebnisse.
 * Beim Anwenden wird ein vorhandenes Ergebnis wiederverwendet, eine wartende Analyse vorgezogen.
 */
export class PeakService {
    private entries = new Map<string, Entry>()
    private queue: Entry[] = []
    private running = 0
    private children = new Set<ChildProcess>()

    constructor(
        private getSettings: () => Settings,
        private onUpdate: (update: PeakUpdate) => void
    ) {}

    /** Stellt Analysen in die Warteschlange; bereits bekannte werden ignoriert. */
    prefetch(requests: PeakRequest[]): void {
        requests.forEach((request) => this.ensure(request))
        this.pump()
    }

    /** Liefert das Ergebnis; eine noch wartende Analyse wird an den Anfang der Warteschlange gestellt. */
    async get(request: PeakRequest, onProgress?: ProgressListener): Promise<PeakResult> {
        const entry = this.ensure(request)
        if (entry.state.status === 'queued') {
            this.queue = [entry, ...this.queue.filter((queued) => queued !== entry)]
        }
        if (onProgress) entry.listeners.add(onProgress)
        this.pump()
        try {
            return await entry.promise
        } finally {
            if (onProgress) entry.listeners.delete(onProgress)
        }
    }

    killAll(): void {
        this.queue = []
        this.children.forEach((child) => child.kill())
    }

    private ensure(request: PeakRequest): Entry {
        const key = peakKey(request)
        const existing = this.entries.get(key)
        if (existing) return existing

        let resolve!: (result: PeakResult) => void
        let reject!: (error: Error) => void
        const promise = new Promise<PeakResult>((res, rej) => {
            resolve = res
            reject = rej
        })
        // Vorab-Analysen ohne Abnehmer sollen keine "unhandled rejection" auslösen
        promise.catch(() => undefined)

        const entry: Entry = { key, request, state: { status: 'queued', percent: 0 }, promise, resolve, reject, listeners: new Set() }
        this.entries.set(key, entry)
        this.queue.push(entry)
        this.update(entry, entry.state)
        return entry
    }

    private pump(): void {
        const limit = clampConcurrency(this.getSettings().concurrency)
        while (this.running < limit && this.queue.length > 0) {
            void this.start(this.queue.shift()!)
        }
    }

    private async start(entry: Entry): Promise<void> {
        this.running++
        const { inputPath, trackIndex, durationSec } = entry.request
        this.update(entry, { status: 'running', percent: 0 })

        try {
            const result = await analyzePeakVolume(
                resolveBinaries(this.getSettings()).ffmpeg,
                inputPath,
                trackIndex,
                (outTimeSec, speed) => {
                    const percent = durationSec > 0 ? Math.min(100, (outTimeSec / durationSec) * 100) : 0
                    const etaSec = speed && durationSec > 0 ? Math.max(0, (durationSec - outTimeSec) / speed) : null
                    entry.state = { status: 'running', percent }
                    entry.listeners.forEach((listener) => listener(percent, etaSec))
                },
                (child) => {
                    this.children.add(child)
                    child.once('close', () => this.children.delete(child))
                }
            )
            this.update(entry, { status: 'done', maxVolume: result.maxVolume })
            entry.resolve(result)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            // Fehlgeschlagene Analysen nicht merken, damit ein späterer Versuch neu startet
            this.entries.delete(entry.key)
            this.update(entry, { status: 'error', error: message })
            entry.reject(error instanceof Error ? error : new Error(message))
        } finally {
            this.running--
            this.pump()
        }
    }

    private update(entry: Entry, state: PeakState): void {
        entry.state = state
        this.onUpdate({ key: entry.key, state })
    }
}
