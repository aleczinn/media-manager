import type { ArtworkCandidate, TmdbResult } from '../shared/types'

const API = 'https://webservice.fanart.tv/v3'

class FanartError extends Error {}

interface RawFanart {
    url: string
    lang?: string
    likes?: string
    season?: string
}

type RawResponse = Record<string, RawFanart[] | string | undefined>

export interface FanartArtwork {
    poster: ArtworkCandidate[]
    logo: ArtworkCandidate[]
    backdrop: ArtworkCandidate[]
    landscape: ArtworkCandidate[]
    seasons: Record<number, ArtworkCandidate[]>
}

const cache = new Map<string, Promise<RawResponse | null>>()

/** Lädt die Bildliste; `null`, wenn Fanart.tv zu diesem Titel nichts hat */
function load(apiKey: string, path: string): Promise<RawResponse | null> {
    const key = apiKey.trim()
    const url = `${API}${path}?api_key=${encodeURIComponent(key)}`
    const cached = cache.get(url)
    if (cached) return cached

    const promise = (async () => {
        let response: Response
        try {
            response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
        } catch {
            throw new FanartError('Fanart.tv ist nicht erreichbar (Internetverbindung prüfen)')
        }
        if (response.status === 401 || response.status === 403) throw new FanartError('Fanart.tv lehnt den API-Key ab')
        if (response.status === 404) return null
        if (!response.ok) throw new FanartError(`Fanart.tv-Fehler ${response.status}`)
        return (await response.json()) as RawResponse
    })()

    cache.set(url, promise)
    promise.catch(() => cache.delete(url))
    return promise
}

function toCandidate(raw: RawFanart): ArtworkCandidate {
    return {
        source: 'fanart',
        url: raw.url,
        // Fanart.tv liefert unter /preview/ eine verkleinerte Fassung desselben Bilds
        previewUrl: raw.url.replace('/fanart/', '/preview/'),
        lang: !raw.lang || raw.lang === '00' ? null : raw.lang,
        score: Number(raw.likes) || 0
    }
}

function list(response: RawResponse, ...types: string[]): ArtworkCandidate[] {
    return types.flatMap((type) => {
        const entries = response[type]
        return Array.isArray(entries) ? entries.map(toCandidate) : []
    })
}

function seasons(response: RawResponse): Record<number, ArtworkCandidate[]> {
    const result: Record<number, ArtworkCandidate[]> = {}
    const entries = response.seasonposter
    if (!Array.isArray(entries)) return result
    for (const entry of entries) {
        const season = Number(entry.season)
        if (!entry.season || !Number.isInteger(season)) continue
        ;(result[season] ??= []).push(toCandidate(entry))
    }
    return result
}

const empty = (): FanartArtwork => ({ poster: [], logo: [], backdrop: [], landscape: [], seasons: {} })

/** Bilder einer Serie (über die TheTVDB-ID) oder eines Films (über die TMDB-ID) */
export async function getFanartArtwork(apiKey: string, kind: 'tv' | 'movie', id: number): Promise<FanartArtwork> {
    if (kind === 'tv') {
        const response = await load(apiKey, `/tv/${id}`)
        if (!response) return empty()
        return {
            poster: list(response, 'tvposter'),
            logo: list(response, 'hdtvlogo', 'clearlogo'),
            backdrop: list(response, 'showbackground'),
            landscape: list(response, 'tvthumb'),
            seasons: seasons(response)
        }
    }

    const response = await load(apiKey, `/movies/${id}`)
    if (!response) return empty()
    return {
        poster: list(response, 'movieposter'),
        logo: list(response, 'hdmovielogo', 'movielogo'),
        backdrop: list(response, 'moviebackground'),
        landscape: list(response, 'moviethumb'),
        seasons: {}
    }
}

export function fanartMessage(error: unknown): string {
    return error instanceof FanartError ? error.message : `Fanart.tv-Fehler: ${String(error)}`
}

/** Prüft einen (noch nicht gespeicherten) Key mit einem bekannten Film (Matrix, TMDB-ID 603) */
export async function testFanartKey(apiKey: string): Promise<TmdbResult<true>> {
    if (!apiKey.trim()) return { ok: false, error: 'Kein Fanart.tv-API-Key eingetragen' }
    try {
        await load(apiKey, '/movies/603')
        return { ok: true, data: true }
    } catch (error) {
        return { ok: false, error: fanartMessage(error) }
    }
}
