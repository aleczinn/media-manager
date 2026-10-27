import fs from 'node:fs/promises'
import path from 'node:path'
import mediaInfoFactory, { type MediaInfo } from 'mediainfo.js'
import { subtitleHintsFromFilename } from '../shared/external-subs'
import type { AudioTrackInfo, FileAnalysis, MediaFile, SubtitleTrackInfo, VideoTrackInfo } from '../shared/types'
import { runProcess } from './ffmpeg'

interface FfprobeStream {
    index: number
    codec_type: string
    codec_name?: string
    profile?: string
    channels?: number
    nb_read_packets?: string
    tags?: Record<string, string>
    disposition?: Record<string, number>
}

interface FfprobeResult {
    streams?: FfprobeStream[]
    format?: { duration?: string }
}

type MediaInfoTrack = Record<string, unknown> & { '@type': string; StreamOrder?: string }

async function runFfprobe(ffprobe: string, file: string, extraArgs: string[] = []): Promise<FfprobeResult> {
    const { code, stdout, stderrTail } = await runProcess(ffprobe, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        ...extraArgs,
        file
    ])
    if (code !== 0) throw new Error(stderrTail.join('\n') || `ffprobe beendet mit Code ${code}`)
    return JSON.parse(stdout) as FfprobeResult
}

/** Anzahl der Einträge aus den Statistik-Tags (z. B. von mkvmerge geschrieben) */
function taggedEventCount(stream: FfprobeStream): number | null {
    const key = Object.keys(stream.tags ?? {}).find((tag) => /^NUMBER_OF_FRAMES/i.test(tag))
    const count = key ? parseInt(stream.tags![key], 10) : NaN
    return Number.isFinite(count) ? count : null
}

/** Liest eine externe Untertiteldatei; Sprache aus der Datei (z. B. .idx), sonst aus dem Dateinamen */
async function analyzeExternalSubtitle(
    ffprobe: string,
    filePath: string,
    inputIndex: number,
    videoName: string
): Promise<SubtitleTrackInfo[]> {
    const probe = await runFfprobe(ffprobe, filePath, ['-count_packets'])
    const hints = subtitleHintsFromFilename(path.basename(filePath), videoName)

    return (probe.streams ?? [])
        .filter((stream) => stream.codec_type === 'subtitle')
        .map((stream, index) => ({
            inputIndex,
            index,
            externalPath: filePath,
            eventCount: Number.isFinite(parseInt(stream.nb_read_packets ?? '', 10)) ? parseInt(stream.nb_read_packets!, 10) : null,
            title: str(stream.tags?.title),
            language: str(stream.tags?.language) || hints.language || '',
            codecId: str(stream.codec_name),
            default: false,
            forced: flag(stream, 'forced'),
            hearingImpaired: flag(stream, 'hearing_impaired'),
            filenameForced: hints.forced,
            filenameSdh: hints.sdh,
            visualImpaired: false,
            original: false,
            dub: false,
            commentary: false,
            lyrics: false,
            karaoke: false
        }))
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
                inputIndex: 0,
                index,
                eventCount: taggedEventCount(stream),
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

    // Eingebettete Spuren ohne Statistik-Tag behalten `eventCount: null`: Zählen heißt die ganze Datei lesen,
    // das übernimmt der Hintergrund-Scan zusammen mit der Peak-Analyse (scan-service.ts)

    // Externe Untertitel als weitere ffmpeg-Eingaben (1…n)
    const external = await Promise.all(
        (file.externalSubtitles ?? []).map((sub, i) =>
            analyzeExternalSubtitle(ffprobe, sub.path, i + 1, file.name).catch((error) => {
                console.warn(`Externe Untertitel nicht lesbar (${sub.path}):`, error)
                return [] as SubtitleTrackInfo[]
            })
        )
    )
    analysis.subtitle.push(...external.flat())

    return analysis
}
