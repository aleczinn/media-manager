import { getAudioTrackName, getAudioType } from './audio-names'
import { getLanguageName, normalizeLanguage } from './languages'
import type { AudioTrackInfo, FileAnalysis, Settings, SubtitleTrackInfo, SubtitleType, VideoTrackInfo } from './types'

export interface PlannedVideo {
    source: VideoTrackInfo
    title: string
}

export interface PlannedAudio {
    source: AudioTrackInfo
    title: string
    language: string
}

export interface PlannedSubtitle {
    source: SubtitleTrackInfo
    title: string
    language: string
    dispositions: string[]
}

export interface NormalizeCandidate {
    source: AudioTrackInfo
    /** Titel der neuen AC3-Spur inkl. Branding */
    title: string
    language: string
    bitrate: '384k' | '640k'
}

export interface TrackPlan {
    video: PlannedVideo[]
    audio: PlannedAudio[]
    subtitle: PlannedSubtitle[]
    /** Spur, die normalisiert werden würde (Gain steht erst nach der Analyse fest) */
    normalize: NormalizeCandidate | null
    /** Grund, warum nicht normalisiert wird (nur wenn Normalisierung aktiv ist) */
    normalizeSkipReason: string | null
}

/** Rangfolge in einer Liste, unbekannte Werte landen hinten. */
function rank(list: string[], value: string): number {
    const index = list.indexOf(value)
    return index === -1 ? list.length : index
}

export function getSubtitleFormat(track: SubtitleTrackInfo): string {
    const codec = (track.codecId || '').toLowerCase()

    if (codec.includes('pgs') || codec.includes('s_hdmv')) return 'pgs'
    if (
        codec.includes('srt') ||
        codec.includes('subrip') ||
        codec.includes('s_text/utf8') ||
        codec.includes('tx3g') ||
        codec.includes('mov_text')
    )
        return 'srt'
    if (codec.includes('ass') || codec.includes('s_ssa') || codec.includes('s_text/ass')) return 'ass'
    if (codec.includes('vobsub') || codec.includes('dvd_subtitle')) return 'vobsub'

    return codec
}

/** Normale Untertitel haben 10–20 Einträge pro Minute, Forced-Spuren nur vereinzelte */
export const FORCED_MAX_EVENTS_PER_MINUTE = 1.5

/** Reihenfolge beim Durchschalten in der Oberfläche */
export const SUBTITLE_TYPES: SubtitleType[] = ['normal', 'forced', 'sdh', 'cc']

/**
 * Woher der Typ stammt:
 * - `override`: manuell in der Oberfläche gewählt
 * - `file`: steht so in der Datei (Flag oder Titel) bzw. normal
 * - `detected`: von der App erkannt (wenige Einträge, Hinweis im Dateinamen)
 */
export type SubtitleTypeSource = 'override' | 'file' | 'detected'

export interface ResolvedSubtitleType {
    type: SubtitleType
    source: SubtitleTypeSource
}

function isSparse(track: SubtitleTrackInfo, durationSec: number): boolean {
    return track.eventCount !== null && durationSec > 0 && track.eventCount / (durationSec / 60) < FORCED_MAX_EVENTS_PER_MINUTE
}

/** Bestimmt den Typ einer Untertitelspur. Eine manuelle Wahl gewinnt immer. */
export function resolveSubtitleType(track: SubtitleTrackInfo, durationSec: number): ResolvedSubtitleType {
    if (track.typeOverride) return { type: track.typeOverride, source: 'override' }

    const title = (track.title || '').toLowerCase()
    if (track.forced || title.includes('forced') || title.includes('erzwungen')) return { type: 'forced', source: 'file' }
    if (track.filenameForced || isSparse(track, durationSec)) return { type: 'forced', source: 'detected' }
    if (track.hearingImpaired || title.includes('sdh') || title.includes('hearing impaired')) return { type: 'sdh', source: 'file' }
    if (track.filenameSdh) return { type: 'sdh', source: 'detected' }
    if (title.includes('cc')) return { type: 'cc', source: 'file' }
    return { type: 'normal', source: 'file' }
}

/** Typ ohne manuelle Wahl (zum Vergleich beim Durchschalten) */
export function autoSubtitleType(track: SubtitleTrackInfo, durationSec: number): ResolvedSubtitleType {
    return resolveSubtitleType({ ...track, typeOverride: undefined }, durationSec)
}

function subtitleTitle(language: string, type: SubtitleType): string {
    const name = getLanguageName(language)
    if (type === 'forced') return `${name} ${language === 'de' ? 'Erzwungen' : 'Forced'}`
    if (type === 'sdh') return `${name} SDH`
    if (type === 'cc') return `${name} CC`
    return name
}

