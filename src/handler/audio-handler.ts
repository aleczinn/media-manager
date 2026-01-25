import { AudioTrack } from '../types/AudioTrack'
import { debug } from '../util/logger'
import { filterUnknownLanguageTracks } from '../util/utils'
import { PRESET_AUDIO_ORDER, PRESET_LANGUAGES_ORDER } from '../index'
import { PURPLE, RED, RESET } from '../ansi'
import console from 'node:console'
import { getAudioTrackName, getAudioType } from '../util/audio-utils'

export function processAudio(tracks: AudioTrack[]): void {
    if (tracks.length === 0) {
        console.log(`${RESET}>${RED}> No audio tracks found -> Skip processing`)
        return;
    }

    debug(`${PURPLE}=== ORIGINAL AUDIO TRACKS ===`)
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getAudioType(track)
        const channels = track.Channels || 0
        debug(`${PURPLE}[${i}] ${lang} ${format} ${channels}ch - "${track.Title}"`)
    })

    filterUnknownLanguageTracks(tracks)
    printDebug('AFTER FILTER UNKNOWN AUDIO TRACKS', tracks)
    sortAudioTracks(tracks)
    setDefaultAudioTrack(tracks)
    renameAudioTracks(tracks)
    customFilter(tracks)
    printDebug('FINAL AUDIO TRACKS', tracks)
}

function sortAudioTracks(tracks: AudioTrack[]): void {
    tracks.sort((a: AudioTrack, b: AudioTrack) => {
        // Sort languages
        const langA = (a.Language || '').toLowerCase()
        const langB = (b.Language || '').toLowerCase()

        const langIndexA = PRESET_LANGUAGES_ORDER.indexOf(langA)
        const langIndexB = PRESET_LANGUAGES_ORDER.indexOf(langB)

        // Known langauges have higher priority than unknown
        const langPriorityA = langIndexA !== -1 ? langIndexA : PRESET_LANGUAGES_ORDER.length
        const langPriorityB = langIndexB !== -1 ? langIndexB : PRESET_LANGUAGES_ORDER.length

        if (langPriorityA !== langPriorityB) {
            return langPriorityA - langPriorityB
        }

        // More channels means higher priority
        const channelsA = a.Channels || 0
        const channelsB = b.Channels || 0

        if (channelsA !== channelsB) {
            return channelsB - channelsA // Absteigende Sortierung für Kanäle
        }

        // Sort the audio format by PRESET_AUDIO_ORDER
        const audioTypeA = getAudioType(a, false)
        const audioTypeB = getAudioType(b, false)

        const audioIndexA = PRESET_AUDIO_ORDER.indexOf(audioTypeA)
        const audioIndexB = PRESET_AUDIO_ORDER.indexOf(audioTypeB)

        // Known formats have higher priority than unknown
        const audioPriorityA = audioIndexA !== -1 ? audioIndexA : PRESET_AUDIO_ORDER.length
        const audioPriorityB = audioIndexB !== -1 ? audioIndexB : PRESET_AUDIO_ORDER.length

        if (audioPriorityA !== audioPriorityB) {
            return audioPriorityA - audioPriorityB
        }

        // Fallback
        const titleA = (a.Title || '').toLowerCase()
        const titleB = (b.Title || '').toLowerCase()

        return titleA.localeCompare(titleB)
    })
}

function setDefaultAudioTrack(tracks: AudioTrack[]): void {
    if (tracks.length === 0) return

    tracks.forEach(track => {
        track.Default = 'No'
    })
}

function renameAudioTracks(tracks: AudioTrack[]): void {
    tracks.forEach(track => {
        const type = getAudioType(track)
        track.Title = getAudioTrackName(type)
    })
}

function customFilter(tracks: AudioTrack[]): void {
    // const filtered = tracks.filter((track: AudioTrack) => {
    //     const language = track.Language || ''
    //     const title = (track.Title || '').toLowerCase()
    //     return !/signs/i.test(title);
    // })
    //
    // tracks.length = 0
    // tracks.push(...filtered)
}

function printDebug(title: string, tracks: AudioTrack[]): void {
    if (tracks.length === 0) {
        debug(`${PURPLE}No more Audio files found after > ${title}`)
        return;
    }

    debug('\n')
    debug(`${PURPLE}=== ${title} ===`)
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const type = getAudioType(track as AudioTrack)
        const localIndex = track.LOCAL_INDEX
        debug(`${PURPLE}[${i}] ${lang} ${type} - "${track.Title}" (li: ${localIndex})`)
    })
}