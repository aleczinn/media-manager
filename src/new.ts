import * as fs from 'fs'
import { MediaFile } from './types/MediaFile'
import { findMediaFiles, getCombinedMetadata } from './util/file-utils'
import { CYAN, GREEN, RESET, WHITE } from './ansi'
import { GeneralTrack } from './types/GeneralTrack'
import { BaseTrack } from './types/BaseTrack'
import { VideoTrack } from './types/VideoTrack'
import { AudioTrack } from './types/AudioTrack'
import { SubtitleTrack } from './types/SubtitleTrack'
import { SeparatedTracks } from './types/SeparatedTracks'
import { debug } from './util/logger'
import { fixLanguageInTrack } from './util/utils'
import { processSubtitles } from './handler/subtitle-handler'
import { processAudio } from './handler/audio-handler'
import { processVideo } from './handler/video-handler'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { preset } from './index'
import { getAudioTrackName } from './helper'

export const PRESET_LANGUAGES: Array<string> = ['de', 'en']
export const PRESET_SUBTITLE_PRIORITY: Array<string> = ['forced', 'normal', 'cc', 'sdh']
export const PRESET_SUBTITLE_ORDER: Array<string> = ['pgs', 'srt', 'ass', 'vobsub']
export const PRESET_AUDIO_ORDER: Array<string> = ['truehd_atmos', 'eac3_atmos', 'dts_x', 'truehd', 'dts_hd_ma', 'dts_hd_hr', 'eac3', 'dts', 'ac3', 'aac']
const PRESET_AUDIO_BRANDING: string = '[Sky Mix]'
const PRESET_ENCODE_OPTIONS: Array<string> = ['libx264', '-crf 18', '-preset slow', '-x264-params ref=5:bframes=5']
const PRESET_NORMALIZE_MIN_THRESHOLD: number = 0.3

const PRESET_RENAME_FIX: boolean = false
const PRESET_NORMALIZE_AUDIO: boolean = true
const PRESET_ENCODE_VIDEO: boolean = false
export const PRESET_THROW_AWAY_UNKNOWN_TRACKS: boolean = true
export const PRESET_DEBUG_MODE: boolean = true // Save the metadata as a JSON file, print out debug information per file

async function processFile(file: MediaFile) {
    const { size } = await fs.promises.stat(file.fullPath)

    console.log(`\n\n${RESET}> = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =`)
    console.log(`${RESET}>${CYAN} File: ${RESET}${file.name} ${WHITE}(${(size / 1024 / 1024 / 1024).toFixed(2)} GB)`)
    console.log(`${RESET}>${CYAN} Path: ${RESET}${file.path}`)
    console.log(`${RESET}>${CYAN} Full-Path: ${RESET}${file.fullPath}`)

    try {
        const metadata = await getCombinedMetadata(file)
        const tracks = metadata.media?.track || []

        if (PRESET_DEBUG_MODE) {
            const data = JSON.stringify(metadata, null, 2)
            fs.writeFileSync(`${file.path}-combined.json`, data, 'utf-8')
        }

        let separatedTracks: SeparatedTracks = separateTracks(tracks)

        console.log(`${RESET}>${CYAN} Streams: ${RESET} Video: ${separatedTracks.video.length} | Audio: ${separatedTracks.audio.length} | Subtitles: ${separatedTracks.subtitle.length}`)
        debug(' \n')

        processVideo(separatedTracks.video)
        processAudio(separatedTracks.audio)
        processSubtitles(separatedTracks.subtitle)

        console.log(`${RESET}>${CYAN} Filtered Streams: ${RESET} Video: ${separatedTracks.video.length} | Audio: ${separatedTracks.audio.length} | Subtitles: ${separatedTracks.subtitle.length}`)

        // TODO : merge final file with ffmpeg here
        // TODO : built in normalization for main track + optinal other tracks
        await buildScript(file, separatedTracks)
    } catch (error) {
        console.error(error)
    }
}

