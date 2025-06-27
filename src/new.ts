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
import * as console from 'node:console'
import {
    fixLanguageInTrack,
    getAudioType,
    getLanguageName,
    getSubtitleFormat,
    getSubtitleType,
    isCCSubtitle,
    isForcedSubtitle,
    isSDHSubtitle
} from './util/utils'
import { debug } from './util/logger'

export const PRESET_LANGUAGES: Array<string> = ['de', 'en']
const PRESET_SUBTITLE_PRIORITY: Array<string> = ['forced', 'normal', 'cc', 'sdh']
const PRESET_SUBTITLE_ORDER: Array<string> = ['pgs', 'srt', 'ass', 'vobsub']
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
                fixLanguageInTrack(track as VideoTrack);
                Object.assign(track, {
                    LOCAL_INDEX: videoIndex
                })
                video.push(track as VideoTrack)
                videoIndex++
                break
            case 'Audio':
                fixLanguageInTrack(track as AudioTrack);
                Object.assign(track, {
                    LOCAL_INDEX: audioIndex
                })
                audio.push(track as AudioTrack)
                audioIndex++
                break
            case 'Text':
                fixLanguageInTrack(track as SubtitleTrack);
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

function processVideo(tracks: VideoTrack[]): void {
    debug('=== ORIGINAL VIDEO TRACKS ===')
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        debug(`[${i}] ${lang} - "${track.Title}"`)
    })

    debug('\n')
}

function processAudio(tracks: AudioTrack[]): void {
    debug('=== ORIGINAL AUDIO TRACKS ===');
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown';
        const format = getAudioType(track);
        const channels = track.Channels || 0;
        debug(`[${i}] ${lang} ${format} ${channels}ch - "${track.Title}"`);
    });

    // filterUnknownLanguageTracks(tracks)

    debug('\n')
}

function processSubtitles(tracks: SubtitleTrack[]): void {
    debug('=== ORIGINAL SUBTITLE TRACKS ===')
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        debug(`[${i}] ${lang} ${format} ${type} - "${track.Title}"`)
    })

    // filterUnknownLanguageTracks(tracks)
    groupAndSortSubtitleTracks(tracks)
    setDefaultSubtitleTrack(tracks)
    renameSubtitleTracks(tracks)
    filterCustomSubtitles(tracks)

    debug('\n')
    debug('=== FINAL SUBTITLE TRACKS ===')
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        const localIndex = track.LOCAL_INDEX
        debug(`[${i}] ${lang} ${format} ${type} - "${track.Title}" (li: ${localIndex})`)
    })
    debug('\n')
}

function groupAndSortSubtitleTracks(tracks: SubtitleTrack[]): void {
    const groups = new Map<string, SubtitleTrack[]>()

    tracks.forEach(track => {
        const language = track.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS
        const type = getSubtitleType(track)
        const key = `${language}-${type}`

        if (!groups.has(key)) {
            groups.set(key, [])
        }
        groups.get(key)!.push(track)
    })

    debug('\n')
    debug('=== SUBTITLE GROUPS ===')
    groups.forEach((tracksInGroup, key) => {
        debug(`Gruppe: ${key}`)
        tracksInGroup.forEach(track => {
            const format = getSubtitleFormat(track)
            debug(`  - ${format} "${track.Title}"`)
        })
    })

    const filtered: SubtitleTrack[] = []

    groups.forEach((tracksInGroup, key) => {
        debug(`Filter Group: ${key}`)

        // Nach Format-Priorität sortieren
        const sortedByFormat = tracksInGroup.sort((a, b) => {
            const formatA = getSubtitleFormat(a)
            const formatB = getSubtitleFormat(b)

            const priorityA = PRESET_SUBTITLE_ORDER.indexOf(formatA)
            const priorityB = PRESET_SUBTITLE_ORDER.indexOf(formatB)

            const finalA = priorityA === -1 ? 999 : priorityA
            const finalB = priorityB === -1 ? 999 : priorityB

            debug(`  ${formatA} (${priorityA}) vs ${formatB} (${priorityB})`)

            return finalA - finalB
        })

        const bestTrack = sortedByFormat[0]
        const bestFormat = getSubtitleFormat(bestTrack)
        debug(`  → Choose: ${bestFormat} "${bestTrack.Title}"`)

        filtered.push(bestTrack)
    })

    debug('\n')
    debug('=== FILTERED SUBTITLE TRACKS ===')
    filtered.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        debug(`[${i}] ${lang} ${format} ${type} - "${track.Title}"`)
    })

    tracks.length = 0
    tracks.push(...filtered)
}

function setDefaultSubtitleTrack(tracks: SubtitleTrack[]): void {
    if (tracks.length === 0) return

    // Alle Tracks erstmal auf nicht-default setzen
    tracks.forEach(track => {
        track.Default = 'No'
    })

    // Suche ersten forced Track der Deutsch oder Englisch ist
    const firstForcedTrack = tracks.find(track => {
        const language = track.Language || ''
        const isGermanOrEnglish = ['ger', 'deu', 'de', 'eng', 'en'].includes(language.toLowerCase())
        return isForcedSubtitle(track) && isGermanOrEnglish
    })

    if (firstForcedTrack) {
        // Nur deutschen oder englischen forced Track als default setzen
        firstForcedTrack.Default = 'Yes'
    }
    // Falls kein passender forced Track gefunden wird, bleiben alle auf 'No'
}

// 6. Tracks umbenennen
function renameSubtitleTracks(tracks: SubtitleTrack[]): void {
    tracks.forEach(track => {
        const language = track.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS

        let newTitle = getLanguageName(language)

        if (isForcedSubtitle(track)) {
            if (language === 'ger' || language === 'deu' || language === 'de') {
                newTitle += ' Erzwungen'
            } else {
                newTitle += ' Forced'
            }
        }

        if (isSDHSubtitle(track)) {
            newTitle += ' SDH'
        } else if (isCCSubtitle(track)) {
            newTitle += ' CC'
        }

        track.Title = newTitle
    })
}

function filterCustomSubtitles(tracks: SubtitleTrack[]): void {
    // const filtered = tracks.filter((track: SubtitleTrack) => {
    //     const language = track.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS
    //     const title = (track.Title || '').toLowerCase()
    //     return !/signs/i.test(title);
    // })
    //
    // tracks.length = 0
    // tracks.push(...filtered)
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