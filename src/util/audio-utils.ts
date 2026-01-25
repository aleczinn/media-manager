import { MediaFile } from '../types/MediaFile'
import { SeparatedTracks } from '../types/SeparatedTracks'
import ffmpeg, { FfmpegCommand, FfmpegCommandOptions } from 'fluent-ffmpeg'
import { GREEN, PURPLE, RED, RESET, YELLOW } from '../ansi'
import { AudioTrack } from '../types/AudioTrack'
import {
    PRESET_AUDIO_BRANDING,
    PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS,
    PRESET_NORMALIZE_AUDIO,
    PRESET_NORMALIZE_MIN_THRESHOLD
} from '../index'
import { debug } from './logger'

const NORMALIZE_SUPPORTED_AUDIO_FORMATS = ['dts', 'eac3', 'ac3', 'opus', 'aac']
const NORMALIZE_SUPPORTED_CHANNEL_COUNT = [2, 6]

export async function applyNormalization(file: MediaFile, tracks: AudioTrack[], command: FfmpegCommand): Promise<boolean> {
    const track: AudioTrack = tracks[0]

    if (PRESET_NORMALIZE_AUDIO == 'PEAK') {
        return await normalizePeak(file, track, command)
    }
    // else if (PRESET_NORMALIZE_AUDIO == 'EBU R128') {
    //     return await normalizeEBU(file, track, command)
    // }
    return false
}

async function analyzePeakVolume(file: MediaFile, track: AudioTrack): Promise<any> {
    return new Promise((resolve, reject) => {
        // @ts-ignore
        ffmpeg(file.fullPath, (err, ffmpeg) => {
        })
            .addOption('-f', 'null')
            .outputOptions([
                `-map 0:a:${track.LOCAL_INDEX}`,
                '-af', 'volumedetect'
            ])
            .on('stderr', (stderrLine) => {
                const maxVolumeMatch = stderrLine.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/)
                if (maxVolumeMatch) {
                    const maxVolume = parseFloat(maxVolumeMatch[1])
                    resolve({
                        maxVolume: maxVolume,
                        gainNeeded: maxVolume * -1 // Invertiert für Verstärkung
                    })
                }
            })
            .on('progress', (progress) => {
                if (progress.percent && progress.percent >= 0) {
                    // console.log(`${RESET}> - ${PURPLE}Progress${RESET}: ${progress.percent.toFixed(2)}%`)
                    process.stdout.write(`\r${RESET}> - ${PURPLE}Progress${RESET}: ${progress.percent.toFixed(2)}%`);
                }
            })
            .on('end', () => {
                process.stdout.write('\n')
                reject('No Peak-Data found!')
            })
            .on('error', (err) => reject(`Error while analysing peak: ${err.message}`))
            .output('/dev/null') // Linux/Mac oder 'NUL' für Windows
            .run()
    })
}

async function normalizePeak(file: MediaFile, track: AudioTrack, command: FfmpegCommand): Promise<boolean> {
    console.log(`${PURPLE}> Normalization`)
    console.log(`${RESET}> - ${PURPLE}Mode${RESET}: PEAK`)

    const audioType = getAudioType(track, false)
    const channels = track.Channels

    if (NORMALIZE_SUPPORTED_AUDIO_FORMATS.includes(audioType) && NORMALIZE_SUPPORTED_CHANNEL_COUNT.includes(channels)) {
        // console.log(`${RESET}> - Analyzing peak levels...`)
        try {
            const peakData = await analyzePeakVolume(file, track)

            console.log(`${RESET}> - Analyzing audio track "${track.Language} - ${track.Title}"`)
            console.log(`${RESET}> - Current peak: ${peakData.maxVolume}dB`)
            console.log(`${RESET}> - Gain needed: ${PURPLE}+${peakData.gainNeeded}dB`)

            if (peakData.gainNeeded > PRESET_NORMALIZE_MIN_THRESHOLD) {
                const safeGain = Math.min(peakData.gainNeeded, 20)
                if (safeGain < peakData.gainNeeded) {
                    console.log(`${RESET}> - ${YELLOW}Gain limited to ${safeGain}dB for safety`)
                }

                command.outputOptions([
                    `-filter_complex`,
                    `[0:a:${track.LOCAL_INDEX}]volume=${safeGain}dB[peak_normalized]`, // ← Nur diese eine Spur
                    `-map`, `[peak_normalized]`,
                    `-c:a:0`, 'ac3',
                    `-b:a:0`, channels == 2 ? '384k' : '640k',
                    `-metadata:s:a:0`, `title=${channels == 2 ? 'Dolby Stereo' : 'Dolby Digital 5.1'} ${PRESET_AUDIO_BRANDING}`,
                    `-metadata:s:a:0`, `language=${track?.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS || 'und'}`,
                    `-disposition:a:0`, 'default'
                ])

                console.log(`${RESET}> - Peak normalization applied to track "${track.Language} - ${track.Title}" only ${PURPLE}(+${safeGain}dB)`)
                return true
            } else {
                console.log(`${RESET}> - Peak normalization ${PURPLE}skipped ${RESET}for track "${track.Language} - ${track.Title}", already near 0dB peak`)
            }
        } catch (error) {
            console.error(`${RED}> Peak analysis failed: `, error)
        }
    } else {
        console.error(`${RED}> Unsupported audio format (${getAudioType(track)}) - Supported: AC3, EAC3, DTS & AAC (2 or 5.1 channels)`)
    }
    return false
}

