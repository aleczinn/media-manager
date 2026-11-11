import type { TmdbImage, VideoFrame } from './types'

export interface ImageSize {
    width: number
    height: number
}

/** Mindestens HD: 1280 breit oder 720 hoch (auch bei Cinemascope oder 4:3) */
export function isHd(size: ImageSize): boolean {
    return size.width >= 1280 || size.height >= 720
}

export interface DefaultStill {
    path: string | null
    /** Das TMDB-Standardbild war zu klein und wurde ersetzt (seine Größe für den Hinweis) */
    replacedLowRes: ImageSize | null
}

/**
 * Standard-Vorschaubild einer Folge, möglichst in HD: das TMDB-Standardbild, wenn es groß genug ist, sonst ein
 * HD-Standbild aus dem Video (das bei einem Drittel zuerst), sonst ein anderes HD-Bild der Folge bei TMDB. Nur wenn es
 * nichts in HD gibt, bleibt das kleine Bild. Solange die Bildliste von TMDB fehlt, gilt das Standardbild wie bisher.
 */
export function chooseDefaultStill(tmdbDefault: string | null, tmdbImages: TmdbImage[] | null, frames: VideoFrame[] | null): DefaultStill {
    const current = tmdbImages?.find((image) => image.path === tmdbDefault)
    if (current && !isHd(current)) {
        const hd = frames?.find(isHd) ?? tmdbImages?.find(isHd)
        if (hd) return { path: hd.path, replacedLowRes: { width: current.width, height: current.height } }
    }
    return { path: tmdbDefault ?? frames?.[0]?.path ?? null, replacedLowRes: null }
}

/** Standbilder werden gebraucht, wenn TMDB kein Bild hat oder das Standardbild (laut Bildliste) kleiner als HD ist */
export function needsFrames(tmdbDefault: string | null, tmdbImages: TmdbImage[] | null): boolean {
    if (!tmdbDefault) return true
    const current = tmdbImages?.find((image) => image.path === tmdbDefault)
    return !!current && !isHd(current)
}

/** Größe eines Episodenbilds, soweit bekannt (TMDB-Bildliste oder Standbild) */
export function stillSize(path: string | null, tmdbImages: TmdbImage[] | null, frames: VideoFrame[] | null): ImageSize | null {
    if (!path) return null
    const found = tmdbImages?.find((image) => image.path === path) ?? frames?.find((frame) => frame.path === path)
    return found ? { width: found.width, height: found.height } : null
}

/** Reihenfolge in der Bildauswahl: HD-Bilder von TMDB, dann HD-Standbilder, kleine Bilder (beider Quellen) am Ende */
export function sortByResolution<T extends ImageSize>(images: T[]): T[] {
    return [...images.filter(isHd), ...images.filter((image) => !isHd(image))]
}

/** Breite und Höhe aus dem Kopf eines JPGs (SOF-Marker), `null` wenn nicht lesbar */
export function readJpegSize(data: Uint8Array): ImageSize | null {
    if (data[0] !== 0xff || data[1] !== 0xd8) return null
    let offset = 2
    while (offset + 9 < data.length) {
        if (data[offset] !== 0xff) return null
        const marker = data[offset + 1]
        const length = (data[offset + 2] << 8) | data[offset + 3]
        // SOF0–SOF15 außer DHT (C4), JPG (C8) und DAC (CC) tragen die Bildgröße
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: (data[offset + 5] << 8) | data[offset + 6], width: (data[offset + 7] << 8) | data[offset + 8] }
        }
        offset += 2 + length
    }
    return null
}
