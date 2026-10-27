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

const isUpscale = (name: string) => name.includes('upsuhd') || name.includes('upscale')

/** Quellen, die am Namen erkannt werden (erst Dateiname, dann Ordnernamen) */
function sourceFromName(name: string, upscale: boolean): string | null {
    if (name.includes('atvp')) return 'ATVP'
    if (name.includes('rtl')) return 'RTL+'
    if (name.includes('web')) return 'Web'
    if (name.includes('uhd')) return upscale ? 'BluRay' : 'UHD'
    if (name.includes('bluray') || name.includes('bdrip')) return 'BluRay'
    return null
}

/**
 * Ordnernamen für die Quellerkennung, von innen nach außen: die Unterordner innerhalb des Input-Ordners
 * und der Input-Ordner selbst. Höher liegende Ordner zählen nicht (z. B. „WebstormProjects“ ≠ Web).
 */
export function sourceFolders(file: { fullPath: string; relativePath?: string }): string[] {
    if (!file.relativePath) return []
    const inner = file.relativePath.split(/[\\/]/).slice(0, -1).reverse()
    const root = file.fullPath.slice(0, file.fullPath.length - file.relativePath.length).replace(/[\\/]+$/, '')
    const rootName = root.split(/[\\/]/).pop() ?? ''
    return rootName ? [...inner, rootName] : inner
}

export function detectSource(fileName: string, fullPath: string, defaultSource: string, folders: string[] = []): string {
    const name = fileName.toLowerCase()
    const path = fullPath.toLowerCase()
    const upscale = isUpscale(name)

    if (name.includes('dsnp') || path.includes('dsnp') || path.includes('disney')) return 'Disney+'
    if (path.includes('amazon')) return 'Amazon'
    if (path.includes('netflix')) return 'Netflix'

    const fromFileName = sourceFromName(name, upscale)
    if (fromFileName) return fromFileName

    for (const folder of folders) {
        const lower = folder.toLowerCase()
        const fromFolder = sourceFromName(lower, upscale || isUpscale(lower))
        if (fromFolder) return fromFolder
    }
    return defaultSource
}

/** Name ist bereits im Zielschema (z. B. von einem früheren Lauf). */
export function isAlreadyFormatted(name: string): boolean {
    const lower = name.toLowerCase()
    return lower.startsWith('s0') || lower.startsWith('s1') || lower.includes('{source-') || lower.includes('{edition-')
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Platzhalter-Titel wie im alten CLI, bis der Nutzer den Episodentitel einträgt */
export const UNKNOWN_TITLE = 'Unknown'

/**
 * Erzeugt den Zielnamen ohne Endung, z. B. `S01e02 - Titel {edition-Extended} {source-Web}`.
 * Ohne Titel wird `Unknown` eingesetzt. Mit zugeordnetem Film wird eine Datei ohne Episodenangabe
 * zu `Titel (Jahr) {edition-…} {source-…}`. Sonst nicht erkannte Dateien behalten ihren Namen.
 */
export function buildTargetStem(
    file: { name: string; fullPath: string; relativePath?: string },
    defaultSource: string,
    title = '',
    movie: { title: string; year: number | null } | null = null
): string {
    if (isAlreadyFormatted(file.name)) return file.name

    const parsed = parseEpisode(file.name)
    if (!parsed && !movie) return file.name

    const edition = detectEdition(file.name)
    const source = detectSource(file.name, file.fullPath, defaultSource, sourceFolders(file))

    let stem = parsed
        ? `S${pad(parsed.season ?? 1)}e${pad(parsed.episode)} - ${title.trim() || UNKNOWN_TITLE}`
        : `${movie!.title.trim() || UNKNOWN_TITLE}${movie!.year ? ` (${movie!.year})` : ''}`
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
