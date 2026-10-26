import fs from 'node:fs/promises'
import mediaInfoFactory, { type MediaInfo } from 'mediainfo.js'
import type { AudioTrackInfo, FileAnalysis, MediaFile, SubtitleTrackInfo, VideoTrackInfo } from '../shared/types'
import { runProcess } from './ffmpeg'

interface FfprobeStream {
    index: number
    codec_type: string
    codec_name?: string
    profile?: string
    channels?: number
    tags?: Record<string, string>
    disposition?: Record<string, number>
}

interface FfprobeResult {
    streams?: FfprobeStream[]
    format?: { duration?: string }
}

type MediaInfoTrack = Record<string, unknown> & { '@type': string; StreamOrder?: string }

async function runFfprobe(ffprobe: string, file: string): Promise<FfprobeResult> {
    const { code, stdout, stderrTail } = await runProcess(ffprobe, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        file
    ])
    if (code !== 0) throw new Error(stderrTail.join('\n') || `ffprobe beendet mit Code ${code}`)
    return JSON.parse(stdout) as FfprobeResult
}

let mediaInfoPromise: Promise<MediaInfo<'object'>> | null = null
let mediaInfoQueue: Promise<unknown> = Promise.resolve()

/** mediainfo.js darf nicht parallel analysieren, daher eine Instanz mit Warteschlange. */
async function runMediaInfo(file: string): Promise<MediaInfoTrack[]> {
    mediaInfoPromise ??= mediaInfoFactory({ format: 'object', chunkSize: 1024 * 1024 })
    const mediaInfo = await mediaInfoPromise

    const task = mediaInfoQueue.then(async () => {
        const handle = await fs.open(file, 'r')
        try {
            const { size } = await handle.stat()
            const result = await mediaInfo.analyzeData(size, async (chunkSize, offset) => {
                const buffer = Buffer.alloc(chunkSize)
                const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset)
                return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead)
            })
            return (result.media?.track ?? []) as unknown as MediaInfoTrack[]
        } finally {
            await handle.close()
        }
    })
    mediaInfoQueue = task.catch(() => undefined)
    return task
}

const str = (value: unknown): string => (value === undefined || value === null ? '' : String(value))
const flag = (stream: FfprobeStream, key: string): boolean => stream.disposition?.[key] === 1

/**
 * Liest die Spuren einer Datei. Grundlage sind die ffprobe-Streams (das sieht ffmpeg später),
 * angereichert mit den genaueren MediaInfo-Feldern (Atmos, DTS:X, DTS-HD MA …).
 */
export async function analyzeFile(file: MediaFile, ffprobe: string): Promise<FileAnalysis> {
    const [probe, mediaInfoTracks] = await Promise.all([
        runFfprobe(ffprobe, file.fullPath),
        runMediaInfo(file.fullPath).catch((error) => {
            console.warn(`MediaInfo fehlgeschlagen für ${file.fullPath}:`, error)
            return [] as MediaInfoTrack[]
        })
    ])

    const mediaInfoByOrder = new Map<number, MediaInfoTrack>()
    for (const track of mediaInfoTracks) {
        if (track['@type'] === 'General' || track.StreamOrder === undefined) continue
        const order = parseInt(track.StreamOrder, 10)
        if (!Number.isNaN(order) && !String(track.StreamOrder).includes('-')) mediaInfoByOrder.set(order, track)
    }

    const analysis: FileAnalysis = {
        durationSec: parseFloat(probe.format?.duration ?? '0') || 0,
        video: [],
        audio: [],
        subtitle: []
    }
    const typeCounters = { video: 0, audio: 0, subtitle: 0 }

    for (const stream of probe.streams ?? []) {
        const type = stream.codec_type
        if (type !== 'video' && type !== 'audio' && type !== 'subtitle') continue

        const index = typeCounters[type]++
        const info = mediaInfoByOrder.get(stream.index)
        const title = str(info?.Title) || str(stream.tags?.title)
        const language = str(info?.Language) || str(stream.tags?.language)

        if (type === 'video') {
            // Cover-Bilder (z. B. in MP4) sind keine echten Videospuren
            if (flag(stream, 'attached_pic')) continue
            const video: VideoTrackInfo = { index, title, language, codec: str(stream.codec_name) }
            analysis.video.push(video)
        } else if (type === 'audio') {
            const profile = str(stream.profile)
            const audio: AudioTrackInfo = {
                index,
                title,
                language,
                codecId: str(info?.CodecID) || `${str(stream.codec_name)} ${profile}`.trim(),
                format: str(info?.Format) || str(stream.codec_name),
                formatCommercial: str(info?.Format_Commercial_IfAny) || profile,
                additionalFeatures: str(info?.Format_AdditionalFeatures),
                channels: Number(info?.Channels ?? stream.channels ?? 0) || stream.channels || 0,
                default: flag(stream, 'default')
            }
            analysis.audio.push(audio)
        } else {
            const subtitle: SubtitleTrackInfo = {
                index,
                title,
                language,
                codecId: str(info?.CodecID) || str(stream.codec_name),
                default: flag(stream, 'default'),
                forced: flag(stream, 'forced'),
                hearingImpaired: flag(stream, 'hearing_impaired'),
                visualImpaired: flag(stream, 'visual_impaired'),
                original: flag(stream, 'original'),
                dub: flag(stream, 'dub'),
                commentary: flag(stream, 'comment'),
                lyrics: flag(stream, 'lyrics'),
                karaoke: flag(stream, 'karaoke')
            }
            analysis.subtitle.push(subtitle)
        }
    }

    return analysis
}
