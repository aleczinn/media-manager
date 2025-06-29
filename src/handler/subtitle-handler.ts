import { SubtitleTrack } from '../types/SubtitleTrack'
import { debug } from '../util/logger'
import { PRESET_SUBTITLE_ORDER } from '../new'
import { filterUnknownLanguageTracks, getLanguageName, isDefaultTrack } from '../util/utils'

export function processSubtitles(tracks: SubtitleTrack[]): void {
    debug('=== ORIGINAL SUBTITLE TRACKS ===')
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        debug(`[${i}] ${lang} ${format} ${type} - "${track.Title}"`)
    })

    filterUnknownLanguageTracks(tracks)
    groupAndSortSubtitleTracks(tracks)
    setDefaultSubtitleTrack(tracks)
    renameSubtitleTracks(tracks)
    customFilter(tracks)

    debug('\n')
    debug('=== FINAL SUBTITLE TRACKS ===')
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        const localIndex = track.LOCAL_INDEX
        debug(`[${i}] ${lang} ${format} ${type} - "${track.Title}" (li: ${localIndex}) Default: ${isDefaultTrack(track)}`)
    })
    debug('\n')
}

function groupAndSortSubtitleTracks(tracks: SubtitleTrack[]): void {
    const groups = new Map<string, SubtitleTrack[]>()

    tracks.forEach(track => {
        const language = track.Language || ''
        const type = getSubtitleType(track)
        const key = `${language}-${type}`

        if (!groups.has(key)) {
            groups.set(key, [])
        }
        groups.get(key)!.push(track)
    })

    // debug('\n')
    // debug('=== SUBTITLE GROUPS ===')
    // groups.forEach((tracksInGroup, key) => {
    //     debug(`Gruppe: ${key}`)
    //     tracksInGroup.forEach(track => {
    //         const format = getSubtitleFormat(track)
    //         debug(`  - ${format} "${track.Title}"`)
    //     })
    // })

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

    // debug('\n')
    // debug('=== FILTERED SUBTITLE TRACKS ===')
    // filtered.forEach((track, i) => {
    //     const lang = track.Language || 'unknown'
    //     const format = getSubtitleFormat(track)
    //     const type = getSubtitleType(track)
    //     debug(`[${i}] ${lang} ${format} ${type} - "${track.Title}"`)
    // })

    tracks.length = 0
    tracks.push(...filtered)
}

function setDefaultSubtitleTrack(tracks: SubtitleTrack[]): void {
    if (tracks.length === 0) return

    tracks.forEach(track => {
        track.Default = 'No'
        track.Original = 'No'
        track.Karaoke = 'No'
        track.Dub = 'No'
        track.Lyrics = 'No'
        track.Commentary = 'No'
    })

    const firstForcedTrack = tracks.find(track => {
        const language = track.Language || ''
        const isGermanOrEnglish = ['de', 'en'].includes(language)
        return isForcedSubtitle(track) && isGermanOrEnglish
    })

    if (firstForcedTrack) {
        firstForcedTrack.Default = 'Yes'
    }
}

function renameSubtitleTracks(tracks: SubtitleTrack[]): void {
    tracks.forEach(track => {
        const language = track.Language || ''

        let newTitle = getLanguageName(language)

        if (isForcedSubtitle(track)) {
            if (language === 'de') {
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

function customFilter(tracks: SubtitleTrack[]): void {
    // const filtered = tracks.filter((track: SubtitleTrack) => {
    //     const language = track.Language || ''
    //     const title = (track.Title || '').toLowerCase()
    //     return !/signs/i.test(title);
    // })
    //
    // tracks.length = 0
    // tracks.push(...filtered)
}

function getSubtitleFormat(track: SubtitleTrack): string {
    const codec = track.CodecID.toLowerCase()

    if (codec.includes('pgs') || codec.includes('s_hdmv')) return 'pgs'
    if (codec.includes('srt') || codec.includes('subrip') || codec.includes('s_text')) return 'srt'
    if (codec.includes('ass') || codec.includes('s_ssa')) return 'ass'
    if (codec.includes('vobsub') || codec.includes('s_vobsub')) return 'vobsub'

    return codec
}

function getSubtitleType(track: SubtitleTrack): string {
    const isForced = isForcedSubtitle(track)
    const isSDH = isSDHSubtitle(track)
    const isCC = isCCSubtitle(track)

    let type: string
    if (isForced) {
        type = 'forced'
    } else if (isSDH) {
        type = 'sdh'
    } else if (isCC) {
        type = 'cc'
    } else {
        type = 'normal'
    }
    return type
}

function isForcedSubtitle(track: SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('forced') ||
        title.includes('erzwungen') ||
        track.Forced == 'Yes'
}

function isSDHSubtitle(track: SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('sdh') ||
        title.includes('hearing impaired') ||
        track.HearingImpaired == 'Yes'
}

function isCCSubtitle(track: SubtitleTrack): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('cc')
}