function subtitleDispositions(track: SubtitleTrackInfo, type: SubtitleType): string[] {
    const dispositions: string[] = []
    if (type === 'forced') dispositions.push('forced')
    if (type === 'sdh') dispositions.push('hearing_impaired')
    if (track.visualImpaired) dispositions.push('visual_impaired')
    if (track.dub) dispositions.push('dub')
    if (track.karaoke) dispositions.push('karaoke')
    if (track.commentary) dispositions.push('comment')
    if (track.lyrics) dispositions.push('lyrics')
    return dispositions
}

function planAudio(tracks: AudioTrackInfo[], settings: Settings): PlannedAudio[] {
    const { pipeline, languages, audioOrder, unknownLanguage } = settings

    let audio = tracks.map((source) => ({ source, language: normalizeLanguage(source.language, unknownLanguage) }))

    if (pipeline.filterLanguages) {
        audio = audio.filter((track) => languages.includes(track.language))
    }

    if (pipeline.sortTracks) {
        audio.sort((a, b) => {
            const langDiff = rank(languages, a.language) - rank(languages, b.language)
            if (langDiff !== 0) return langDiff

            // Mehr Kanäle zuerst
            const channelDiff = (b.source.channels || 0) - (a.source.channels || 0)
            if (channelDiff !== 0) return channelDiff

            const formatDiff = rank(audioOrder, getAudioType(a.source, false)) - rank(audioOrder, getAudioType(b.source, false))
            if (formatDiff !== 0) return formatDiff

            return (a.source.title || '').toLowerCase().localeCompare((b.source.title || '').toLowerCase())
        })
    }

    return audio.map(({ source, language }) => ({
        source,
        language,
        // Unbekannte Formate behalten ihren Originaltitel
        title: pipeline.renameTracks ? (getAudioTrackName(getAudioType(source)) ?? source.title) : source.title
    }))
}

function planSubtitles(tracks: SubtitleTrackInfo[], settings: Settings, durationSec: number): PlannedSubtitle[] {
    const { pipeline, languages, subtitlePriority, subtitleOrder, unknownLanguage } = settings

    let subtitles = tracks
        .filter((source) => pipeline.mergeSubtitles || source.inputIndex === 0)
        .map((source) => ({
            source,
            language: normalizeLanguage(source.language, unknownLanguage),
            type: resolveSubtitleType(source, durationSec).type
        }))

    if (pipeline.filterLanguages) {
        subtitles = subtitles.filter((track) => languages.includes(track.language))
    }

    if (pipeline.sortTracks) {
        subtitles.sort((a, b) => {
            const langDiff = rank(languages, a.language) - rank(languages, b.language)
            if (langDiff !== 0) return langDiff

            const typeDiff = rank(subtitlePriority, a.type) - rank(subtitlePriority, b.type)
            if (typeDiff !== 0) return typeDiff

            return rank(subtitleOrder, getSubtitleFormat(a.source)) - rank(subtitleOrder, getSubtitleFormat(b.source))
        })
    }

    if (pipeline.dedupeSubtitles) {
        // Bei aktiver Sortierung steht die beste Spur je Sprache + Typ vorne
        const seen = new Set<string>()
        subtitles = subtitles.filter((track) => {
            const key = `${track.language}-${track.type}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }

    return subtitles.map(({ source, language, type }) => ({
        source,
        language,
        title: pipeline.renameTracks ? subtitleTitle(language, type) : source.title,
        dispositions: subtitleDispositions(source, type)
    }))
}

function planNormalize(audio: PlannedAudio[], settings: Settings): Pick<TrackPlan, 'normalize' | 'normalizeSkipReason'> {
    if (!settings.pipeline.normalize) return { normalize: null, normalizeSkipReason: null }

    const first = audio[0]
    if (!first) return { normalize: null, normalizeSkipReason: 'Keine Tonspur vorhanden' }

    const type = getAudioType(first.source, false)
    const channels = first.source.channels

    if (!settings.normalizeFormats.includes(type) || !settings.normalizeChannels.includes(channels)) {
        const label = getAudioTrackName(getAudioType(first.source)) ?? (type || first.source.codecId || 'unbekannt')
        return {
            normalize: null,
            normalizeSkipReason: `Format nicht unterstützt: ${label} (${channels} Kanäle)`
        }
    }

    const stereo = channels === 2
    const title = `${stereo ? 'Dolby Stereo' : 'Dolby Digital 5.1'} ${settings.audioBranding}`.trim()

    return {
        normalize: { source: first.source, title, language: first.language, bitrate: stereo ? '384k' : '640k' },
        normalizeSkipReason: null
    }
}

/** Berechnet, welche Spuren in welcher Reihenfolge und mit welchen Titeln in der Ausgabe landen. */
export function planTracks(analysis: FileAnalysis, settings: Settings): TrackPlan {
    const video = analysis.video.map((source) => ({ source, title: settings.pipeline.cleanMetadata ? '' : source.title }))
    const audio = planAudio(analysis.audio, settings)
    const subtitle = planSubtitles(analysis.subtitle, settings, analysis.durationSec)

    return { video, audio, subtitle, ...planNormalize(audio, settings) }
}
