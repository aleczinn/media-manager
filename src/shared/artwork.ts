import type { OverlayId } from './overlays'
import type { ArtworkCandidate, ArtworkCandidates, ArtworkJob, ArtworkKind } from './types'

/** Ein Bildplatz im Bilder-Tab: Serien-/Filmbilder oder ein Staffelposter */
export type ArtworkSlot = 'poster' | 'logo' | 'backdrop' | 'landscape' | `season:${number}`

export const BASE_SLOTS: { slot: ArtworkSlot; label: string }[] = [
    { slot: 'poster', label: 'Cover' },
    { slot: 'logo', label: 'Logo' },
    { slot: 'backdrop', label: 'Backdrop' },
    { slot: 'landscape', label: 'Landscape' }
]

export const seasonSlot = (season: number): ArtworkSlot => `season:${season}`

export function slotSeason(slot: ArtworkSlot): number | null {
    return slot.startsWith('season:') ? Number(slot.slice('season:'.length)) : null
}

export function slotKind(slot: ArtworkSlot): ArtworkKind {
    return slotSeason(slot) !== null ? 'poster' : (slot as ArtworkKind)
}

export function seasonLabel(season: number): string {
    return season === 0 ? 'Specials' : `Staffel ${season}`
}

/** Dateinamen, wie Jellyfin, Emby und Kodi sie im Serien- bzw. Filmordner erwarten */
export function artworkFileName(slot: ArtworkSlot): string {
    const season = slotSeason(slot)
    if (season !== null) return season === 0 ? 'season-specials-poster.jpg' : `season${String(season).padStart(2, '0')}-poster.jpg`
    return slot === 'logo' ? 'logo.png' : `${slot}.jpg`
}

export function slotCandidates(candidates: ArtworkCandidates | null, slot: ArtworkSlot): ArtworkCandidate[] {
    if (!candidates) return []
    const season = slotSeason(slot)
    return season !== null ? (candidates.seasons[season] ?? []) : candidates[slot as ArtworkKind]
}

/**
 * Reihenfolge der Vorschläge: Deutsch, Englisch, dann ohne Text, sonst andere Sprachen; jeweils die besten zuerst.
 * Backdrops ohne Text kommen nach vorn, Text stört dort meist.
 */
export function sortCandidates(candidates: ArtworkCandidate[], kind: ArtworkKind): ArtworkCandidate[] {
    const order = kind === 'backdrop' ? [null, 'de', 'en'] : ['de', 'en', null]
    const rank = (candidate: ArtworkCandidate) => {
        const index = order.indexOf(candidate.lang)
        return index === -1 ? order.length : index
    }
    return [...candidates].sort((a, b) => rank(a) - rank(b) || b.score - a.score)
}

export interface ArtworkPlanInput {
    candidates: ArtworkCandidates | null
    /** Manuell gewählte Bilder (URL) je Platz */
    selection: Partial<Record<ArtworkSlot, string>>
    /** Plätze, die nicht exportiert werden sollen */
    disabled: Partial<Record<ArtworkSlot, boolean>>
    /** Staffeln, die in den Dateien vorkommen */
    seasons: number[]
    coverOverlays: OverlayId[]
    /** Abweichende Overlays je Staffelposter */
    seasonOverlays: Record<number, OverlayId[]>
}

export function slotOverlays(input: Pick<ArtworkPlanInput, 'coverOverlays' | 'seasonOverlays'>, slot: ArtworkSlot): OverlayId[] {
    const season = slotSeason(slot)
    if (season !== null) return input.seasonOverlays[season] ?? input.coverOverlays
    return slot === 'poster' ? input.coverOverlays : []
}

/** Gewähltes Bild eines Platzes: manuelle Wahl, sonst der erste Vorschlag */
export function selectedUrl(input: Pick<ArtworkPlanInput, 'candidates' | 'selection'>, slot: ArtworkSlot): string | null {
    return input.selection[slot] ?? slotCandidates(input.candidates, slot)[0]?.url ?? null
}

export function planSlots(seasons: number[]): ArtworkSlot[] {
    return [...BASE_SLOTS.map(({ slot }) => slot), ...[...seasons].sort((a, b) => (a || 999) - (b || 999)).map(seasonSlot)]
}

/** Alle Bilder, die geschrieben werden: Plätze ohne Bild oder abgewählte fallen weg */
export function buildArtworkJobs(input: ArtworkPlanInput): ArtworkJob[] {
    const jobs: ArtworkJob[] = []
    for (const slot of planSlots(input.seasons)) {
        if (input.disabled[slot]) continue
        const url = selectedUrl(input, slot)
        if (!url) continue
        const kind = slotKind(slot)
        jobs.push({ fileName: artworkFileName(slot), url, kind, overlays: kind === 'poster' ? slotOverlays(input, slot) : [] })
    }
    return jobs
}
