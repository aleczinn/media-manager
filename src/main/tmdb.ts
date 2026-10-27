import { isPlaceholderTitle } from '../shared/tmdb-match'
import type { TmdbEpisode, TmdbResult, TmdbSeasonSummary, TmdbShow } from '../shared/types'

const API = 'https://api.themoviedb.org/3'
const LANGUAGE = 'de-DE'
const FALLBACK_LANGUAGE = 'en-US'

class TmdbError extends Error {}

interface RawShow {
    id: number
    name: string
    original_name: string
    first_air_date?: string
    overview?: string
    poster_path?: string | null
}

interface RawEpisode {
    season_number: number
    episode_number: number
    name?: string
    still_path?: string | null
}

const cache = new Map<string, Promise<unknown>>()

/** v4 Read Access Tokens sind JWTs (beginnen mit „eyJ“), sonst ist es ein v3 API-Key */
function isAccessToken(apiKey: string): boolean {
    return apiKey.startsWith('eyJ')
}

async function request<T>(apiKey: string, path: string, params: Record<string, string> = {}): Promise<T> {
    const key = apiKey.trim()
    if (!key) throw new TmdbError('Kein TMDB-API-Key hinterlegt (Einstellungen → TMDB)')

    const url = new URL(`${API}${path}`)
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value))
    if (!isAccessToken(key)) url.searchParams.set('api_key', key)

    const cacheKey = `${key}|${url}`
    const cached = cache.get(cacheKey)
    if (cached) return cached as Promise<T>

    const promise = (async () => {
        let response: Response
        try {
            response = await fetch(url, {
                headers: { Accept: 'application/json', ...(isAccessToken(key) ? { Authorization: `Bearer ${key}` } : {}) },
                signal: AbortSignal.timeout(15_000)
            })
        } catch {
            throw new TmdbError('TMDB ist nicht erreichbar (Internetverbindung prüfen)')
        }
        if (response.status === 401) throw new TmdbError('TMDB lehnt den API-Key ab')
        if (response.status === 404) throw new TmdbError('Bei TMDB nicht gefunden')
        if (response.status === 429) throw new TmdbError('Zu viele Anfragen an TMDB, bitte kurz warten')
        if (!response.ok) throw new TmdbError(`TMDB-Fehler ${response.status}`)
        return (await response.json()) as T
    })()

    cache.set(cacheKey, promise)
    // Fehler nicht merken, damit ein neuer Versuch wieder fragt
    promise.catch(() => cache.delete(cacheKey))
    return promise
}

async function wrap<T>(run: () => Promise<T>): Promise<TmdbResult<T>> {
    try {
        return { ok: true, data: await run() }
    } catch (error) {
        return { ok: false, error: error instanceof TmdbError ? error.message : `TMDB-Fehler: ${String(error)}` }
    }
}

const toShow = (raw: RawShow): TmdbShow => ({
    id: raw.id,
    name: raw.name,
    originalName: raw.original_name,
    year: raw.first_air_date ? Number(raw.first_air_date.slice(0, 4)) || null : null,
    overview: raw.overview ?? '',
    posterPath: raw.poster_path ?? null
})

/** Sucht Serien; ohne Treffer mit Jahr wird ohne Jahr nochmal gesucht */
export function searchTv(apiKey: string, query: string, year: number | null): Promise<TmdbResult<TmdbShow[]>> {
    return wrap(async () => {
        const search = (withYear: boolean) =>
            request<{ results: RawShow[] }>(apiKey, '/search/tv', {
                query,
                language: LANGUAGE,
                ...(withYear && year ? { first_air_date_year: String(year) } : {})
            })
        let { results } = await search(true)
        if (results.length === 0 && year) results = (await search(false)).results
        return results.map(toShow)
    })
}

export function getSeasons(apiKey: string, showId: number): Promise<TmdbResult<TmdbSeasonSummary[]>> {
    return wrap(async () => {
        const details = await request<{ seasons?: { season_number: number; name: string; episode_count: number }[] }>(
            apiKey,
            `/tv/${showId}`,
            { language: LANGUAGE }
        )
        return (details.seasons ?? []).map((season) => ({
            season: season.season_number,
            name: season.name,
            episodeCount: season.episode_count
        }))
    })
}

/** Episoden einer Staffel auf Deutsch; fehlende Übersetzungen werden mit den englischen Titeln ergänzt */
export function getSeason(apiKey: string, showId: number, season: number): Promise<TmdbResult<TmdbEpisode[]>> {
    return wrap(async () => {
        const load = (language: string) => request<{ episodes?: RawEpisode[] }>(apiKey, `/tv/${showId}/season/${season}`, { language })

        const episodes = (await load(LANGUAGE)).episodes ?? []
        let fallback: RawEpisode[] = []
        if (episodes.some((episode) => isPlaceholderTitle(episode.name))) {
            fallback = (await load(FALLBACK_LANGUAGE)).episodes ?? []
        }

        return episodes.map((episode) => {
            const english = fallback.find((other) => other.episode_number === episode.episode_number)
            const title = isPlaceholderTitle(episode.name) && english?.name ? english.name : (episode.name ?? '')
            return {
                season: episode.season_number,
                episode: episode.episode_number,
                title,
                stillPath: episode.still_path ?? english?.still_path ?? null
            }
        })
    })
}

/** Prüft einen (noch nicht gespeicherten) Key */
export function testKey(apiKey: string): Promise<TmdbResult<true>> {
    return wrap(async () => {
        await request(apiKey, '/configuration')
        return true as const
    })
}

/** Lädt ein Bild herunter (für die -thumb.jpg) */
export async function downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Bild konnte nicht geladen werden (${response.status})`)
    return Buffer.from(await response.arrayBuffer())
}
