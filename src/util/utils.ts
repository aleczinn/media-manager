import { SubtitleTrack } from '../types/SubtitleTrack'
import { VideoTrack } from '../types/VideoTrack'
import { AudioTrack } from '../types/AudioTrack'
import { debug } from './logger'
import {
    PRESET_DEBUG_LEVEL,
    PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS,
    PRESET_LANGUAGES_ORDER,
    PRESET_THROW_AWAY_UNKNOWN_TRACKS
} from '../index'
import { ParsedMediaFile } from '../types/ParsedMediaFile'
import { MediaFile } from '../types/MediaFile'
import { PURPLE } from '../ansi'
import { getAudioType } from '../handler/audio-handler'

export function isDefaultTrack(track: VideoTrack | AudioTrack | SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('default') || track.Default === 'Yes'
}

export function filterUnknownLanguageTracks(tracks: (AudioTrack | SubtitleTrack)[]): void {
    if (!PRESET_THROW_AWAY_UNKNOWN_TRACKS) return;

    const filteredTracks = tracks.filter((track: AudioTrack | SubtitleTrack) => {
        const language = track.Language || ''

        if (language === '' || language === 'und') {
            debug(`Unknown track got removed: "${track.Title}" (${language})`)
            return false
        }
        return true
    })

    tracks.length = 0
    tracks.push(...filteredTracks)
}

export function fixLanguageInTrack(track: (VideoTrack | AudioTrack | SubtitleTrack)): void {
    const language = (track.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS).toLowerCase()
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
    if (language === 'fre' || language === 'fra') {
        track.Language = 'fr'
    }
    if (language === 'ita') {
        track.Language = 'it'
    }
    if (language === 'rus') {
        track.Language = 'ru'
    }
    if (language === '') {
        track.Language = 'und'
    }
    track.Language = language
}

export function getLanguageName(language: string): string {
    const langMap: { [key: string]: string } = {
        'de': 'Deutsch',
        'en': 'English',
        'ja': 'Japanese',
        'fr': 'French',
        'es': 'Spanish',
        'it': 'Italian',
        'ru': 'Russian'
    }
    return langMap[language.toLowerCase()] || language.toUpperCase()
}

export function getParsedMediaFile(file: MediaFile): ParsedMediaFile | null {
    // Regex for S01E02 or 1x02 Format
    const regex = /[Ss](\d+)[Ee](\d+)|(\d+)x(\d+)/
    const match = file.name.match(regex)
    let title = ''

    if (match) {
        const titleMatch = file.name.match(/^(.+?)[\s\.\-_]*(?:[Ss]\d+[Ee]\d+|\d+x\d+)/)

        if (titleMatch) {
            title = titleMatch[1]
                .replace(/[.\-_]+/g, ' ') // Ersetze Punkte, Unterstriche, Bindestriche durch Leerzeichen
                .replace(/\s+/g, ' ') // Entferne überschüssige Leerzeichen
                .trim() // Entferne Leerzeichen am Anfang und Ende
                .replace(/\w\S*/g, (txt) => // Erster Buchstabe jedes Wortes groß (Title Case)
                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                )
        }

        // S01E02 Format
        if (match[1] && match[2]) {
            return {
                name: file.name,
                path: file.path,
                fullPath: file.fullPath,
                extension: file.extension,
                season: match[1],
                episode: match[2],
                title: title
            }
        }
        // 1x02 Format
        if (match[3] && match[4]) {
            return {
                name: file.name,
                path: file.path,
                fullPath: file.fullPath,
                extension: file.extension,
                season: match[3],
                episode: match[4],
                title: title
            }
        }
    }
    return null
}


