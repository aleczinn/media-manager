export interface PeakResult {
    maxVolume: number
    /** Benötigte Verstärkung bis 0 dBFS */
    gainNeeded: number
}

/** Was für eine Peak-Analyse gebraucht wird; identifiziert über Pfad, Größe und Tonspur */
export interface PeakRequest {
    inputPath: string
    size: number
    trackIndex: number
    durationSec: number
}

export type PeakState =
    | { status: 'queued'; percent: number }
    | { status: 'running'; percent: number }
    | { status: 'done'; maxVolume: number }
    | { status: 'error'; error: string }

export interface PeakUpdate {
    key: string
    state: PeakState
}

export function peakKey({ inputPath, size, trackIndex }: Pick<PeakRequest, 'inputPath' | 'size' | 'trackIndex'>): string {
    return `${inputPath}|${size}|${trackIndex}`
}

/** Entscheidet wie im alten Projekt: erst ab Mindest-Gain normalisieren, Gain auf Maximum begrenzen. */
export function decideGain(peak: PeakResult, minGain: number, maxGain: number): number | null {
    if (peak.gainNeeded <= minGain) return null
    return Math.min(peak.gainNeeded, maxGain)
}
