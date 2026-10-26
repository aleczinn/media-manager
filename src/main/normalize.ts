import type { ChildProcess } from 'node:child_process'
import type { PeakResult } from '../shared/peak'
import { parseProgressLine, runProcess } from './ffmpeg'

/** Ermittelt den Spitzenpegel einer Tonspur mit `volumedetect`. */
export async function analyzePeakVolume(
    ffmpeg: string,
    inputPath: string,
    trackIndex: number,
    onProgress: (outTimeSec: number, speed: number | null) => void,
    onSpawn: (child: ChildProcess) => void
): Promise<PeakResult> {
    let maxVolume: number | null = null
    let speed: number | null = null

    const { code, stderrTail } = await runProcess(
        ffmpeg,
        [
            '-hide_banner',
            '-nostdin',
            '-i',
            inputPath,
            '-map',
            `0:a:${trackIndex}`,
            '-af',
            'volumedetect',
            '-progress',
            'pipe:1',
            '-nostats',
            '-f',
            'null',
            '-'
        ],
        {
            onSpawn,
            onStdoutLine: (line) => {
                const progress = parseProgressLine(line)
                if (progress.speed !== undefined) speed = progress.speed
                if (progress.outTimeSec !== undefined) onProgress(progress.outTimeSec, speed)
            },
            onStderrLine: (line) => {
                const match = line.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
                if (match) maxVolume = parseFloat(match[1])
            }
        }
    )

    if (code !== 0) throw new Error(`Peak-Analyse fehlgeschlagen: ${stderrTail.slice(-3).join(' ')}`)
    if (maxVolume === null) throw new Error('Peak-Analyse lieferte keinen Wert')
    return { maxVolume, gainNeeded: -maxVolume }
}
