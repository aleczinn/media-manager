import { decideLayout } from '../shared/stereo3d'
import { fileKey } from '../shared/peak'
import type { Settings, StereoContentResult } from '../shared/types'
import { resolveBinaries, runProcess } from './ffmpeg'

/** Stellen im Film, an denen je ein Frame verglichen wird */
const POSITIONS = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]

const HALVES = {
    sbs: '[0:v]split[a][b];[a]crop=iw/2:ih:0:0[x];[b]crop=iw/2:ih:iw/2:0[y];[x][y]ssim',
    tab: '[0:v]split[a][b];[a]crop=iw:ih/2:0:0[x];[b]crop=iw:ih/2:0:ih/2[y];[x][y]ssim'
}

const results = new Map<string, Promise<StereoContentResult>>()
let queue: Promise<unknown> = Promise.resolve()

/** SSIM der beiden Hälften eines Frames */
async function ssim(ffmpeg: string, inputPath: string, seconds: number, filter: string): Promise<number> {
    const args = [
        '-hide_banner',
        '-nostdin',
        '-ss',
        seconds.toFixed(2),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-filter_complex',
        filter,
        '-f',
        'null',
        '-'
    ]
    const { code, stderrTail } = await runProcess(ffmpeg, args)
    const value = stderrTail.map((line) => line.match(/All:([\d.]+)/)?.[1]).find(Boolean)
    if (code !== 0 || !value) throw new Error(stderrTail.slice(-3).join('\n') || `ffmpeg beendet mit Code ${code}`)
    return Number(value)
}

async function measure(settings: Settings, inputPath: string, durationSec: number): Promise<StereoContentResult> {
    const { ffmpeg } = resolveBinaries(settings)
    const sbs: number[] = []
    const tab: number[] = []
    for (const position of POSITIONS) {
        const seconds = durationSec > 0 ? durationSec * position : 0
        sbs.push(await ssim(ffmpeg, inputPath, seconds, HALVES.sbs))
        tab.push(await ssim(ffmpeg, inputPath, seconds, HALVES.tab))
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    return { layout: decideLayout(sbs, tab), sbs: mean(sbs), tab: mean(tab) }
}

/**
 * Erkennt Side-by-Side bzw. Over-Under am Bildinhalt: Bei 3D sehen sich die beiden Hälften fast gleich.
 * Läuft eine Datei nach der anderen; Ergebnisse bleiben bis zum Programmende gemerkt, Fehler nicht.
 */
export function detectStereoContent(
    settings: Settings,
    file: { inputPath: string; size: number; durationSec: number }
): Promise<StereoContentResult> {
    const key = fileKey(file)
    let result = results.get(key)
    if (!result) {
        result = queue.then(() => measure(settings, file.inputPath, file.durationSec))
        queue = result.catch(() => undefined)
        results.set(key, result)
        result.catch(() => results.delete(key))
    }
    return result
}
