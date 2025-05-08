import {unlink} from 'fs/promises';
import {preset} from "./index";

const AUDIO_PRIORITY = ['truehd', 'dts-hd ma', 'dts-hd hr', 'dts', 'eac3', 'ac3', 'aac'];
export const SUBTITLE_MAPPING: { [key: string]: string } = {
    'ger_forced': 'Deutsch Erzwungen',
    'ger': 'Deutsch',
    'ger_sdh': 'Deutsch SDH',
    'ger_cc': 'Deutsch CC',
    'eng_forced': 'English Forced',
    'eng': 'English',
    'eng_sdh': 'English SDH',
    'eng_cc': 'English CC',
    'jpn_forced': 'Japanese Forced',
    'jpn': 'Japanese',
    'jpn_sdh': 'Japanese SDH',
    'spa_forced': 'Spanish Forced',
    'spa': 'Spanish',
    'spa_sdh': 'Spanish SDH',
    'fre_forced': 'French Forced',
    'fre': 'French',
    'fre_sdh': 'French SDH',
};

export function getAudioTrackName(audioStream: any): string {
    const codec_name = audioStream?.codec_name;
    const profile = audioStream?.profile;
    const channels = audioStream?.channels;

    const language = audioStream?.tags?.language;
    let titleIncludeAtmos = audioStream?.tags?.title?.toLowerCase().includes('atmos');

    if (language == 'ger' && preset.atmosOverrideDE) {
        titleIncludeAtmos = true;
    }
    if (language == 'eng' && preset.atmosOverrideEN) {
        titleIncludeAtmos = true;
    }

    if (codec_name === 'aac') {
        if (channels == 2) {
            return 'Stereo';
        } else if (channels == 6) {
            return 'AAC 5.1'
        } else {
            return 'AAC Unknown'
        }
    } else if (codec_name === 'truehd') {
        // Could also be TrueHD without atmos
        if (channels == 2) {
            return 'Dolby TrueHD Stereo'
        } else if (channels == 6) {
            if (titleIncludeAtmos) {
                return 'Dolby TrueHD Atmos 5.1';
            } else {
                return 'Dolby TrueHD 5.1';
            }
        } else if (channels == 8) {
            if (titleIncludeAtmos) {
                return 'Dolby TrueHD Atmos 7.1';
            } else {
                return 'Dolby TrueHD 7.1';
            }
        }
    } else if (codec_name === 'eac3') {
        // Could also contain atmos
        if (channels == 2) {
            return 'Dolby Digital Plus Stereo'
        } else if (channels == 6) {
            if (titleIncludeAtmos) {
                return 'Dolby Digital Plus Atmos 5.1'
            } else {
                return 'Dolby Digital Plus 5.1'
            }
        } else if (channels == 8) {
            return 'Dolby Digital Plus 7.1'
        }
    } else if (codec_name === 'ac3') {
        if (channels == 2) {
            return 'Dolby Stereo'
        } else if (channels == 6) {
            return 'Dolby Digital 5.1'
        }
    } else if (codec_name === 'dts') {
        if (profile === 'DTS-HD MA') {
            if (channels == 2) {
                return 'DTS-HD MA Stereo'
            } else if (channels == 6) {
                return 'DTS-HD MA 5.1'
            } else if (channels == 8) {
                return 'DTS-HD MA 7.1'
            }
        } else {
            if (channels == 2) {
                return 'DTS Stereo'
            } else if (channels == 6) {
                return 'DTS 5.1'
            }
        }
    }
    return 'unknown-audio';
}

export function getAudioPriority(stream: any): number {
    const codec = stream?.codec_name.toLowerCase();
    const profile = stream?.codec_name.toLowerCase() || '';
    const channels = stream?.channels || 0;

    let codecPriority = AUDIO_PRIORITY.indexOf(codec);

    // DTS-HD MA und DTS-HD HR unterscheiden
    if (codec === 'dts' && profile === 'dts-hd ma') {
        codecPriority = AUDIO_PRIORITY.indexOf('dts-hd ma');
    } else if (codec === 'dts' && profile === 'dts-hd hr') {
        codecPriority = AUDIO_PRIORITY.indexOf('dts-hd hr');
    }

    return codecPriority !== -1 ? codecPriority : AUDIO_PRIORITY.length;
}