export function getAudioType(track: AudioTrack, withChannel: boolean = true): string {
    const title = (track?.Title || '').toLowerCase()
    const codecId = (track.CodecID || track.Format || '').toLowerCase()
    const format = (track.Format || '').toLowerCase()
    const additionalFeatures = (track.Format_AdditionalFeatures || '').toLowerCase()
    const isAtmos = additionalFeatures.includes('joc')
        || additionalFeatures.includes('16-ch')
        || title.includes('atmos')
    const channels = track.Channels === 2 ? track.Channels : (track.Channels - 1)

    let name = ''

    // TrueHD
    if (codecId.includes('truehd')) {
        if (isAtmos) {
            name = 'truehd_atmos'
        } else {
            name = 'truehd'
        }
    }

    // EAC3 (Dolby Digital Plus)
    else if (codecId.includes('eac3')) {
        if (isAtmos) {
            name = 'eac3_atmos'
        } else {
            name = 'eac3'
        }
    }

    // AC3 (Dolby Digital)
    else if (codecId.includes('ac3')) {
        name = 'ac3'
    }

    // DTS Varianten
    else if (codecId.includes('dts')) {
        const commercialIfAny = (track?.Format_Commercial_IfAny || '').toLowerCase()

        if (additionalFeatures.includes('xxl x') || commercialIfAny.includes('dts:x')) {
            name = 'dts_x'
        } else if (codecId.includes('dts-hd ma') || commercialIfAny.includes('dts-hd master audio')) {
            name = 'dts_hd_ma'
        } else if (codecId.includes('dts-hd hr') || commercialIfAny.includes('dts-hd high resolution')) {
            name = 'dts_hd_hr'
        } else {
            name = 'dts'
        }
    }

    // AAC
    else if (codecId.includes('aac') || format.includes('aac')) {
        name = 'aac'
    }

    // Opus
    else if (codecId.includes('opus') || format.includes('opus')) {
        name = 'opus'
    }
    return withChannel ? `${name}_${channels}` : name
}

export function getAudioTrackName(type: string): string {
    switch (type) {
        case 'truehd_atmos_7':
            return 'Dolby TrueHD Atmos 7.1'
        case 'truehd_atmos_5':
            return 'Dolby TrueHD Atmos 5.1'

        case 'truehd_7':
            return 'Dolby TrueHD 7.1'
        case 'truehd_5':
            return 'Dolby TrueHD 5.1'
        case 'truehd_2':
            return 'Dolby TrueHD Stereo'

        case 'eac3_atmos_7':
            return 'Dolby Digital Plus Atmos 7.1'
        case 'eac3_atmos_5':
            return 'Dolby Digital Plus Atmos 5.1'

        case 'eac3_7':
            return 'Dolby Digital Plus 7.1'
        case 'eac3_5':
            return 'Dolby Digital Plus 5.1'
        case 'eac3_2':
            return 'Dolby Digital Plus Stereo'

        case 'ac3_5':
            return 'Dolby Digital 5.1'
        case 'ac3_2':
            return 'Dolby Stereo'

        case 'dts_x_7':
            return 'DTS:X 7.1'
        case 'dts_x_5':
            return 'DTS:X 5.1'
        case 'dts_hd_ma_7':
            return 'DTS-HD MA 7.1'
        case 'dts_hd_ma_5':
            return 'DTS-HD MA 5.1'
        case 'dts_hd_ma_2':
            return 'DTS-HD MA Stereo'
        case 'dts_hd_hr_7':
            return 'DTS-HD HR 7.1'
        case 'dts_hd_hr_5':
            return 'DTS-HD HR 5.1'
        case 'dts_hd_hr_2':
            return 'DTS-HD HR Stereo'
        case 'dts_5':
            return 'DTS 5.1'
        case 'dts_2':
            return 'DTS Stereo'

        case 'opus_5':
            return 'Opus 5.1'
        case 'opus_2':
            return 'Stereo'

        case 'aac_5':
            return 'AAC 5.1'
        case 'aac_2':
            return 'Stereo'
    }
    return 'unknown-audio-name'
}