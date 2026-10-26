export interface ParsedEpisode {
    season: number | null
    episode: number
    /** Serienname (Text vor der Episodenangabe) */
    series: string
}

const EPISODE_REGEX = /[Ss](\d+)[Ee](\d+)|(\d+)x(\d+)|(?<![Ss\d])[Ee](\d+)/
const SERIES_REGEX = /^(.+?)[\s.\-_]*(?:[Ss]\d+[Ee]\d+|\d+x\d+|[Ee]\d+)/
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/

/** Erkennt S01E02, 1x02 oder ein alleinstehendes E01. */
export function parseEpisode(name: string): ParsedEpisode | null {
    const match = name.match(EPISODE_REGEX)
    if (!match) return null

    const seriesMatch = name.match(SERIES_REGEX)
    const series = seriesMatch
        ? seriesMatch[1]
              .replace(/[.\-_]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        : ''

    if (match[1] && match[2]) return { season: Number(match[1]), episode: Number(match[2]), series }
    if (match[3] && match[4]) return { season: Number(match[3]), episode: Number(match[4]), series }
    return { season: null, episode: Number(match[5]), series }
}

export function detectEdition(fileName: string): string | null {
    const name = fileName.toLowerCase()
    const extended = name.includes('extended')
    const upscale = name.includes('upsuhd') || name.includes('upscale')

    if (extended && upscale) return 'Extended-Upscale'
    if (extended) return 'Extended'
    if (upscale) return 'Upscale'
    if (name.includes('director')) return "Director's Cut"
    return null
}

export function detectSource(fileName: string, fullPath: string, defaultSource: string): string {
    const name = fileName.toLowerCase()
    const path = fullPath.toLowerCase()
    const upscale = name.includes('upsuhd') || name.includes('upscale')

    if (name.includes('dsnp') || path.includes('dsnp') || path.includes('disney')) return 'Disney+'
    if (path.includes('amazon')) return 'Amazon'
    if (path.includes('netflix')) return 'Netflix'
    if (name.includes('atvp')) return 'ATVP'
    if (name.includes('rtl')) return 'RTL+'
    if (name.includes('web')) return 'Web'
    if (name.includes('uhd')) return upscale ? 'BluRay' : 'UHD'
    if (name.includes('bluray') || name.includes('bdrip')) return 'BluRay'
    return defaultSource
}

/** Name ist bereits im Zielschema (z. B. von einem früheren Lauf). */
export function isAlreadyFormatted(name: string): boolean {
    const lower = name.toLowerCase()
    return lower.startsWith('s0') || lower.startsWith('s1') || lower.includes('{source-') || lower.includes('{edition-')
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * Erzeugt den Zielnamen ohne Endung, z. B. `S01E02 - Titel {edition-Extended} {source-Web}`.
 * Ohne Titel entfällt der ` - `-Teil. Nicht erkannte Dateien behalten ihren Namen.
 */
export function buildTargetStem(file: { name: string; fullPath: string }, defaultSource: string, title = ''): string {
    if (isAlreadyFormatted(file.name)) return file.name

    const parsed = parseEpisode(file.name)
    if (!parsed) return file.name

    const edition = detectEdition(file.name)
    const source = detectSource(file.name, file.fullPath, defaultSource)

    let stem = `S${pad(parsed.season ?? 1)}E${pad(parsed.episode)}`
    if (title.trim()) stem += ` - ${title.trim()}`
    if (edition) stem += ` {edition-${edition}}`
    stem += ` {source-${source}}`
    return stem
}

/** Prüft einen vom Nutzer eingegebenen Dateinamen (ohne Endung). Gibt eine Fehlermeldung oder `null` zurück. */
export function validateStem(stem: string): string | null {
    if (!stem.trim()) return 'Name darf nicht leer sein'
    if (INVALID_FILENAME_CHARS.test(stem)) return 'Ungültige Zeichen: < > : " / \\ | ? *'
    if (/[. ]$/.test(stem)) return 'Name darf nicht mit Punkt oder Leerzeichen enden'
    return null
}
