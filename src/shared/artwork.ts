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

/** Specials (Staffel 0) ans Ende */
export const sortSeasons = (seasons: number[]): number[] => [...seasons].sort((a, b) => (a || 999) - (b || 999))

/** Dateinamen, wie Jellyfin und Emby sie im Serien- bzw. Filmordner erwarten; das Cover heißt cover.jpg */
export function artworkFileName(slot: ArtworkSlot): string {
    const season = slotSeason(slot)
    if (season !== null) return season === 0 ? 'season-specials-poster.jpg' : `season${String(season).padStart(2, '0')}-poster.jpg`
    if (slot === 'poster') return 'cover.jpg'
    return slot === 'logo' ? 'logo.png' : `${slot}.jpg`
}

export function slotCandidates(candidates: ArtworkCandidates | null, slot: ArtworkSlot): ArtworkCandidate[] {
    if (!candidates) return []
    const season = slotSeason(slot)
    return season !== null ? (candidates.seasons[season] ?? []) : candidates[slot as ArtworkKind]
}

/**
 * Reihenfolge der Vorschläge: TMDB vor Fanart.tv (dort stimmen die Bilder meist), dann Deutsch, Englisch,
 * ohne Text und andere Sprachen; jeweils die besten zuerst. Backdrops ohne Text kommen nach vorn, Text stört dort meist.
 */
export function sortCandidates(candidates: ArtworkCandidate[], kind: ArtworkKind): ArtworkCandidate[] {
    const order = kind === 'backdrop' ? [null, 'de', 'en'] : ['de', 'en', null]
    const rank = (candidate: ArtworkCandidate) => {
        const index = order.indexOf(candidate.lang)
        return index === -1 ? order.length : index
    }
    const source = (candidate: ArtworkCandidate) => (candidate.source === 'tmdb' ? 0 : 1)
    return [...candidates].sort((a, b) => source(a) - source(b) || rank(a) - rank(b) || b.score - a.score)
}

/**
 * Landscape-Vorschläge: zuerst die echten Landscape-Bilder (Fanart.tv), am Ende alle Backdrops.
 * Backdrops mit Titel kommen dabei vor die ohne Text, weil sie als Landscape meist besser passen.
 */
export function landscapeCandidates(landscape: ArtworkCandidate[], backdrops: ArtworkCandidate[]): ArtworkCandidate[] {
    return [
        ...sortCandidates(landscape, 'landscape'),
        ...sortCandidates(backdrops, 'landscape').map((candidate) => ({ ...candidate, fromBackdrop: true }))
    ]
}

export interface ArtworkPlanInput {
    candidates: ArtworkCandidates | null
    /** Manuell gewählte Bilder (URL) je Platz */
    selection: Partial<Record<ArtworkSlot, string>>
    /** Manuell an- oder abgehakte Plätze */
    enabled: Partial<Record<ArtworkSlot, boolean>>
    /** Alle Staffeln der Serie */
    seasons: number[]
    /** Staffeln, die in den Dateien vorkommen; nur deren Poster sind vorab angehakt */
    fileSeasons: number[]
    coverOverlays: OverlayId[]
    /** Overlays je Staffelposter (ohne Eintrag keine) */
    seasonOverlays: Record<number, OverlayId[]>
}

export function slotOverlays(input: Pick<ArtworkPlanInput, 'coverOverlays' | 'seasonOverlays'>, slot: ArtworkSlot): OverlayId[] {
    const season = slotSeason(slot)
    if (season !== null) return input.seasonOverlays[season] ?? []
    return slot === 'poster' ? input.coverOverlays : []
}

/** Gewähltes Bild eines Platzes: manuelle Wahl, sonst der erste Vorschlag */
export function selectedUrl(input: Pick<ArtworkPlanInput, 'candidates' | 'selection'>, slot: ArtworkSlot): string | null {
    return input.selection[slot] ?? slotCandidates(input.candidates, slot)[0]?.url ?? null
}

/** Ob ein Platz exportiert wird: manuelle Wahl, sonst Serienbilder immer und Staffelposter nur für vorhandene Staffeln */
export function isSlotEnabled(input: Pick<ArtworkPlanInput, 'enabled' | 'fileSeasons'>, slot: ArtworkSlot): boolean {
    const season = slotSeason(slot)
    return input.enabled[slot] ?? (season === null || input.fileSeasons.includes(season))
}

export function planSlots(seasons: number[]): ArtworkSlot[] {
    return [...BASE_SLOTS.map(({ slot }) => slot), ...sortSeasons(seasons).map(seasonSlot)]
}

/** Alle Bilder, die geschrieben werden: Plätze ohne Bild oder abgewählte fallen weg */
export function buildArtworkJobs(input: ArtworkPlanInput): ArtworkJob[] {
    const jobs: ArtworkJob[] = []
    for (const slot of planSlots(input.seasons)) {
        if (!isSlotEnabled(input, slot)) continue
        const url = selectedUrl(input, slot)
        if (!url) continue
        const kind = slotKind(slot)
        jobs.push({ fileName: artworkFileName(slot), url, kind, overlays: kind === 'poster' ? slotOverlays(input, slot) : [] })
    }
    return jobs
}
