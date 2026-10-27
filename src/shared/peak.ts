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

/**
 * Hintergrund-Scan einer Datei: ein ffmpeg-Lauf, der die Datei einmal komplett liest und dabei
 * den Peak einer Tonspur misst und/oder die Einträge der eingebetteten Untertitel zählt.
 */
export interface ScanRequest {
    inputPath: string
    size: number
    durationSec: number
    /** Tonspur für die Peak-Analyse (`0:a:N`), `null` = kein Peak nötig */
    peakTrackIndex: number | null
    /** Einträge der eingebetteten Untertitel zählen (für die Forced-Erkennung) */
    countSubtitles: boolean
}

/** Ergebnis der Zählung: Einträge je eingebetteter Untertitelspur (`0:s:j`), `null` = Zählung fehlgeschlagen */
export interface SubtitleCountsUpdate {
    fileKey: string
    counts: number[] | null
}

/** Zustand des Hintergrund-Scans einer Datei */
export type ScanStatus = 'queued' | 'running' | 'done' | 'error'

export interface ScanStatusUpdate {
    fileKey: string
    status: ScanStatus
}

export function fileKey({ inputPath, size }: { inputPath: string; size: number }): string {
    return `${inputPath}|${size}`
}

/** Entscheidet wie im alten Projekt: erst ab Mindest-Gain normalisieren, Gain auf Maximum begrenzen. */
export function decideGain(peak: PeakResult, minGain: number, maxGain: number): number | null {
    if (peak.gainNeeded <= minGain) return null
    return Math.min(peak.gainNeeded, maxGain)
}
