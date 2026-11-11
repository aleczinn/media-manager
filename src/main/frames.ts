import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileKey } from '../shared/peak'
import type { Settings, VideoFrame } from '../shared/types'
import { resolveBinaries, runProcess } from './ffmpeg'
import { allowLocalImage } from './local-images'

/** Stellen im Video (Anteil der Laufzeit); die erste ist das Standardbild für geteilte Folgen */
export const FRAME_POSITIONS = [1 / 3, 0.2, 0.5, 0.65, 0.8]

const frames = new Map<string, Promise<VideoFrame[]>>()

/**
 * Zieht einige Standbilder aus einem Video (als Ersatz, wenn TMDB für einen Teil kein Bild hat).
 * Die JPGs landen im Temp-Ordner und werden bis zum Programmende gemerkt; Fehler werden nicht gemerkt.
 */
export function extractFrames(settings: Settings, file: { inputPath: string; size: number; durationSec: number }): Promise<VideoFrame[]> {
    const key = fileKey(file)
    let result = frames.get(key)
    if (!result) {
        result = extract(settings, file)
        frames.set(key, result)
        result.catch(() => frames.delete(key))
    }
    return result
}

async function extract(settings: Settings, file: { inputPath: string; size: number; durationSec: number }): Promise<VideoFrame[]> {
    if (!(file.durationSec > 0)) throw new Error('Laufzeit unbekannt, kein Standbild möglich')
    const { ffmpeg } = resolveBinaries(settings)
    const hash = crypto.createHash('sha1').update(fileKey(file)).digest('hex').slice(0, 16)
    const dir = path.join(os.tmpdir(), 'media-manager-frames', hash)
    await fsp.mkdir(dir, { recursive: true })

    return Promise.all(
        FRAME_POSITIONS.map(async (position) => {
            const target = path.join(dir, `frame-${Math.round(position * 100)}.jpg`)
            // -ss vor -i springt schnell zum nächsten Keyframe davor und dekodiert nur bis zur Stelle
            const { code, stderrTail } = await runProcess(ffmpeg, [
                '-v',
                'error',
                '-y',
                '-ss',
                (file.durationSec * position).toFixed(2),
                '-i',
                file.inputPath,
                '-frames:v',
                '1',
                '-vf',
                'scale=1280:-2',
                '-q:v',
                '3',
                target
            ])
            if (code !== 0) throw new Error(stderrTail.slice(-3).join('\n') || `ffmpeg beendet mit Code ${code}`)
            allowLocalImage(target)
            return { position, path: target }
        })
    )
}
