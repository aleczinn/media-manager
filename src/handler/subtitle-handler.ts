import { SubtitleTrack } from '../types/SubtitleTrack'
import { debug } from '../util/logger'
import { PRESET_LANGUAGES, PRESET_SUBTITLE_ORDER, PRESET_SUBTITLE_PRIORITY } from '../new'
import { filterUnknownLanguageTracks, getLanguageName, isDefaultTrack } from '../util/utils'
import { YELLOW } from '../ansi'

export function processSubtitles(tracks: SubtitleTrack[]): void {
    debug(`${YELLOW}=== ORIGINAL SUBTITLE TRACKS ===`)
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        debug(`${YELLOW}[${i}] ${lang} ${format} ${type} - "${track.Title}"`)
    })

    filterUnknownLanguageTracks(tracks)
    sortSubtitleTracks(tracks)
    setDefaultSubtitleTrack(tracks)
    renameSubtitleTracks(tracks)
    customFilter(tracks)

    debug('\n')
    debug(`${YELLOW}=== FINAL SUBTITLE TRACKS ===`)
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        const format = getSubtitleFormat(track)
        const type = getSubtitleType(track)
        const localIndex = track.LOCAL_INDEX
        debug(`${YELLOW}[${i}] ${lang} ${format} ${type} - "${track.Title}" (li: ${localIndex}) Default: ${isDefaultTrack(track)}`)
    })
    debug('\n')
}

function sortSubtitleTracks(tracks: SubtitleTrack[]): void {
    tracks.sort((a: SubtitleTrack, b: SubtitleTrack) => {
        const langA = a.Language || ''
        const langB = b.Language || ''
        const typeA = getSubtitleType(a)
        const typeB = getSubtitleType(b)
        const formatA = getSubtitleFormat(a)
        const formatB = getSubtitleFormat(b)

        // Sort by language priority (de, en, then rest)
        const langPriorityA = PRESET_LANGUAGES.indexOf(langA)
        const langPriorityB = PRESET_LANGUAGES.indexOf(langB)
        const finalLangA = langPriorityA === -1 ? 999 : langPriorityA
        const finalLangB = langPriorityB === -1 ? 999 : langPriorityB

        if (finalLangA !== finalLangB) {
            return finalLangA - finalLangB
        }

        // For the same language: Sort by type priority
        const typePriorityA = PRESET_SUBTITLE_PRIORITY.indexOf(typeA)
        const typePriorityB = PRESET_SUBTITLE_PRIORITY.indexOf(typeB)
        const finalTypeA = typePriorityA === -1 ? 999 : typePriorityA
        const finalTypeB = typePriorityB === -1 ? 999 : typePriorityB

        if (finalTypeA !== finalTypeB) {
            return finalTypeA - finalTypeB
        }

        // For the same type: Sort by format priority
        const formatPriorityA = PRESET_SUBTITLE_ORDER.indexOf(formatA)
        const formatPriorityB = PRESET_SUBTITLE_ORDER.indexOf(formatB)
        const finalFormatA = formatPriorityA === -1 ? 999 : formatPriorityA
        const finalFormatB = formatPriorityB === -1 ? 999 : formatPriorityB

        return finalFormatA - finalFormatB
    })

    // Filter now: Keep only the best track per language + type combination
    const seen = new Set<string>()
    const filtered: SubtitleTrack[] = []

    tracks.forEach(track => {
        const language = track.Language || ''
        const type = getSubtitleType(track)
        const format = getSubtitleFormat(track)
        const key = `${language}-${type}`

        if (!seen.has(key)) {
            debug(`${YELLOW}Keeping: ${language} ${type} ${format} - "${track.Title}"`)
            seen.add(key)
            filtered.push(track)
        } else {
            debug(`${YELLOW}Skipping: ${language} ${type} ${format} - "${track.Title}" (already have better)`)
        }
    })

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