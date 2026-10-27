/** Overlays für Cover und Staffelposter, als 600×900-PNG in `resources/overlays` */
export type OverlayId = '4k' | 'upscale' | 'extended' | 'directors-cut' | 'imax' | 'regrade'

export const OVERLAYS: { id: OverlayId; label: string; position: string }[] = [
    { id: '4k', label: '4K', position: 'oben links' },
    { id: 'upscale', label: 'Upscale', position: 'oben Mitte' },
    { id: 'extended', label: 'Extended', position: 'unten Mitte' },
    { id: 'directors-cut', label: "Director's Cut", position: 'unten Mitte' },
    { id: 'imax', label: 'IMAX', position: 'unten rechts' },
    { id: 'regrade', label: 'Regrade', position: 'unten rechts' }
]

/** Overlays an derselben Stelle, von denen nur eins aktiv sein kann */
const EXCLUSIVE: OverlayId[][] = [['extended', 'directors-cut']]

const ORDER = OVERLAYS.map((overlay) => overlay.id)
const sorted = (ids: OverlayId[]) => [...new Set(ids)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))

/** Schaltet ein Overlay um; Extended und Director's Cut verdrängen sich gegenseitig */
export function toggleOverlay(selected: OverlayId[], id: OverlayId): OverlayId[] {
    if (selected.includes(id)) return selected.filter((other) => other !== id)
    const blocked = EXCLUSIVE.filter((group) => group.includes(id)).flat()
    return sorted([...selected.filter((other) => !blocked.includes(other)), id])
}

/**
 * Dateinamen der Overlays in Zeichenreihenfolge. IMAX und Regrade liegen beide unten rechts,
 * zusammen gibt es dafür eine eigene Grafik (Regrade links, IMAX rechts).
 */
export function overlayFiles(selected: OverlayId[]): string[] {
    const ids = sorted(selected)
    const combined = ids.includes('imax') && ids.includes('regrade')
    const files: string[] = []
    for (const id of ids) {
        if (combined && id === 'regrade') continue
        files.push(combined && id === 'imax' ? 'overlay-regrade-imax.png' : `overlay-${id}.png`)
    }
    return files
}

/** Vorbelegung aus Datei- und Ordnernamen, z. B. „…Extended.UpsUHD…“ → Extended + Upscale */
export function overlaysFromNames(names: string[]): OverlayId[] {
    const text = names.join(' ').toLowerCase()
    const ids: OverlayId[] = []
    const upscale = text.includes('upscale') || text.includes('upsuhd')

    if (upscale) ids.push('upscale')
    else if (/2160p|(?<![a-z])(4k|uhd)(?![a-z])/.test(text)) ids.push('4k')
    if (text.includes('extended')) ids.push('extended')
    else if (text.includes('director')) ids.push('directors-cut')
    if (text.includes('imax')) ids.push('imax')
    if (text.includes('regrade')) ids.push('regrade')
    return sorted(ids)
}

export function sameOverlays(a: OverlayId[], b: OverlayId[]): boolean {
    const left = sorted(a)
    const right = sorted(b)
    return left.length === right.length && left.every((id, index) => id === right[index])
}
