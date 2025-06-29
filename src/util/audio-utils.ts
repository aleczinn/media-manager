import { MediaFile } from '../types/MediaFile'
import { SeparatedTracks } from '../types/SeparatedTracks'
import ffmpeg, { FfmpegCommand, FfmpegCommandOptions } from 'fluent-ffmpeg'
import { PURPLE, RED, RESET, YELLOW } from '../ansi'
import { AudioTrack } from '../types/AudioTrack'
import { getAudioType } from '../handler/audio-handler'
import {
    PRESET_AUDIO_BRANDING,
    PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS,
    PRESET_NORMALIZE_AUDIO,
    PRESET_NORMALIZE_MIN_THRESHOLD
} from '../index'

const NORMALIZE_SUPPORTED_AUDIO_FORMATS = ['dts', 'eac3', 'ac3', 'aac']
const NORMALIZE_SUPPORTED_CHANNEL_COUNT = [2, 6]

// EBU R128 Zielwerte
const EBU_R128_TARGET_LUFS = -23.0  // Standard für Broadcast
const EBU_R128_TARGET_LUFS_STREAMING = -16.0  // Für Streaming (Netflix, etc.)
const EBU_R128_MAX_PEAK = -1.0  // Maximaler True Peak
const EBU_R128_MAX_LRA = 7.0    // Maximaler Loudness Range

export async function applyNormalization(file: MediaFile, tracks: AudioTrack[], command: FfmpegCommand): Promise<boolean> {
    const track: AudioTrack = tracks[0]

    if (PRESET_NORMALIZE_AUDIO == 'PEAK') {
        return await normalizePeak(file, track, command)
    } else if (PRESET_NORMALIZE_AUDIO == 'EBU R128') {
        return await normalizeEBU(file, track, command)
    }
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
                    console.log(`${RESET}> - ${PURPLE}Progress${RESET}: ${progress.percent.toFixed(2)}%`)
                }
            })
            .on('end', () => reject('Keine Peak-Daten gefunden!'))
            .on('error', (err) => reject(`Fehler bei Peak-Analyse: ${err.message}`))
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
        console.log(`${RESET}> - Analyzing peak levels...`)
        try {
            const peakData = await analyzePeakVolume(file, track)

            console.log(`${RESET}> - Analyzing audio track "${track.Language} - ${track.Title}"`)
            console.log(`${RESET}> - Current peak: ${peakData.maxVolume}dB`)
            console.log(`${RESET}> - Gain needed: +${peakData.gainNeeded}dB`)

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

                console.log(`${RESET}> - Peak normalization applied to track "${track.Language} - ${track.Title}" only (+${safeGain}dB)`)
                return true
            } else {
                console.log(`${RESET}> - Peak normalization skipped for track "${track.Language} - ${track.Title}", already near 0dB peak`)
            }
        } catch (error) {
            console.error(`${RED}> Peak analysis failed: `, error)
        }
    } else {
        console.error(`${RED}> Unsupported audio format! - Supported: AC3, EAC3, DTS & AAC (2 or 5.1 channels)`)
    }
    return false
}

async function normalizeEBU(file: MediaFile, track: AudioTrack, command: FfmpegCommand): Promise<boolean> {
    console.log(`${PURPLE}> Normalization`)
    console.log(`${RESET}> - ${PURPLE}Mode${RESET}: EBU R128`)

    const audioType = getAudioType(track, false)
    const channels = track.Channels

    if (NORMALIZE_SUPPORTED_AUDIO_FORMATS.includes(audioType) && NORMALIZE_SUPPORTED_CHANNEL_COUNT.includes(channels)) {
        console.log(`${RESET}> - Analyzing loudness (EBU R128)...`)

        const loudnessData = await analyzeEBUR128Loudness(file, track)

        console.log(`${RESET}> - Analyzing audio track "${track.Language} - ${track.Title}"`);
        console.log(`${RESET}> - Current LUFS: ${loudnessData.integratedLoudness}dB`);
        console.log(`${RESET}> - Current LRA: ${loudnessData.loudnessRange}LU`);
        console.log(`${RESET}> - Current True Peak: ${loudnessData.truePeak}dBFS`);
        console.log(`${RESET}> - Target LUFS: ${EBU_R128_TARGET_LUFS_STREAMING}dB`);
        console.log(`${RESET}> - Gain needed: ${loudnessData.gainNeeded}dB`);
    }
    return false
}

async function analyzeEBUR128Loudness(file: MediaFile, track: AudioTrack): Promise<{
    integratedLoudness?: number,
    loudnessRange?: number,
    truePeak?: number,
    gainNeeded?: number
}> {
    return {}
}
