import type { ChildProcess } from 'node:child_process'
import { parseProgressLine, runProcess } from './ffmpeg'

export interface ScanOutcome {
    /** Spitzenpegel der Tonspur, `null` wenn nicht angefragt */
    maxVolume: number | null
    /** Einträge je eingebetteter Untertitelspur, `null` wenn nicht angefragt */
    subtitleCounts: number[] | null
}

/**
 * Ein ffmpeg-Lauf für Peak und Untertitel-Zählung. Beide brauchen die ganze Datei,
 * so wird sie nur einmal gelesen. `-v verbose` liefert am Ende die Paketzahlen je Ausgabespur.
 */
export function buildScanArgs(inputPath: string, peakTrackIndex: number | null, countSubtitles: boolean): string[] {
    const args = ['-hide_banner', '-nostdin', '-v', 'verbose', '-progress', 'pipe:1', '-nostats', '-i', inputPath]
    if (peakTrackIndex !== null) args.push('-map', `0:a:${peakTrackIndex}`, '-af', 'volumedetect', '-f', 'null', '-')
    if (countSubtitles) args.push('-map', '0:s?', '-c', 'copy', '-f', 'null', '-')
    return args
}

/** Index der Ausgabe, in der die Untertitel landen (hinter der Peak-Ausgabe) */
export function subtitleOutputIndex(peakTrackIndex: number | null): number {
    return peakTrackIndex !== null ? 1 : 0
}

const MAX_VOLUME = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/
const SUBTITLE_STATS = /Output stream #(\d+):(\d+) \(subtitle\): (\d+) packets muxed/

/** Wertet eine stderr-Zeile aus und trägt Peak bzw. Paketzahl in `outcome` ein */
export function parseScanLine(line: string, outcome: ScanOutcome, subtitleOutput: number): void {
    const volume = line.match(MAX_VOLUME)
    if (volume) outcome.maxVolume = parseFloat(volume[1])

    const stats = line.match(SUBTITLE_STATS)
    if (stats && Number(stats[1]) === subtitleOutput && outcome.subtitleCounts) {
        outcome.subtitleCounts[Number(stats[2])] = Number(stats[3])
    }
}

export async function runScan(
    ffmpeg: string,
    inputPath: string,
    peakTrackIndex: number | null,
    countSubtitles: boolean,
    onProgress: (outTimeSec: number, speed: number | null) => void,
    onSpawn: (child: ChildProcess) => void
): Promise<ScanOutcome> {
    const outcome: ScanOutcome = { maxVolume: null, subtitleCounts: countSubtitles ? [] : null }
    const subtitleOutput = subtitleOutputIndex(peakTrackIndex)
    let speed: number | null = null

    const { code, stderrTail } = await runProcess(ffmpeg, buildScanArgs(inputPath, peakTrackIndex, countSubtitles), {
        onSpawn,
        onStdoutLine: (line) => {
            const progress = parseProgressLine(line)
            if (progress.speed !== undefined) speed = progress.speed
            if (progress.outTimeSec !== undefined) onProgress(progress.outTimeSec, speed)
        },
        onStderrLine: (line) => parseScanLine(line, outcome, subtitleOutput)
    })

    if (code !== 0) throw new Error(`Analyse fehlgeschlagen: ${stderrTail.slice(-3).join(' ')}`)
    if (peakTrackIndex !== null && outcome.maxVolume === null) throw new Error('Peak-Analyse lieferte keinen Wert')
    return outcome
}
