import type { VideoTrackInfo } from './types'

/** 3D-Formate, wie Jellyfin sie im Dateinamen erwartet (`3D.HSBS` usw.) */
export type Stereo3D = 'HSBS' | 'FSBS' | 'HTAB' | 'FTAB' | 'MVC'

/** Anordnung der beiden Bilder; ob halbe oder volle Auflösung, verrät erst die Bildgröße */
export type StereoLayout = 'sbs' | 'tab'

export const STEREO_FORMATS: { format: Stereo3D; label: string }[] = [
    { format: 'HSBS', label: 'Half Side-by-Side' },
    { format: 'FSBS', label: 'Full Side-by-Side' },
    { format: 'HTAB', label: 'Half Over-Under' },
    { format: 'FTAB', label: 'Full Over-Under' },
    { format: 'MVC', label: 'Blu-ray 3D (MVC)' }
]

/** `stereo_mode` der Videospur in der MKV; MVC steckt in einer eigenen Spur und bekommt keinen */
export const STEREO_MODE: Partial<Record<Stereo3D, string>> = {
    HSBS: 'left_right',
    FSBS: 'left_right',
    HTAB: 'top_bottom',
    FTAB: 'top_bottom'
}

/**
 * `3D`, optional gefolgt vom Format: `3D.HOU`, `3dhou`, `3D-Half-SBS`, `3D.H-OU`, `3D.HTB`, `3D.MVC` …
 * Davor und dahinter darf kein Buchstabe und keine Ziffer stehen (`3Days` zählt nicht).
 */
const STEREO_REGEX = /(?:^|[^a-z0-9])3d(?:[ ._-]?(?:(h|half|f|full)[ ._-]?(sbs|ou|tab|tb)|(sbs|ou|tab)|(htb|ftb)|(mvc)))?(?=$|[^a-z0-9])/gi

export interface Detected3D {
    is3D: boolean
    format: Stereo3D | null
}

function formatOf(match: RegExpMatchArray): Stereo3D | null {
    const [, size, layout, plainLayout, shortTab, mvc] = match
    if (mvc) return 'MVC'
    if (shortTab) return shortTab.toLowerCase() === 'ftb' ? 'FTAB' : 'HTAB'
    const kind = (layout ?? plainLayout)?.toLowerCase()
    if (!kind) return null
    // Ohne Angabe ist SBS bzw. OU fast immer die halbe Auflösung
    const full = size?.toLowerCase().startsWith('f') ?? false
    if (kind === 'sbs') return full ? 'FSBS' : 'HSBS'
    return full ? 'FTAB' : 'HTAB'
}

/** Erkennt 3D und das Format erst am Dateinamen, dann an den Ordnern (von innen nach außen) */
export function detect3D(fileName: string, folders: string[] = []): Detected3D {
    let is3D = false
    for (const name of [fileName, ...folders]) {
        for (const match of name.matchAll(STEREO_REGEX)) {
            is3D = true
            const format = formatOf(match)
            if (format) return { is3D, format }
        }
    }
    return { is3D, format: null }
}

/** Entfernt 3D-Angaben aus einem Namen, z. B. für die Suche bei TMDB */
export function strip3D(name: string): string {
    return name.replace(STEREO_REGEX, ' ')
}

const TAG_REGEX = /\s+3D\.(?:HSBS|FSBS|HTAB|FTAB|MVC)$/i

/** Setzt die Jellyfin-Kennung ` 3D.<FORMAT>` ans Ende; eine vorhandene wird ersetzt bzw. ohne Format entfernt */
export function with3DTag(stem: string, format: Stereo3D | null): string {
    const base = stem.replace(TAG_REGEX, '')
    return format ? `${base} 3D.${format}` : base
}

type VideoSize = Pick<VideoTrackInfo, 'width' | 'height'>

/** Volle Auflösung: zwei ganze Bilder nebeneinander (z. B. 3840×1080) bzw. übereinander (z. B. 1920×2160) */
function isFull(layout: StereoLayout, video: VideoSize | undefined): boolean {
    if (!video?.width || !video.height) return false
    const ratio = video.width / video.height
    return layout === 'sbs' ? ratio >= 3 : ratio <= 1
}

/** Macht aus der Anordnung das Format, Half oder Full je nach Bildgröße */
export function withResolution(layout: StereoLayout, video: VideoSize | undefined): Stereo3D {
    const full = isFull(layout, video)
    if (layout === 'sbs') return full ? 'FSBS' : 'HSBS'
    return full ? 'FTAB' : 'HTAB'
}

/** Format aus der Datei selbst: vorhandenes `stereo_mode` oder eine MVC-Spur */
export function formatFromVideo(video: VideoTrackInfo | undefined): Stereo3D | null {
    if (!video) return null
    if (video.stereoMode === 'left_right' || video.stereoMode === 'right_left') return withResolution('sbs', video)
    if (video.stereoMode === 'top_bottom' || video.stereoMode === 'bottom_top') return withResolution('tab', video)
    return video.mvc ? 'MVC' : null
}

/** Mindestabstand der mittleren SSIM-Werte (links/rechts gegen oben/unten) */
export const LAYOUT_MIN_GAP = 0.05

/**
 * Entscheidet anhand der SSIM-Werte je Frame (linke gegen rechte bzw. obere gegen untere Hälfte).
 * Absolute Werte taugen nicht (dunkle Szenen und Balken ähneln sich immer), entscheidend ist der Abstand:
 * im Mittel mindestens `LAYOUT_MIN_GAP` und in fast allen Frames dieselbe Richtung.
 */
export function decideLayout(sbs: number[], tab: number[]): StereoLayout | null {
    const count = Math.min(sbs.length, tab.length)
    if (count === 0) return null
    const gaps = Array.from({ length: count }, (_, index) => sbs[index] - tab[index])
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / count
    if (Math.abs(mean) < LAYOUT_MIN_GAP) return null
    const agreeing = gaps.filter((gap) => Math.sign(gap) === Math.sign(mean)).length
    if (agreeing < count - Math.floor(count / 6)) return null
    return mean > 0 ? 'sbs' : 'tab'
}

/** Hinweis, wenn das gewählte Format nicht zur Datei passt */
export function stereoWarning(format: Stereo3D | null, video: VideoTrackInfo | undefined): string | null {
    if (!format || !video) return null
    if (format === 'MVC') {
        return video.mvc
            ? 'MVC-Spur gefunden; ob ffmpeg sie beim Kopieren erhält, bitte am Ergebnis prüfen'
            : 'Keine MVC-Spur in der Datei gefunden'
    }
    if (video.mvc) return 'Die Datei enthält eine MVC-Spur, passt eher zu MVC'
    const layout: StereoLayout = format === 'HSBS' || format === 'FSBS' ? 'sbs' : 'tab'
    const expected = withResolution(layout, video)
    if (video.width && video.height && expected !== format) {
        return `Auflösung ${video.width}×${video.height} passt eher zu ${expected}`
    }
    return null
}