async function buildScript(file: MediaFile, tracks: SeparatedTracks): Promise<void> {
    const command = ffmpeg(file.fullPath)

    command.outputOptions('-metadata title=')

    // VIDEO
    tracks.video.forEach((track: VideoTrack, index: number) => {
        command.outputOptions(`-map 0:v:${track.LOCAL_INDEX}`)
        if (preset.encodeVideo) {
            console.log(`> [INFO] Using encoding for video stream ${index} with options:`, PRESET_ENCODE_OPTIONS)
            command.outputOptions(`-c:v:${index}`)
            command.outputOptions(PRESET_ENCODE_OPTIONS)
        } else {
            command.outputOptions(`-c:v:${index} copy`)
        }
    })

    // Audio
    tracks.audio.forEach((track: AudioTrack, index: number) => {
        command.outputOptions(`-map 0:a:${track.LOCAL_INDEX}`)
        command.outputOptions(`-c:a:${index} copy`)
        command.outputOptions(`-metadata:s:a:${index}`, `title=${track.Title}`)

        const dispositions: string[] = [];

        if (track.Default === 'Yes') dispositions.push('default');
        if (track.Forced === 'Yes') dispositions.push('forced');

        const dispositionStr = dispositions.length > 0 ? dispositions.join('+') : '0';
        command.outputOptions(`-disposition:a:${index}`, dispositionStr);
    })

    // Subtitle
    tracks.subtitle.forEach((track: SubtitleTrack, index: number) => {
        command.outputOptions(`-map 0:s:${track.LOCAL_INDEX}`)
        command.outputOptions(`-c:s:${index} copy`)
        command.outputOptions(`-metadata:s:s:${index}`, `title=${track.Title}`)

        const dispositions: string[] = [];

        if (track.Default === 'Yes') dispositions.push('default');
        if (track.Forced === 'Yes') dispositions.push('forced');
        if (track.HearingImpaired === 'Yes') dispositions.push('hearing_impaired');
        if (track.VisualImpaired === 'Yes') dispositions.push('visual_impaired');
        if (track.Dub === 'Yes') dispositions.push('dub');
        if (track.Original === 'Yes') dispositions.push('original');
        if (track.Karaoke === 'Yes') dispositions.push('karaoke');
        if (track.Commentary === 'Yes') dispositions.push('comment');
        if (track.Lyrics === 'Yes') dispositions.push('lyrics');

        const dispositionStr = dispositions.length > 0 ? dispositions.join('+') : '0';
        command.outputOptions(`-disposition:s:${index}`, dispositionStr);
    })

    command.outputOptions('-fflags +genpts')
    command.outputOptions('-vsync cfr')
    command.outputOptions('-max_interleave_delta 0')

    console.log(`\n${GREEN}> Building file...`)

    await new Promise<void>((resolve, reject) => {
        let startTime = Date.now()

        command.save(`${file.path}\\${file.name}_export.mkv`)
            .on('progress', (progress) => {
                if (progress.percent && progress.percent >= 0) {
                    let elapsed = (Date.now() - startTime) / 1000
                    let estimatedTotal = elapsed / (progress.percent / 100)
                    let remaining = estimatedTotal - elapsed

                    console.log(`${RESET}> ${GREEN}FPS${RESET}: ${progress.currentFps} ${GREEN}Frames${RESET}: ${progress.frames} ${GREEN}Zeit${RESET}: ${progress.timemark} ${GREEN}Progress${RESET}: ${progress.percent.toFixed(2)}% [${GREEN}Verbleibend${RESET}: ${remaining.toFixed(2)}s]`)
                }
            })
            .on('error', (err) => {
                console.error('Fehler beim verarbeiten der Datei:', err.message)
                reject(err)
            })
            .on('end', () => {
                console.log(`${GREEN}> Processing done!`)
                resolve()
            })
    })
}

function separateTracks(tracks: BaseTrack[]): SeparatedTracks {
    let general: GeneralTrack = {} as GeneralTrack, video: VideoTrack[] = [], audio: AudioTrack[] = [],
        subtitle: SubtitleTrack[] = []
    let videoIndex = 0, audioIndex = 0, subtitleIndex = 0

    tracks.forEach((track: BaseTrack) => {
        switch (track['@type']) {
            case 'General':
                general = track as GeneralTrack
                break
            case 'Video':
                fixLanguageInTrack(track as VideoTrack)
                Object.assign(track, {
                    LOCAL_INDEX: videoIndex
                })
                video.push(track as VideoTrack)
                videoIndex++
                break
            case 'Audio':
                fixLanguageInTrack(track as AudioTrack)
                Object.assign(track, {
                    LOCAL_INDEX: audioIndex
                })
                audio.push(track as AudioTrack)
                audioIndex++
                break
            case 'Text':
                fixLanguageInTrack(track as SubtitleTrack)
                Object.assign(track, {
                    LOCAL_INDEX: subtitleIndex
                })
                subtitle.push(track as SubtitleTrack)
                subtitleIndex++
                break
        }
    })

    return { general, video, audio, subtitle }
}

async function main() {
    try {
        const rootDir = 'C:\\Users\\alec_\\Desktop\\Loki\\ENCODE'
        const files = findMediaFiles(rootDir)

        console.log(`Found ${files.length} video files to analyze...`)

        for (const file of files) {
            await processFile(file)
        }
    } catch (error) {
        console.error(error)
    }
}

main()