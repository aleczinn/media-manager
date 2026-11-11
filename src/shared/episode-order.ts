import type { TmdbEpisode, TmdbEpisodeGroupDetails, TmdbSeasonSummary } from './types'

/** Bezeichnung der Reihenfolge-Typen bei TMDB */
export const EPISODE_GROUP_TYPES: Record<number, string> = {
    1: 'Erstausstrahlung',
    2: 'Absolut',
    3: 'DVD',
    4: 'Digital',
    5: 'Handlungsbogen',
    6: 'Produktion',
    7: 'TV'
}

const SPECIALS = /special|extra|bonus/i

/** Specials (Staffel 0) ans Ende, sonst nach Staffel und Folge */
export function compareEpisodes(a: { season: number; episode: number }, b: { season: number; episode: number }): number {
    return (a.season || 999) - (b.season || 999) || a.episode - b.episode
}

/**
 * Nummeriert die Episoden nach einer anderen Reihenfolge (z. B. DVD) neu: Jede Gruppe wird eine Staffel (Specials = 0,
 * sonst fortlaufend ab 1), die Folgen zählen innerhalb der Gruppe ab 1. Titel, Bild und Datum kommen aus den
 * (deutschen) Episoden der Ausstrahlung, die ursprüngliche Nummer bleibt in `aired` für Bildabfragen erhalten.
 */
export function applyEpisodeGroup(
    details: TmdbEpisodeGroupDetails,
    aired: TmdbEpisode[]
): { seasons: TmdbSeasonSummary[]; episodes: TmdbEpisode[] } {
    const byRef = new Map(aired.map((episode) => [`${episode.season}x${episode.episode}`, episode]))
    const seasons: TmdbSeasonSummary[] = []
    const episodes: TmdbEpisode[] = []
    let next = 1
    let specialsUsed = false

    for (const group of [...details.groups].sort((a, b) => a.order - b.order)) {
        // Nur eine Gruppe darf Staffel 0 sein, sonst überschneiden sich die Folgennummern
        const isSpecials = !specialsUsed && SPECIALS.test(group.name)
        if (isSpecials) specialsUsed = true
        const season = isSpecials ? 0 : next++
        const list = [...group.episodes].sort((a, b) => a.order - b.order)

        list.forEach((entry, index) => {
            const original = byRef.get(`${entry.season}x${entry.episode}`)
            episodes.push({
                season,
                episode: index + 1,
                title: original?.title || entry.title,
                stillPath: original?.stillPath ?? entry.stillPath,
                airDate: original?.airDate ?? entry.airDate,
                aired: { season: entry.season, episode: entry.episode }
            })
        })
        seasons.push({ season, name: group.name, episodeCount: list.length })
    }

    return { seasons, episodes: episodes.sort(compareEpisodes) }
}
