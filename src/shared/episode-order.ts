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
                // Nur die deutsche aus der Ausstrahlung; die der Gruppe kann englisch sein
                overview: original?.overview ?? '',
                overviewEn: original?.overviewEn,
                stillPath: original?.stillPath ?? entry.stillPath,
                airDate: original?.airDate ?? entry.airDate,
                aired: { season: entry.season, episode: entry.episode }
            })
        })
        seasons.push({ season, name: group.name, episodeCount: list.length })
    }

    return { seasons, episodes: episodes.sort(compareEpisodes) }
}

/** Schlüssel einer Folge in der Ausstrahlungsreihenfolge, z. B. `2x8`; gilt unabhängig von der gewählten Reihenfolge */
export function airedKey(episode: { season: number; episode: number; aired?: { season: number; episode: number } }): string {
    const ref = episode.aired ?? episode
    return `${ref.season}x${ref.episode}`
}

/**
 * Teilt Folgen, die TMDB als eine führt, in mehrere Teile, z. B. „Weihnachten“ (2x8) in „Weihnachten (Teil 1)“ und
 * „(Teil 2)“. Innerhalb der Staffel wird neu durchgezählt, alle späteren Folgen rücken nach (Guru 2x9 → 2x10).
 * `splits` nennt je {@link airedKey} die Anzahl der Teile. Ab Teil 2 gibt es kein TMDB-Bild, dafür ein Standbild aus dem Video.
 */
export function splitEpisodes(
    episodes: TmdbEpisode[],
    seasons: TmdbSeasonSummary[],
    splits: Record<string, number>
): { seasons: TmdbSeasonSummary[]; episodes: TmdbEpisode[] } {
    if (!Object.values(splits).some((parts) => parts > 1)) return { seasons, episodes }

    // Zusätzliche Teile je Staffel bisher; um so viel rücken die späteren Folgen nach (Lücken bei TMDB bleiben erhalten)
    const shifts = new Map<number, number>()
    const result: TmdbEpisode[] = []
    for (const episode of [...episodes].sort((a, b) => a.season - b.season || a.episode - b.episode)) {
        const parts = Math.max(1, Math.min(9, Math.round(splits[airedKey(episode)] ?? 1)))
        const shift = shifts.get(episode.season) ?? 0
        shifts.set(episode.season, shift + parts - 1)
        for (let index = 1; index <= parts; index++) {
            const number = episode.episode + shift + index - 1
            // Auch nachgerückte Folgen merken sich ihre TMDB-Nummer, damit Bilder und NFO stimmen
            const shifted = number !== episode.episode || parts > 1
            const aired = episode.aired ?? (shifted ? { season: episode.season, episode: episode.episode } : undefined)
            result.push(
                parts === 1
                    ? { ...episode, episode: number, ...(aired && { aired }) }
                    : {
                          ...episode,
                          episode: number,
                          title: `${episode.title} (Teil ${index})`,
                          stillPath: index === 1 ? episode.stillPath : null,
                          aired,
                          part: { index, count: parts }
                      }
            )
        }
    }

    return {
        seasons: seasons.map((season) => ({ ...season, episodeCount: season.episodeCount + (shifts.get(season.season) ?? 0) })),
        episodes: result.sort(compareEpisodes)
    }
}
