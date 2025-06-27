import { AudioTrack } from '../types/AudioTrack'
import { debug } from '../util/logger'
import { filterUnknownLanguageTracks } from '../util/utils'

export function processAudio(tracks: AudioTrack[]): void {
    debug('=== ORIGINAL AUDIO TRACKS ===');
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown';
        const format = getAudioType(track);
        const channels = track.Channels || 0;
        debug(`[${i}] ${lang} ${format} ${channels}ch - "${track.Title}"`);
    });

    filterUnknownLanguageTracks(tracks)

    debug('\n')
}

function getAudioType(track: AudioTrack): string {
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