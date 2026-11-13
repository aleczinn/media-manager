/** YouTube-Download mit yt-dlp: Typen und reine Logik (Formate, Auswahl, Pfade, Fortschritt, Fehler) */

import { YOUTUBE_AUDIO_LANGUAGE } from './youtube'

export type YtVideoCodec = 'av1' | 'vp9' | 'h264'
export type YtAudioCodec = 'opus' | 'aac' | 'mp3'

export const VIDEO_CODEC_LABELS: Record<YtVideoCodec, string> = { av1: 'AV1', vp9: 'VP9', h264: 'H.264' }
export const AUDIO_CODEC_LABELS: Record<YtAudioCodec, string> = { opus: 'Opus', aac: 'AAC', mp3: 'MP3' }
/** Höchstauflösungen in der Auswahl; `null` = beste */
export const MAX_HEIGHTS = [null, 2160, 1440, 1080, 720, 480] as const

/** Ersatz, wenn ein Codec fehlt (in dieser Reihenfolge) */
const VIDEO_FALLBACK: Record<YtVideoCodec, YtVideoCodec[]> = {
    av1: ['av1', 'vp9', 'h264'],
    vp9: ['vp9', 'av1', 'h264'],
    h264: ['h264', 'vp9', 'av1']
}

export interface YtSelection {
    type: 'video' | 'audio'
    videoCodec: YtVideoCodec
    /** Höchste Auflösung (Höhe), `null` = beste */
    maxHeight: number | null
    audioCodec: YtAudioCodec
}

export const DEFAULT_YT_SELECTION: YtSelection = { type: 'video', videoCodec: 'av1', maxHeight: null, audioCodec: 'opus' }

export interface YtFormat {
    id: string
    ext: string
    vcodec: string | null
    acodec: string | null
    width: number | null
    height: number | null
    fps: number | null
    /** kbit/s */
    tbr: number | null
    abr: number | null
    /** Bytes (genau oder geschätzt) */
    filesize: number | null
    language: string | null
    note: string
    hdr: boolean
}

export interface YtVideo {
    id: string
    url: string
    title: string
    channel: string
    durationSec: number | null
    /** YYYYMMDD */
    uploadDate: string | null
    description: string
    thumbnail: string | null
    formats: YtFormat[]
}

export interface YtEntry {
    id: string
    url: string
    title: string
    durationSec: number | null
    thumbnail: string | null
    /** Position in der Playlist (ab 1) */
    index: number
}

/** Ergebnis der Analyse eines Links: Einzelvideo oder Playlist mit ihren Einträgen */
export interface YtSource {
    url: string
    kind: 'video' | 'playlist'
    title: string
    channel: string
    thumbnail: string | null
    entries: YtEntry[]
    /** Bei einem Einzelvideo schon die vollständigen Daten (spart eine zweite Abfrage) */
    video?: YtVideo
}

/** Ein Video, das heruntergeladen werden soll (vom Renderer fertig aufgelöst) */
export interface YtDownloadJob {
    id: string
    url: string
    /** yt-dlp `-f`, z. B. `399+251` */
    formatSpec: string
    /** Nur Audio: Zielformat für `-x --audio-format` */
    audioOnly: YtAudioCodec | null
    /** Endung der fertigen Datei (mkv, opus, m4a, mp3) */
    ext: string
    /** Arbeitsordner (Temp im Output) und Dateiname ohne Endung; Bild und Beschreibung landen gleichnamig daneben */
    workDir: string
    stem: string
    thumbnailUrl: string | null
    /** Beschreibung als .txt; `null` = keine schreiben */
    description: string | null
    /** Geschätzte Größen der einzelnen Teile (Video, Audio) für den Fortschritt */
    partSizes: number[]
    /** Bild der Playlist als folder.jpg (Kandidaten, das erste ladbare gewinnt) … */
    folderImageUrls: string[]
    /** … in diesen Ordner (Output); vorhandene bleiben */
    folderImageDir: string | null
}

export interface YtDownloadOptions {
    concurrency: number
    cookiesFromBrowser: string
    rateLimit: string
}

export interface YtProgress {
    id: string
    phase: 'download' | 'merge' | 'post'
    /** 0–1 über alle Teile */
    fraction: number
    /** Bytes pro Sekunde */
    speed: number | null
    etaSec: number | null
}

export interface YtItemResult {
    id: string
    status: 'ok' | 'skipped' | 'error' | 'cancelled'
    message?: string
    /** Fertige Datei */
    path?: string
}

