import { isPlaceholderTitle } from '../shared/tmdb-match'
import type { ArtworkCandidate, TmdbEpisode, TmdbImage, TmdbMovie, TmdbResult, TmdbSeasonSummary, TmdbShow } from '../shared/types'

const API = 'https://api.themoviedb.org/3'
const IMAGE = 'https://image.tmdb.org/t/p'
const LANGUAGE = 'de-DE'
const FALLBACK_LANGUAGE = 'en-US'

export class TmdbError extends Error {}

interface RawShow {
    id: number
    name: string
    original_name: string
    first_air_date?: string
    overview?: string
    poster_path?: string | null
}

interface RawMovie {
    id: number
    title: string
    original_title: string
    release_date?: string
    overview?: string
    poster_path?: string | null
}

interface RawImage {
    file_path: string
    width: number
    height: number
    vote_average?: number
    iso_639_1?: string | null
}

interface RawEpisode {
    season_number: number
    episode_number: number
    name?: string
    still_path?: string | null
    air_date?: string | null
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

export async function wrap<T>(run: () => Promise<T>): Promise<TmdbResult<T>> {
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

const toMovie = (raw: RawMovie): TmdbMovie => ({
    id: raw.id,
    name: raw.title,
    originalName: raw.original_title,
    year: raw.release_date ? Number(raw.release_date.slice(0, 4)) || null : null,
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

/** Sucht Filme; ohne Treffer mit Jahr wird ohne Jahr nochmal gesucht */
export function searchMovie(apiKey: string, query: string, year: number | null): Promise<TmdbResult<TmdbMovie[]>> {
    return wrap(async () => {
        const search = (withYear: boolean) =>
            request<{ results: RawMovie[] }>(apiKey, '/search/movie', {
                query,
                language: LANGUAGE,
                ...(withYear && year ? { primary_release_year: String(year) } : {})
            })
        let { results } = await search(true)
        if (results.length === 0 && year) results = (await search(false)).results
        return results.map(toMovie)
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

/** Genres einer Serie bzw. eines Films auf Deutsch (bei Serien aus derselben, gecachten Abfrage wie die Staffeln) */
export function getGenres(apiKey: string, kind: 'tv' | 'movie', id: number): Promise<TmdbResult<string[]>> {
    return wrap(async () => {
        const details = await request<{ genres?: { name: string }[] }>(apiKey, `/${kind}/${id}`, { language: LANGUAGE })
        return (details.genres ?? []).map((genre) => genre.name).filter(Boolean)
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
                stillPath: episode.still_path ?? english?.still_path ?? null,
                airDate: episode.air_date || null
            }
        })
    })
}

/** Alle Bilder (Stills) einer Episode, die am besten bewerteten zuerst */
export function getEpisodeImages(apiKey: string, showId: number, season: number, episode: number): Promise<TmdbResult<TmdbImage[]>> {
    return wrap(async () => {
        const images = await request<{ stills?: { file_path: string; width: number; height: number; vote_average?: number }[] }>(
            apiKey,
            `/tv/${showId}/season/${season}/episode/${episode}/images`
        )
        return (images.stills ?? [])
            .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
            .map((still) => ({ path: still.file_path, width: still.width, height: still.height }))
    })
}

const IMAGE_LANGUAGES = { include_image_language: 'de,en,null' }

/** Wandelt ein TMDB-Bild in einen Vorschlag; Logos gibt es teils nur als SVG, die fallen weg */
function toCandidate(image: RawImage, previewSize: string): ArtworkCandidate | null {
    if (!/\.(jpe?g|png)$/i.test(image.file_path)) return null
    return {
        source: 'tmdb',
        url: `${IMAGE}/original${image.file_path}`,
        previewUrl: `${IMAGE}/${previewSize}${image.file_path}`,
        lang: image.iso_639_1 || null,
        width: image.width,
        height: image.height,
        score: image.vote_average ?? 0
    }
}

const toCandidates = (images: RawImage[] | undefined, previewSize: string) =>
    (images ?? []).map((image) => toCandidate(image, previewSize)).filter((candidate) => candidate !== null)

/** Poster, Hintergründe und Logos einer Serie oder eines Films (Deutsch, Englisch und ohne Text) */
export async function getTmdbArtwork(
    apiKey: string,
    kind: 'tv' | 'movie',
    id: number
): Promise<{ poster: ArtworkCandidate[]; backdrop: ArtworkCandidate[]; logo: ArtworkCandidate[] }> {
    const images = await request<{ posters?: RawImage[]; backdrops?: RawImage[]; logos?: RawImage[] }>(
        apiKey,
        `/${kind}/${id}/images`,
        IMAGE_LANGUAGES
    )
    return {
        poster: toCandidates(images.posters, 'w342'),
        backdrop: toCandidates(images.backdrops, 'w780'),
        logo: toCandidates(images.logos, 'w500')
    }
}

export async function getTmdbSeasonPosters(apiKey: string, showId: number, season: number): Promise<ArtworkCandidate[]> {
    const images = await request<{ posters?: RawImage[] }>(apiKey, `/tv/${showId}/season/${season}/images`, IMAGE_LANGUAGES)
    return toCandidates(images.posters, 'w342')
}

/** TheTVDB-ID einer Serie, über die Fanart.tv Serien findet */
export async function getTvdbId(apiKey: string, showId: number): Promise<number | null> {
    const ids = await request<{ tvdb_id?: number | null }>(apiKey, `/tv/${showId}/external_ids`)
    return ids.tvdb_id ?? null
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
