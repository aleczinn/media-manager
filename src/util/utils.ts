import { SubtitleTrack } from '../types/SubtitleTrack'
import { VideoTrack } from '../types/VideoTrack'
import { AudioTrack } from '../types/AudioTrack'
import { debug } from './logger'
import { PRESET_LANGUAGES, PRESET_THROW_AWAY_UNKNOWN_TRACKS } from '../new'
import { BaseTrack } from '../types/BaseTrack'

export function isDefaultTrack(track: VideoTrack | AudioTrack | SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('default') || track.Default === 'Yes'
}

export function filterUnknownLanguageTracks(tracks: (AudioTrack | SubtitleTrack)[]): void {
    if (PRESET_THROW_AWAY_UNKNOWN_TRACKS) {
        const filteredTracks = tracks.filter((track: AudioTrack | SubtitleTrack) => {
            const language = track.Language || '';
            const isKnownLanguage = PRESET_LANGUAGES.includes(language.toLowerCase());

            if (!isKnownLanguage) {
                debug(`Removing unknown language track: "${track.Title}" (${language})`);
            }

            return isKnownLanguage;
        });

        tracks.length = 0;
        tracks.push(...filteredTracks);
    }
}

export function fixLanguageInTrack(track: (VideoTrack | AudioTrack | SubtitleTrack)): void {
    const language = (track.Language || '').toLowerCase();
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

