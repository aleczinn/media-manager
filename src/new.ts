import * as fs from 'fs'
import { MediaFile } from './types/MediaFile'
import { findMediaFiles, getCombinedMetadata } from './util/file-utils'
import { CYAN, RESET, WHITE } from './ansi'
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

export const PRESET_LANGUAGES: Array<string> = ['de', 'en']
export const PRESET_SUBTITLE_PRIORITY: Array<string> = ['forced', 'normal', 'cc', 'sdh']
export const PRESET_SUBTITLE_ORDER: Array<string> = ['pgs', 'srt', 'ass', 'vobsub']
export const PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS: string = ''
const PRESET_AUDIO_BRANDING: string = '[Sky Mix]'
const PRESET_ENCODE_OPTIONS: Array<string> = ['libx264', '-crf 18', '-preset slow', '-x264-params ref=5:bframes=5']
const PRESET_NORMALIZE_MIN_THRESHOLD: number = 0.3

const PRESET_RENAME_FIX: boolean = false
const PRESET_NORMALIZE_AUDIO: boolean = true
const PRESET_ENCODE_VIDEO: boolean = false
export const PRESET_THROW_AWAY_UNKNOWN_TRACKS: boolean = true
export const PRESET_DEBUG_MODE: boolean = true // Save the metadata as a JSON file, print out debug information per file

async function processFile(file: MediaFile) {
    const { size } = await fs.promises.stat(file.path)

    console.log(`\n\n${RESET}> = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =`)
    console.log(`${RESET}>${CYAN} File: ${RESET}${file.name} ${WHITE}(${(size / 1024 / 1024 / 1024).toFixed(2)} GB)`)
    console.log(`${RESET}>${CYAN} Path: ${RESET}${file.path}`)

    try {
        const metadata = await getCombinedMetadata(file)
        const tracks = metadata.media?.track || []

        if (PRESET_DEBUG_MODE) {
            const data = JSON.stringify(metadata, null, 2)
            fs.writeFileSync(`${file.path}-combined.json`, data, 'utf-8')
        }

        let { general, video, audio, subtitle } = separateTracks(tracks)

        console.log(`${RESET}>${CYAN} Streams: ${RESET} Video: ${video.length} | Audio: ${audio.length} | Subtitles: ${subtitle.length}`)
        debug(' \n')

        processVideo(video)
        processAudio(audio)
        processSubtitles(subtitle)

        console.log(`${RESET}>${CYAN} Filtered Streams: ${RESET} Video: ${video.length} | Audio: ${audio.length} | Subtitles: ${subtitle.length}`)

        // TODO : merge final file with ffmpeg here
        // TODO : built in normalization for main track + optinal other tracks
    } catch (error) {
        console.error(error)
    }
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