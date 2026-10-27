import { parseEpisode, sourceFolders } from './rename'
import type { TmdbEpisode } from './types'

export interface SeriesQuery {
    query: string
    year: number | null
}

/** Verweis auf eine TMDB-Episode */
export interface EpisodeRef {
    season: number
    episode: number
}

const YEAR = /\b(19\d{2}|20\d{2})\b/g

export function tmdbImageUrl(path: string, size: 'w92' | 'w185' | 'w300' | 'original' = 'original'): string {
    return `https://image.tmdb.org/t/p/${size}${path}`
}

/** Trennt eine Jahreszahl ab: „The Expanse 2015“ → „The Expanse“ + 2015 (nur plausible Jahre) */
export function splitYear(text: string, maxYear = new Date().getFullYear() + 1): SeriesQuery {
    let year: number | null = null
    const query = text
        .replace(YEAR, (match) => {
            const value = Number(match)
            if (value > maxYear) return match
            year = value
            return ''
        })
        .replace(/\s+/g, ' ')
        .trim()
    return { query: query || text.trim(), year }
}

/**
 * Suchbegriff für TMDB aus Ordner- und Dateinamen. Release-Ordner (z. B. `The.100.S02E01.Die.48…`) sind meist
 * verlässlicher als gekürzte Dateinamen (`rsg-the-100-s02e01`), daher zuerst die Ordner von innen nach außen.
 */
export function seriesQueryFromFile(file: { name: string; fullPath: string; relativePath?: string }): SeriesQuery | null {
    const candidates = [...sourceFolders(file), file.name]
    for (const candidate of candidates) {
        const series = parseEpisode(candidate)?.series
        if (series) return splitYear(series)
    }
    return null
}

/** Episode, die laut Dateiname (SxxEyy) zur Datei gehört */
export function episodeRefFromName(name: string): EpisodeRef | null {
    const parsed = parseEpisode(name)
    return parsed ? { season: parsed.season ?? 1, episode: parsed.episode } : null
}

export function findEpisode(episodes: TmdbEpisode[], ref: EpisodeRef | null): TmdbEpisode | null {
    if (!ref) return null
    return episodes.find((episode) => episode.season === ref.season && episode.episode === ref.episode) ?? null
}

/** TMDB liefert ohne Übersetzung Platzhalter wie „Episode 5“ */
export function isPlaceholderTitle(title: string | null | undefined): boolean {
    return !title?.trim() || /^(episode|folge|episodio|épisode)\s*\d+$/i.test(title.trim())
}

/** Macht einen Episodentitel dateinamentauglich: „Teil 1: Kassa“ → „Teil 1 - Kassa“, ungültige Zeichen fliegen raus */
export function sanitizeTitle(title: string): string {
    return title
        .replace(/\s*:\s*/g, ' - ')
        .replace(/[\\/]/g, '-')
        .replace(/[<>"|?*\x00-\x1f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')
}

export function formatEpisodeRef({ season, episode }: EpisodeRef): string {
    return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
}
