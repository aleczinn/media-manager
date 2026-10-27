/** Sprache, die im YouTube-Modus jede Tonspur bekommt, egal wie sie getaggt ist */
export const YOUTUBE_AUDIO_LANGUAGE = 'de'

/** Qualitätsangaben von JDownloader, z. B. ` (2160p_60fps_AV1-128kbit_AAC-Deutsch)` */
const QUALITY_REGEX = /\s*\(\d{3,4}p_\d+fps_[^)]*\)/g
/** Zusätze an Beschreibung und Vorschaubild */
const SIDECAR_REGEX = /\s*\((?:Beschreibung|BQ)\)/g

/** Entfernt Qualitätsangaben sowie `(Beschreibung)` und `(BQ)`; Emojis und Sonderzeichen bleiben */
export function cleanYoutubeName(name: string): string {
    return name.replace(QUALITY_REGEX, '').replace(SIDECAR_REGEX, '').trim()
}

export interface SidecarNames {
    /** Dateiname der Beschreibung (.txt) */
    description: string | null
    /** Dateiname des Vorschaubilds (.jpg) */
    image: string | null
}

const stemOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '')
const extensionOf = (fileName: string) => (fileName.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase()

/** Sucht Beschreibung und Bild zu einem Video (Name ohne Endung): gleicher Name nach der Bereinigung */
export function matchSidecars(videoName: string, fileNames: string[]): SidecarNames {
    const key = cleanYoutubeName(videoName).toLowerCase()
    const find = (extensions: string[]) =>
        fileNames.find((name) => extensions.includes(extensionOf(name)) && cleanYoutubeName(stemOf(name)).toLowerCase() === key) ?? null
    return { description: find(['.txt']), image: find(['.jpg', '.jpeg']) }
}
