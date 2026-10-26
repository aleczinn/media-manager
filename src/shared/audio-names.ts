import type { AudioTrackInfo } from './types'

type AudioTypeSource = Pick<AudioTrackInfo, 'title' | 'codecId' | 'format' | 'formatCommercial' | 'additionalFeatures' | 'channels'>

/**
 * Liefert einen Schlüssel wie `eac3_atmos_5` (mit Kanälen) bzw. `eac3_atmos` (ohne).
 * Kanal-Suffix: 2 → 2, sonst Kanäle − 1 (6 → 5, 8 → 7).
 */
export function getAudioType(track: AudioTypeSource, withChannel = true): string {
    const title = (track.title || '').toLowerCase()
    const codecId = (track.codecId || track.format || '').toLowerCase()
    const format = (track.format || '').toLowerCase()
    const additionalFeatures = (track.additionalFeatures || '').toLowerCase()
    const commercial = (track.formatCommercial || '').toLowerCase()
    const isAtmos =
        additionalFeatures.includes('joc') ||
        additionalFeatures.includes('16-ch') ||
        additionalFeatures.includes('atmos') ||
        commercial.includes('atmos') ||
        title.includes('atmos')
    const channels = track.channels === 2 ? track.channels : track.channels - 1

    let name = ''

    if (codecId.includes('truehd')) {
        name = isAtmos ? 'truehd_atmos' : 'truehd'
    } else if (codecId.includes('eac3') || codecId.includes('e-ac-3') || codecId.includes('ec-3')) {
        name = isAtmos ? 'eac3_atmos' : 'eac3'
    } else if (codecId.includes('ac3') || codecId.includes('ac-3')) {
        name = 'ac3'
    } else if (codecId.includes('dts')) {
        // MediaInfo meldet DTS:X als "XLL X"; das alte Projekt prüfte (vermutlich vertippt) auf "xxl x"
        if (additionalFeatures.includes('xll x') || additionalFeatures.includes('xxl x') || commercial.includes('dts:x')) {
            name = 'dts_x'
        } else if (codecId.includes('dts-hd ma') || commercial.includes('dts-hd master audio') || commercial.includes('dts-hd ma')) {
            name = 'dts_hd_ma'
        } else if (codecId.includes('dts-hd hr') || commercial.includes('dts-hd high resolution') || commercial.includes('dts-hd hra')) {
            name = 'dts_hd_hr'
        } else {
            name = 'dts'
        }
    } else if (codecId.includes('aac') || format.includes('aac')) {
        name = 'aac'
    } else if (codecId.includes('opus') || format.includes('opus')) {
        name = 'opus'
    } else if (codecId.includes('pcm') || format.includes('pcm')) {
        name = 'pcm'
    }

    return withChannel ? `${name}_${channels}` : name
}

const AUDIO_TRACK_NAMES: Record<string, string> = {
    truehd_atmos_7: 'Dolby TrueHD Atmos 7.1',
    truehd_atmos_5: 'Dolby TrueHD Atmos 5.1',
    truehd_7: 'Dolby TrueHD 7.1',
    truehd_5: 'Dolby TrueHD 5.1',
    truehd_2: 'Dolby TrueHD Stereo',
    eac3_atmos_7: 'Dolby Digital Plus Atmos 7.1',
    eac3_atmos_5: 'Dolby Digital Plus Atmos 5.1',
    eac3_7: 'Dolby Digital Plus 7.1',
    eac3_5: 'Dolby Digital Plus 5.1',
    eac3_2: 'Dolby Digital Plus Stereo',
    ac3_5: 'Dolby Digital 5.1',
    ac3_2: 'Dolby Stereo',
    dts_x_7: 'DTS:X 7.1',
    dts_x_5: 'DTS:X 5.1',
    dts_hd_ma_7: 'DTS-HD MA 7.1',
    dts_hd_ma_5: 'DTS-HD MA 5.1',
    dts_hd_ma_2: 'DTS-HD MA Stereo',
    dts_hd_hr_7: 'DTS-HD HR 7.1',
    dts_hd_hr_5: 'DTS-HD HR 5.1',
    dts_hd_hr_2: 'DTS-HD HR Stereo',
    dts_5: 'DTS 5.1',
    dts_2: 'DTS Stereo',
    opus_5: 'Opus 5.1',
    opus_2: 'Stereo',
    aac_5: 'AAC 5.1',
    aac_2: 'Stereo',
    pcm_2: 'Stereo'
}

/** Anzeigename für einen Audio-Typ oder `null`, wenn der Typ unbekannt ist. */
export function getAudioTrackName(type: string): string | null {
    return AUDIO_TRACK_NAMES[type] ?? null
}
