/** Kodi/Jellyfin-NFO neben der MKV: Jellyfin liest sie als lokale Metadaten (NFO-Leser in der Bibliothek aktiv) */

const HEADER = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>'

export function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/** Ein Element pro Zeile; leere Werte fallen weg */
function element(name: string, value: string | number | null | undefined, attributes = ''): string | null {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text ? `  <${name}${attributes}>${escapeXml(text)}</${name}>` : null
}

function document(root: string, lines: (string | null)[]): string {
    return [HEADER, `<${root}>`, ...lines.filter((line) => line !== null), `</${root}>`, ''].join('\n')
}

export interface EpisodeNfo {
    showTitle: string
    season: number
    episode: number
    title: string
    plot: string
    /** Erstausstrahlung (YYYY-MM-DD) */
    aired: string | null
    /**
     * Daten sperren, damit Jellyfin sie nicht per TMDB überschreibt. Nötig, wenn die Nummer nicht zu TMDB passt
     * (geteilte Folge, andere Reihenfolge, manuelle Zuordnung), sonst würde Jellyfin die falsche Folge abrufen.
     */
    lock: boolean
}

export function buildEpisodeNfo(nfo: EpisodeNfo): string {
    return document('episodedetails', [
        element('title', nfo.title),
        element('showtitle', nfo.showTitle),
        element('season', nfo.season),
        element('episode', nfo.episode),
        element('plot', nfo.plot),
        element('aired', nfo.aired),
        nfo.lock ? '  <lockdata>true</lockdata>' : null
    ])
}

export interface MovieNfo {
    title: string
    originalTitle: string
    year: number | null
    plot: string
    genres: string[]
    tmdbId: number
}

/** Mit TMDB-ID, damit Jellyfin den Film eindeutig zuordnet und Besetzung usw. selbst ergänzt */
export function buildMovieNfo(nfo: MovieNfo): string {
    return document('movie', [
        element('title', nfo.title),
        nfo.originalTitle && nfo.originalTitle !== nfo.title ? element('originaltitle', nfo.originalTitle) : null,
        element('year', nfo.year),
        element('plot', nfo.plot),
        ...nfo.genres.map((genre) => element('genre', genre)),
        element('uniqueid', nfo.tmdbId, ' type="tmdb" default="true"'),
        element('tmdbid', nfo.tmdbId)
    ])
}

export interface NfoPlot {
    text: string
    /** Woher die Beschreibung kommt: TMDB deutsch, Datei-Metadaten, TMDB englisch (Ersatz); `null` = keine */
    source: 'tmdb' | 'file' | 'tmdb-en' | null
}

/**
 * Beschreibung für die NFO, möglichst auf Deutsch: zuerst die deutsche von TMDB, dann (falls gewünscht) die aus den
 * Metadaten der Datei (`description`/`synopsis`, z. B. von deutschen Web-Releases), zuletzt die englische von TMDB.
 * Bei einem Teil einer geteilten Folge kommt die der Datei zuerst, weil TMDB dort die ganze Doppelfolge beschreibt.
 */
export function chooseEpisodePlot(
    episode: { overview: string; overviewEn?: string },
    fileTags: Record<string, string> | undefined,
    { isPart, useFile }: { isPart: boolean; useFile: boolean }
): NfoPlot {
    const german: NfoPlot = { text: episode.overview.trim(), source: 'tmdb' }
    const file: NfoPlot = { text: useFile ? (fileTags?.description || fileTags?.synopsis || '').trim() : '', source: 'file' }
    const english: NfoPlot = { text: episode.overviewEn?.trim() ?? '', source: 'tmdb-en' }
    const order = isPart ? [file, german, english] : [german, file, english]
    return order.find((plot) => plot.text) ?? { text: '', source: null }
}