export interface YtBinaryStatus {
    state: 'checking' | 'downloading' | 'updating' | 'ready' | 'error'
    version: string | null
    /** Eigene Kopie in den App-Daten (wird automatisch aktualisiert) statt eines eingestellten Pfads */
    managed: boolean
    message?: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Analyse-Daten von yt-dlp (-J) einlesen

type Raw = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Bestes Vorschaubild: yt-dlp sortiert aufsteigend nach Qualität */
function bestThumbnail(raw: Raw): string | null {
    const list = Array.isArray(raw.thumbnails) ? (raw.thumbnails as Raw[]) : []
    const best = [...list].reverse().find((thumb) => str(thumb.url) && !/\.webp$/i.test(String(thumb.url)))
    return str(raw.thumbnail) ?? str(best?.url) ?? str(list.at(-1)?.url) ?? null
}

export function parseFormat(raw: Raw): YtFormat {
    const codec = (value: unknown) => {
        const text = str(value)
        return text && text !== 'none' ? text : null
    }
    return {
        id: String(raw.format_id ?? ''),
        ext: String(raw.ext ?? ''),
        vcodec: codec(raw.vcodec),
        acodec: codec(raw.acodec),
        width: num(raw.width),
        height: num(raw.height),
        fps: num(raw.fps),
        tbr: num(raw.tbr),
        abr: num(raw.abr),
        filesize: num(raw.filesize) ?? num(raw.filesize_approx),
        language: str(raw.language),
        note: str(raw.format_note) ?? '',
        hdr: !!str(raw.dynamic_range) && raw.dynamic_range !== 'SDR'
    }
}

export function parseVideo(raw: Raw): YtVideo {
    const id = String(raw.id ?? '')
    return {
        id,
        url: str(raw.webpage_url) ?? `https://www.youtube.com/watch?v=${id}`,
        title: str(raw.title) ?? id,
        channel: str(raw.channel) ?? str(raw.uploader) ?? '',
        durationSec: num(raw.duration),
        uploadDate: str(raw.upload_date),
        description: str(raw.description) ?? '',
        thumbnail: bestThumbnail(raw),
        formats: (Array.isArray(raw.formats) ? (raw.formats as Raw[]) : []).map(parseFormat)
    }
}

/** Ausgabe von `yt-dlp -J --flat-playlist <url>` */
export function parseSource(raw: Raw, url: string): YtSource {
    if (raw._type === 'playlist' || Array.isArray(raw.entries)) {
        const entries = (Array.isArray(raw.entries) ? (raw.entries as Raw[]) : [])
            .filter((entry) => str(entry.id))
            .map((entry, index) => {
                const id = String(entry.id)
                return {
                    id,
                    url: str(entry.url)?.startsWith('http') ? String(entry.url) : `https://www.youtube.com/watch?v=${id}`,
                    title: str(entry.title) ?? id,
                    durationSec: num(entry.duration),
                    thumbnail: bestThumbnail(entry),
                    index: num(entry.playlist_index) ?? index + 1
                }
            })
        return {
            url,
            kind: 'playlist',
            title: str(raw.title) ?? 'Playlist',
            channel: str(raw.channel) ?? str(raw.uploader) ?? '',
            thumbnail: bestThumbnail(raw) ?? entries[0]?.thumbnail ?? null,
            entries
        }
    }
    const video = parseVideo(raw)
    return {
        url,
        kind: 'video',
        title: video.title,
        channel: video.channel,
        thumbnail: video.thumbnail,
        entries: [
            { id: video.id, url: video.url, title: video.title, durationSec: video.durationSec, thumbnail: video.thumbnail, index: 1 }
        ],
        video
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Formate zusammenfassen und Auswahl auflösen

export function videoCodecOf(vcodec: string | null): YtVideoCodec | null {
    if (!vcodec) return null
    if (/^av01/i.test(vcodec)) return 'av1'
    if (/^vp0?9/i.test(vcodec)) return 'vp9'
    if (/^(avc1|h264)/i.test(vcodec)) return 'h264'
    return null
}

export function audioCodecOf(acodec: string | null): 'opus' | 'aac' | null {
    if (!acodec) return null
    if (/^opus/i.test(acodec)) return 'opus'
    if (/^mp4a/i.test(acodec)) return 'aac'
    return null
}

const isVideoOnly = (format: YtFormat) => !!videoCodecOf(format.vcodec) && !format.acodec && format.ext !== 'mhtml'
/** DRC-Spuren (Lautstärke komprimiert) nur, wenn es nichts anderes gibt */
const isAudioOnly = (format: YtFormat) => !format.vcodec && !!audioCodecOf(format.acodec) && !format.id.endsWith('-drc')
const bitrate = (format: YtFormat) => format.tbr ?? format.abr ?? 0

export interface YtFormatSummary {
    /** Verfügbare Video-Codecs mit ihrer höchsten Auflösung */
    video: { codec: YtVideoCodec; maxHeight: number; maxFps: number | null }[]
    audio: { codec: 'opus' | 'aac'; maxBitrate: number }[]
    /** Sprachen der Tonspuren (bei Videos mit mehreren) */
    languages: string[]
}

export function summarizeFormats(formats: YtFormat[]): YtFormatSummary {
    const video = new Map<YtVideoCodec, { codec: YtVideoCodec; maxHeight: number; maxFps: number | null }>()
    for (const format of formats.filter(isVideoOnly)) {
        const codec = videoCodecOf(format.vcodec)!
        const current = video.get(codec) ?? { codec, maxHeight: 0, maxFps: null }
        current.maxHeight = Math.max(current.maxHeight, format.height ?? 0)
        if (format.fps) current.maxFps = Math.max(current.maxFps ?? 0, format.fps)
        video.set(codec, current)
    }
    const audio = new Map<'opus' | 'aac', { codec: 'opus' | 'aac'; maxBitrate: number }>()
    for (const format of formats.filter(isAudioOnly)) {
        const codec = audioCodecOf(format.acodec)!
        const current = audio.get(codec) ?? { codec, maxBitrate: 0 }
        current.maxBitrate = Math.max(current.maxBitrate, Math.round(bitrate(format)))
        audio.set(codec, current)
    }
    const languages = [
        ...new Set(
            formats
                .filter(isAudioOnly)
                .map((format) => format.language?.split('-')[0])
                .filter((l): l is string => !!l)
        )
    ]
    const order: YtVideoCodec[] = ['av1', 'vp9', 'h264']
    return {
        video: order.flatMap((codec) => (video.has(codec) ? [video.get(codec)!] : [])),
        audio: [...audio.values()],
        languages
    }
}

export interface YtResolved {
    formatSpec: string
    audioOnly: YtAudioCodec | null
    ext: string
    /** Kurzbeschreibung, z. B. `AV1 2160p60 + Opus 128k (de)` */
    label: string
    /** Hinweis, wenn etwas anderes als gewünscht genommen wurde */
    notice: string | null
    partSizes: number[]
    estimatedSize: number | null
}

const estimate = (format: YtFormat, durationSec: number | null) =>
    format.filesize ?? (format.tbr && durationSec ? Math.round((format.tbr * 1000 * durationSec) / 8) : 0)

/** Beste Tonspur: deutsche bevorzugt, sonst die Originalspur, dann der gewünschte Codec und die höchste Bitrate */
function pickAudio(formats: YtFormat[], codec: YtAudioCodec): YtFormat | null {
    let candidates = formats.filter(isAudioOnly)
    if (candidates.length === 0) candidates = formats.filter((format) => !format.vcodec && !!audioCodecOf(format.acodec))
    if (candidates.length === 0) return null

    const german = candidates.filter((format) => format.language?.split('-')[0] === YOUTUBE_AUDIO_LANGUAGE)
    const original = candidates.filter((format) => /original/i.test(format.note))
    const pool = german.length > 0 ? german : original.length > 0 ? original : candidates
    const wanted = codec === 'aac' ? 'aac' : 'opus'
    const byCodec = pool.filter((format) => audioCodecOf(format.acodec) === wanted)
    return [...(byCodec.length > 0 ? byCodec : pool)].sort((a, b) => bitrate(b) - bitrate(a))[0]
}

function audioLabel(format: YtFormat): string {
    const codec = audioCodecOf(format.acodec)
    const kbit = bitrate(format)
    const language = format.language?.split('-')[0]
    return `${codec ? AUDIO_CODEC_LABELS[codec] : format.acodec}${kbit ? ` ${Math.round(kbit)}k` : ''}${language ? ` (${language})` : ''}`
}

function videoLabel(format: YtFormat): string {
    const codec = videoCodecOf(format.vcodec)
    const fps = format.fps && format.fps > 30 ? Math.round(format.fps) : ''
    return `${codec ? VIDEO_CODEC_LABELS[codec] : format.vcodec} ${format.height ?? '?'}p${fps}${format.hdr ? ' HDR' : ''}`
}

/**
 * Macht aus der Auswahl konkrete Format-IDs. Bei Video zählt zuerst die höchste Auflösung bis zur Grenze, dann der
 * gewünschte Codec (sonst der nächstbeste), dann SDR vor HDR, höhere fps und Bitrate. `null` = nichts Passendes.
 */
export function resolveSelection(selection: YtSelection, formats: YtFormat[], durationSec: number | null): YtResolved | null {
    const audio = pickAudio(formats, selection.audioCodec)

    if (selection.type === 'audio') {
        if (!audio) return null
        const source = audioCodecOf(audio.acodec)
        const converted = selection.audioCodec === 'mp3' || source !== selection.audioCodec
        const size = estimate(audio, durationSec)
        return {
            formatSpec: audio.id,
            audioOnly: selection.audioCodec,
            ext: selection.audioCodec === 'aac' ? 'm4a' : selection.audioCodec,
            label: `${audioLabel(audio)}${converted ? ` → ${AUDIO_CODEC_LABELS[selection.audioCodec]}` : ''}`,
            notice:
                converted && selection.audioCodec !== 'mp3'
                    ? `${AUDIO_CODEC_LABELS[selection.audioCodec]} nicht verfügbar, wird umgewandelt`
                    : null,
            partSizes: [size],
            estimatedSize: size || null
        }
    }

    const videos = formats.filter(isVideoOnly).filter((format) => !selection.maxHeight || (format.height ?? 0) <= selection.maxHeight)
    if (videos.length === 0) return null
    const topHeight = Math.max(...videos.map((format) => format.height ?? 0))
    const atTop = videos.filter((format) => (format.height ?? 0) === topHeight)
    const codec = VIDEO_FALLBACK[selection.videoCodec].find((candidate) =>
        atTop.some((format) => videoCodecOf(format.vcodec) === candidate)
    )!
    const video = atTop
        .filter((format) => videoCodecOf(format.vcodec) === codec)
        .sort((a, b) => Number(a.hdr) - Number(b.hdr) || (b.fps ?? 0) - (a.fps ?? 0) || bitrate(b) - bitrate(a))[0]

    let notice: string | null = null
    if (codec !== selection.videoCodec) {
        const wantedTop = Math.max(
            0,
            ...videos.filter((format) => videoCodecOf(format.vcodec) === selection.videoCodec).map((f) => f.height ?? 0)
        )
        notice = wantedTop
            ? `${VIDEO_CODEC_LABELS[selection.videoCodec]} nur bis ${wantedTop}p, ${VIDEO_CODEC_LABELS[codec]} ${topHeight}p genutzt`
            : `${VIDEO_CODEC_LABELS[selection.videoCodec]} nicht verfügbar, ${VIDEO_CODEC_LABELS[codec]} genutzt`
    }
    const partSizes = [estimate(video, durationSec), ...(audio ? [estimate(audio, durationSec)] : [])]
    const total = partSizes.reduce((sum, size) => sum + size, 0)
    return {
        formatSpec: audio ? `${video.id}+${audio.id}` : video.id,
        audioOnly: null,
        ext: 'mkv',
        label: audio ? `${videoLabel(video)} + ${audioLabel(audio)}` : videoLabel(video),
        notice,
        partSizes,
        estimatedSize: total || null
    }
}

/** Zum Überschreiben pro Video: alle Video- und Audio-Formate, beste zuerst */
export function formatChoices(formats: YtFormat[]): { video: (YtFormat & { label: string })[]; audio: (YtFormat & { label: string })[] } {
    const video = formats
        .filter(isVideoOnly)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.fps ?? 0) - (a.fps ?? 0) || bitrate(b) - bitrate(a))
        .map((format) => ({ ...format, label: videoLabel(format) }))
    const audio = formats
        .filter((format) => !format.vcodec && !!audioCodecOf(format.acodec))
        .sort((a, b) => bitrate(b) - bitrate(a))
        .map((format) => ({ ...format, label: `${audioLabel(format)}${format.id.endsWith('-drc') ? ' DRC' : ''}` }))
    return { video, audio }
}

/** Eigene Format-Wahl eines Videos (überschreibt die globale Auswahl) */
export function resolveManual(
    videoId: string | null,
    audioId: string | null,
    formats: YtFormat[],
    durationSec: number | null
): YtResolved | null {
    const choices = formatChoices(formats)
    const video = choices.video.find((format) => format.id === videoId) ?? null
    const audio = choices.audio.find((format) => format.id === audioId) ?? null
    if (!video && !audio) return null
    if (!video) {
        const codec = audioCodecOf(audio!.acodec)!
        return {
            formatSpec: audio!.id,
            audioOnly: codec,
            ext: codec === 'aac' ? 'm4a' : 'opus',
            label: audio!.label,
            notice: null,
            partSizes: [estimate(audio!, durationSec)],
            estimatedSize: estimate(audio!, durationSec) || null
        }
    }
    const partSizes = [estimate(video, durationSec), ...(audio ? [estimate(audio, durationSec)] : [])]
    return {
        formatSpec: audio ? `${video.id}+${audio.id}` : video.id,
        audioOnly: null,
        ext: 'mkv',
        label: audio ? `${video.label} + ${audio.label}` : video.label,
        notice: null,
        partSizes,
        estimatedSize: partSizes.reduce((sum, size) => sum + size, 0) || null
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// Dateinamen

/** Windows-verbotene Zeichen wie yt-dlp durch ähnlich aussehende ersetzen; Emojis und Umlaute bleiben */
const REPLACEMENTS: Record<string, string> = {
    ':': '：',
    '?': '？',
    '"': '＂',
    '*': '＊',
    '<': '＜',
    '>': '＞',
    '|': '｜',
    '/': '⧸',
    '\\': '⧹'
}

export function sanitizeFileName(name: string, maxLength = 150): string {
    let result = name
        .replace(/[:?"*<>|/\\]/g, (char) => REPLACEMENTS[char])
        .replace(/[\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    if ([...result].length > maxLength) result = [...result].slice(0, maxLength).join('').trim()
    result = result.replace(/[. ]+$/, '')
    // Reservierte Gerätenamen
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(result)) result = `_${result}`
    return result || 'Video'
}

/** Dateiname ohne Endung, bei Playlists auf Wunsch mit Nummer davor (`001 - Titel`) */
export function downloadStem(
    entry: { title: string; index: number },
    source: { kind: 'video' | 'playlist'; entryCount: number },
    options: { indexPrefix: boolean }
): string {
    const width = Math.max(2, String(source.entryCount).length)
    const prefix = source.kind === 'playlist' && options.indexPrefix ? `${String(entry.index).padStart(width, '0')} - ` : ''
    return sanitizeFileName(prefix + entry.title)
}

/** Arbeitsordner der Downloads im Output (wird nach der Verarbeitung geleert) */
export const DOWNLOAD_DIR = '.media-manager-download'

// ---------------------------------------------------------------------------------------------------------------------
// Ausgabe von yt-dlp

/** Kennung der Fortschrittszeilen aus `--progress-template` */
export const PROGRESS_PREFIX = 'MMDL'
export const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX} %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s`

export interface ProgressLine {
    downloaded: number
    total: number | null
    speed: number | null
    etaSec: number | null
}

export function parseProgressLine(line: string): ProgressLine | null {
    const parts = line.trim().split(/\s+/)
    if (parts[0] !== PROGRESS_PREFIX || parts.length < 6) return null
    const value = (text: string) => {
        const parsed = Number(text)
        return Number.isFinite(parsed) ? parsed : null
    }
    const downloaded = value(parts[1])
    if (downloaded === null) return null
    return { downloaded, total: value(parts[2]) ?? value(parts[3]), speed: value(parts[4]), etaSec: value(parts[5]) }
}

/** Phase aus den Statuszeilen von yt-dlp */
export function phaseOfLine(line: string): 'merge' | 'post' | null {
    if (/^\[Merger\]/.test(line)) return 'merge'
    if (/^\[(ExtractAudio|FixupM3u8|FixupM4a|VideoConvertor|Metadata)\]/.test(line)) return 'post'
    return null
}

export interface YtError {
    message: string
    /** Lohnt ein automatischer neuer Versuch (Netzwerk) */
    retryable: boolean
}

const ERRORS: { pattern: RegExp; message: string; retryable?: boolean }[] = [
    { pattern: /private video/i, message: 'Privates Video' },
    {
        pattern: /confirm you.re not a bot/i,
        message: 'YouTube verlangt eine Anmeldung („kein Bot“) – in den Einstellungen Cookies aus dem Browser aktivieren'
    },
    {
        pattern: /confirm your age|age.restricted|inappropriate for some users/i,
        message: 'Altersbeschränkt – in den Einstellungen Cookies aus dem Browser aktivieren'
    },
    { pattern: /members.only|join this channel/i, message: 'Nur für Kanalmitglieder' },
    { pattern: /not (made )?available in your country|geo.?restrict/i, message: 'In deinem Land nicht verfügbar' },
    {
        pattern: /premieres in|live event will begin|is upcoming/i,
        message: 'Noch nicht veröffentlicht (Premiere oder geplanter Livestream)'
    },
    { pattern: /requested format is not available/i, message: 'Gewähltes Format nicht mehr verfügbar – Link neu analysieren' },
    {
        pattern: /HTTP Error 429|too many requests/i,
        message: 'Zu viele Anfragen an YouTube (429) – später erneut versuchen',
        retryable: true
    },
    {
        pattern: /video unavailable|this video is unavailable|has been removed|account .* terminated/i,
        message: 'Video nicht (mehr) verfügbar'
    },
    { pattern: /is not a valid URL|unsupported URL/i, message: 'Kein gültiger Link' },
    {
        pattern: /timed out|getaddrinfo|connection|ECONNRESET|HTTP Error 5\d\d|IncompleteRead|unable to download|network/i,
        message: 'Netzwerkfehler',
        retryable: true
    },
    { pattern: /no space left|errno 28/i, message: 'Kein Speicherplatz mehr frei' }
]

/** Verständliche Meldung aus der letzten `ERROR:`-Zeile von yt-dlp */
export function translateError(lines: string[]): YtError {
    const errorLine = [...lines].reverse().find((line) => /^ERROR:/.test(line)) ?? lines.filter((line) => line.trim()).at(-1) ?? ''
    // `ERROR: [youtube] abc123: Text` → `Text`
    const raw = errorLine
        .replace(/^ERROR:\s*/, '')
        .replace(/^\[[^\]]+\]\s*[\w-]+:\s*/, '')
        .trim()
    const known = ERRORS.find((error) => error.pattern.test(raw))
    if (!known) return { message: raw || 'Unbekannter Fehler', retryable: false }
    const detail = known.message === 'Netzwerkfehler' && raw ? `Netzwerkfehler: ${raw}` : known.message
    return { message: detail, retryable: !!known.retryable }
}

/**
 * Bildkandidaten in voller Größe: Playlist-Bilder von YouTube sind kleine, beschnittene Vorschauen eines Videos
 * (`/vi/<id>/hqdefault.jpg?sqp=…`). Davor kommt das große Bild desselben Videos (fehlt bei alten Videos).
 */
export function fullSizeThumbnails(url: string | null): string[] {
    if (!url) return []
    const id = url.match(/\/vi(?:_webp)?\/([\w-]{11})\//)?.[1]
    return id ? [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url] : [url]
}

export type YtLinkMode = 'video' | 'playlist'

/** Meldung, wenn eine Detail-Abfrage verworfen wurde (Video abgewählt oder Link entfernt) */
export const DETAIL_CANCELLED = 'Abfrage verworfen'

/** Video-ID und Playlist-ID aus einem YouTube-Link */
export function parseYoutubeLink(text: string): { videoId: string | null; listId: string | null } {
    try {
        const url = new URL(text.trim())
        const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
        let videoId = url.searchParams.get('v')
        if (host === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0] || null
        const path = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)
        if (path) videoId = path[1]
        return { videoId: videoId && /^[\w-]{11}$/.test(videoId) ? videoId : null, listId: url.searchParams.get('list') }
    } catch {
        return { videoId: null, listId: null }
    }
}

/**
 * Link passend zum Schalter Einzelvideo/Playlist: Ein Video aus einer Playlist (`watch?v=…&list=…`) wird je nach
 * Schalter nur das Video oder die ganze Playlist. `null` = passt nicht (z. B. reine Playlist bei „Einzelvideo“).
 */
export function linkForMode(text: string, mode: YtLinkMode): string | null {
    const { videoId, listId } = parseYoutubeLink(text)
    if (mode === 'playlist') {
        if (listId) return `https://www.youtube.com/playlist?list=${listId}`
        return videoId ? `https://www.youtube.com/watch?v=${videoId}` : text.trim()
    }
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`
    // Andere Seiten als YouTube unverändert, eine reine Playlist passt nicht zu „Einzelvideo“
    return listId ? null : text.trim()
}

/** Grobe Prüfung eines eingegebenen Links (YouTube-Video, Shorts, Playlist, Kanal) */
export function isYoutubeUrl(text: string): boolean {
    return /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(text.trim())
}
