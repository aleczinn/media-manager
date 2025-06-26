import * as fs from 'fs'
import * as path from 'path'
import mediaInfoFactory from 'mediainfo.js'
import { VideoFile } from './types/VideoFile'
import { getMetaDataMediaInfo, findVideoFiles, getMetaDataFFprobe, getCombinedMetadata } from './util/file-utils'
import { CYAN, RESET, WHITE } from './ansi'

const PRESET_LANGUAGES: Array<string> = ['ger', 'deu', 'eng']
const PRESET_SUBTITLE_ORDER: Array<string> = ['pgs', 'srt', 'ass', 'vobsub']
const PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS: string = ''
const PRESET_AUDIO_BRANDING: string = '[Sky Mix]'
const PRESET_ENCODE_OPTIONS: Array<string> = ['libx264', '-crf 18', '-preset slow', '-x264-params ref=5:bframes=5']
const PRESET_NORMALIZE_MIN_THRESHOLD: number = 0.3

const PRESET_RENAME_FIX: boolean = false
const PRESET_NORMALIZE_AUDIO: boolean = true
const PRESET_ENCODE_VIDEO: boolean = false
const PRESET_THROW_AWAY_UNKNOWN_TRACKS: boolean = true;

async function processFile(file: VideoFile) {
    const { size } = await fs.promises.stat(file.path)
    // console.log(`\nAnalyzing: ${file.name} (${(size / 1024 / 1024 / 1024).toFixed(2)} GB)`)

    console.log(`\n\n${RESET}> = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =`)
    console.log(`${RESET}>${CYAN} File: ${RESET}${file.name} ${WHITE}(${(size / 1024 / 1024 / 1024).toFixed(2)} GB)`)
    console.log(`${RESET}>${CYAN} Path: ${RESET}${file.path}`)

    try {
        const metadata = await getCombinedMetadata(file);
        const tracks = metadata.media?.track || []

        const { general, video, audio, subtitle } = separateTracks(tracks);

        console.log(`${RESET}>${CYAN} Streams: ${RESET} Video: ${video.length} | Audio: ${audio.length} | Subtitles: ${subtitle.length}`)



        // tracks.forEach((track: any, index: number) => {
            // if (track['@type'] === 'General') {
            //     console.log(`  Format: ${track.Format}`)
            //     console.log(`  Duration: ${track.Duration} ms`)
            //     console.log(`  File size: ${track.FileSize} bytes`)
            // }
            //
            // if (track['@type'] === 'Video') {
            //     console.log(`  Video format: ${track.Format}`)
            //     console.log(`  Resolution: ${track.Width}x${track.Height}`)
            //     console.log(`  Frame rate: ${track.FrameRate} fps`)
            //     console.log(`  Bit rate: ${track.BitRate} bps`)
            // }
            //
            // if (track['@type'] === 'Audio') {
            //     console.log(`  Audio format: ${track.Format}`)
            //     console.log(`  Channels: ${track.Channels}`)
            //     console.log(`  Sample rate: ${track.SamplingRate} Hz`)
            //     console.log(`  Bit rate: ${track.BitRate} bps`)
            // }
            //
            // if (track['@type'] === 'Text') {
            //     console.log(`  Format: ${track.CodecID}`) // UTF-8 | PGS
            //     console.log(`  Default: ${track.Default}`)
            //     console.log(`  Forced: ${track.Forced}`)
            //     console.log(`  HearingImpaired: ${track.HearingImpaired}`)
            // }
        // })

        // const data = JSON.stringify(metadata, null, 2)
        // fs.writeFileSync(`${file.path}-combined.json`, data, 'utf-8')
    } catch (error) {
        console.error(error)
    }
}

function separateTracks(tracks: any) {
    const general: any = [], video: any = [], audio: any = [], subtitle: any = [];
    let videoIndex = 0, audioIndex = 0, subtitleIndex = 0;

    tracks.forEach((track: any, index: number) => {
        if (track['@type'] === 'General') {
            general.push(track);
        }

        if (track['@type'] === 'Video') {
            Object.assign(track, {
                LOCAL_INDEX: videoIndex
            });
            video.push(track);
            videoIndex++;
        }

        if (track['@type'] === 'Audio') {
            Object.assign(track, {
                LOCAL_INDEX: audioIndex
            });
            audio.push(track);
            audioIndex++;
        }

        if (track['@type'] === 'Text') {
            Object.assign(track, {
                LOCAL_INDEX: subtitleIndex
            });
            subtitle.push(track);
            subtitleIndex++;
        }
    });

    return {general, video, audio, subtitle};
}

async function main() {
    try {
        const rootDir = 'C:\\Users\\alec_\\Desktop\\Loki\\ENCODE'
        const files = findVideoFiles(rootDir)

        console.log(`Found ${files.length} video files to analyze...`)

        for (const file of files) {
            await processFile(file)
        }
    } catch (error) {
        console.error(error)
    }
}

main()