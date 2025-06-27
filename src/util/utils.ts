import { SubtitleTrack } from '../types/SubtitleTrack'
import { VideoTrack } from '../types/VideoTrack'
import { AudioTrack } from '../types/AudioTrack'
import { debug } from './logger'
import { PRESET_LANGUAGES, PRESET_THROW_AWAY_UNKNOWN_TRACKS } from '../new'
import { BaseTrack } from '../types/BaseTrack'

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

function filterUnknownLanguageTracks(tracks: (AudioTrack | SubtitleTrack)[]): void {
    if (PRESET_THROW_AWAY_UNKNOWN_TRACKS) {
        const filteredTracks = tracks.filter((track: AudioTrack | SubtitleTrack) => {
            const language = track.Language || '';
            const isKnownLanguage = PRESET_LANGUAGES.includes(language.toLowerCase());

            if (!isKnownLanguage) {
                debug(`Removing unknown language track: "${track.Title}" (${language})`);
            }

            return isKnownLanguage;
        });

        tracks.length = 0;
        tracks.push(...filteredTracks);
    }
}

export function fixLanguageInTrack(track: (VideoTrack | AudioTrack | SubtitleTrack)): void {
    const language = (track.Language || '').toLowerCase();
    if (language === 'ger' || language === 'deu') {
        track.Language = 'de'
    }
    if (language === 'eng') {
        track.Language = 'en'
    }
    if (language === 'jpn') {
        track.Language = 'ja'
    }
    if (language === 'spa') {
        track.Language = 'es'
    }
    if (language === 'fre') {
        track.Language = 'fr'
    }
    if (language === 'rus') {
        track.Language = 'ru'
    }
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

export function getAudioType(track: AudioTrack): string {
    const title = (track.Title || '').toLowerCase()
    const codecId = (track.CodecID || track.Format || '').toLowerCase()
    const additionalFeatures = (track.Format_AdditionalFeatures || '').toLowerCase()
    const isAtmos = additionalFeatures.includes('joc')
        || additionalFeatures.includes('16-ch')
        || title.includes('atmos')
    const channels = track.Channels === 2 ? track.Channels : (track.Channels - 1);

    let name = ''

    // TrueHD
    if (codecId.includes('truehd')) {
        if (isAtmos) {
            name = 'truehd_atmos'
        }
        name = 'truehd'
    }

    // EAC3 (Dolby Digital Plus)
    if (codecId.includes('eac3')) {
        if (isAtmos) {
            name = 'eac3_atmos'
        }
        name = 'eac3'
    }

    // AC3 (Dolby Digital)
    if (codecId.includes('ac3')) {
        name = 'ac3'
    }

    // DTS Varianten
    if (codecId.includes('dts')) {
        const commercialIfAny = track.Format_Commercial_IfAny.toLowerCase()

        if (additionalFeatures.includes('xxl x') || commercialIfAny.includes('dts:x')) {
            name = 'dts_x'
        }
        if (codecId.includes('dts-hd ma') || commercialIfAny.includes('dts-hd master audio')) {
            name = 'dts_hd_ma'
        }

        if (codecId.includes('dts-hd hr') || commercialIfAny.includes('dts-hd high resolution')) {
            name = 'dts_hd_hr'
        }
        name = 'dts'
    }

    // AAC
    if (codecId.includes('aac')) {
        name = 'aac'
    }
    return `${name}_${channels}`
}

function getAudioTrackName(track: AudioTrack): string {
    const type = getAudioType(track)

    switch (type) {
        case 'truehd_atmos_7': return 'Dolby TrueHD Atmos 7.1'
        case 'truehd_atmos_5': return 'Dolby TrueHD Atmos 5.1'

        case 'truehd_7': return 'Dolby TrueHD 7.1'
        case 'truehd_5': return 'Dolby TrueHD 5.1'
        case 'truehd_2': return 'Dolby TrueHD Stereo'

        case 'eac3_atmos_7': return 'Dolby Digital Plus Atmos 7.1'
        case 'eac3_atmos_5': return 'Dolby Digital Plus Atmos 5.1'

        case 'eac3_7': return 'Dolby Digital Plus 7.1'
        case 'eac3_5': return 'Dolby Digital Plus 5.1'
        case 'eac3_2': return 'Dolby Digital Plus Stereo'

        case 'ac3_5': return 'Dolby Digital 5.1'
        case 'ac3_2': return 'Dolby Digital Stereo'

        case 'dts_x_7': return 'DTS:X 7.1'
        case 'dts_x_5': return 'DTS:X 5.1'
        case 'dts_hd_ma_7': return 'DTS-HD MA 7.1'
        case 'dts_hd_ma_5': return 'DTS-HD MA 5.1'
        case 'dts_hd_ma_2': return 'DTS-HD MA Stereo'
        case 'dts_hd_hr_7': return 'DTS-HD HR 7.1'
        case 'dts_hd_hr_5': return 'DTS-HD HR 5.1'
        case 'dts_hd_hr_2': return 'DTS-HD HR Stereo'
        case 'dts_5': return 'DTS 5.1'
        case 'dts_2': return 'DTS Stereo'

        case 'aac_5': return 'AAC 5.1'
        case 'aac_2': return 'Stereo'
    }
    return 'unknown-audio-name'
}