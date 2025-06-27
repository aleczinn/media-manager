import { SubtitleTrack } from '../types/SubtitleTrack'
import { VideoTrack } from '../types/VideoTrack'
import { AudioTrack } from '../types/AudioTrack'

export function getSubtitleFormat(track: SubtitleTrack): string {
    const codec = track.CodecID.toLowerCase()

    if (codec.includes('pgs') || codec.includes('s_hdmv')) return 'pgs'
    if (codec.includes('srt') || codec.includes('subrip') || codec.includes('s_text')) return 'srt'
    if (codec.includes('ass') || codec.includes('s_ssa')) return 'ass'
    if (codec.includes('vobsub') || codec.includes('s_vobsub')) return 'vobsub'

    return codec
}

export function getSubtitleType(track: SubtitleTrack): string {
    const isForced = isForcedSubtitle(track)
    const isSDH = isSDHSubtitle(track)
    const isCC = isCCSubtitle(track)

    let type: string
    if (isForced) {
        type = 'forced'
    } else if (isSDH) {
        type = 'sdh'
    } else if (isCC) {
        type = 'cc'
    } else {
        type = 'normal'
    }
    return type
}

export function isDefaultTrack(track: VideoTrack | AudioTrack | SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('default') || track.Default === 'Yes'
}

export function isForcedSubtitle(track: SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('forced') ||
        title.includes('erzwungen') ||
        track.Forced == 'Yes'
}

export function isSDHSubtitle(track: SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('sdh') ||
        title.includes('hearing impaired') ||
        track.HearingImpaired == 'Yes'
}

export function isCCSubtitle(track: SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('cc')
}

export function getLanguageName(language: string): string {
    const langMap: { [key: string]: string } = {
        'ger': 'Deutsch',
        'deu': 'Deutsch',
        'de': 'Deutsch',
        'eng': 'English',
        'en': 'English',
        'jpa': 'Japanese',
        'jpn': 'Japanese',
        'ja': 'Japanese',
        'fre': 'French',
        'fra': 'French',
        'fr': 'French',
        'spa': 'Spanish',
        'es': 'Spanish',
        'ita': 'Italian',
        'it': 'Italian',
        'rus': 'Russian',
        'ru': 'Russian'
    }
    return langMap[language.toLowerCase()] || language.toUpperCase()
}