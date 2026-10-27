import { useEffect, useMemo, useState } from 'react'
import { buildArtworkJobs, type ArtworkPlanInput } from '@shared/artwork'
import { overlaysFromNames, type OverlayId } from '@shared/overlays'
import { sourceFolders } from '@shared/rename'
import { episodeRefFromName } from '@shared/tmdb-match'
import type { ArtworkJob } from '@shared/types'
import type { Row } from './rows'
import { useStore } from './store'

// Dieselben PNGs, die der Main-Prozess beim Export darüberlegt
const OVERLAY_URLS = import.meta.glob<string>('../../../../resources/overlays/*.png', { eager: true, query: '?url', import: 'default' })

export function overlayUrl(file: string): string | undefined {
    return Object.entries(OVERLAY_URLS).find(([path]) => path.endsWith(`/${file}`))?.[1]
}

const measured = new Map<string, { width: number; height: number }>()

/**
 * Pixelgröße eines Bilds: bekannt (TMDB liefert sie mit) oder nach dem Laden gemessen (Fanart.tv liefert keine).
 * Gemessen wird nur, wenn `url` das Originalbild ist.
 */
export function useImageSize(url: string | null, width?: number, height?: number): { width: number; height: number } | null {
    const known = width && height ? { width, height } : null
    const [size, setSize] = useState(() => known ?? (url ? (measured.get(url) ?? null) : null))

    useEffect(() => {
        if (known || !url) return
        const cached = measured.get(url)
        if (cached) return setSize(cached)
        setSize(null)
        let cancelled = false
        const image = new Image()
        image.onload = () => {
            const result = { width: image.naturalWidth, height: image.naturalHeight }
            measured.set(url, result)
            if (!cancelled) setSize(result)
        }
        image.src = url
        return () => {
            cancelled = true
        }
    }, [url, width, height])

    return known ?? size
}

export interface ArtworkPlan {
    /** Zugeordnet ist eine Serie, ein Film oder nichts */
    kind: 'tv' | 'movie' | null
    input: ArtworkPlanInput
    /** Vorbelegung der Cover-Overlays aus Datei- und Ordnernamen */
    autoOverlays: OverlayId[]
    /** Bilder, die exportiert werden */
    jobs: ArtworkJob[]
}

/** Leitet aus Zuordnung, Vorschlägen und Auswahl ab, welche Bilder mit welchen Overlays geschrieben werden */
export function useArtworkPlan(rows: Row[]): ArtworkPlan {
    const show = useStore((s) => s.tmdb.show)
    const movie = useStore((s) => s.tmdb.movie)
    const tmdbSeasons = useStore((s) => s.tmdb.seasons)
    const candidates = useStore((s) => s.artwork.candidates)
    const selection = useStore((s) => s.artworkSelection)
    const enabled = useStore((s) => s.artworkEnabled)
    const coverOverlays = useStore((s) => s.coverOverlays)
    const seasonOverlays = useStore((s) => s.seasonOverlays)

    return useMemo(() => {
        const active = rows.filter((row) => !row.excluded)
        const autoOverlays = overlaysFromNames(active.flatMap((row) => [row.entry.file.name, ...sourceFolders(row.entry.file)]))
        const fileSeasons = show
            ? [
                  ...new Set(
                      active
                          .map((row) => row.episode?.season ?? episodeRefFromName(row.entry.file.name)?.season)
                          .filter((season) => season !== undefined)
                  )
              ]
            : []
        const input: ArtworkPlanInput = {
            candidates,
            selection,
            enabled,
            seasons: show ? tmdbSeasons.map((season) => season.season) : [],
            fileSeasons,
            coverOverlays: coverOverlays ?? autoOverlays,
            seasonOverlays
        }
        return {
            kind: show ? 'tv' : movie ? 'movie' : null,
            input,
            autoOverlays,
            jobs: show || movie ? buildArtworkJobs(input) : []
        }
    }, [rows, show, movie, tmdbSeasons, candidates, selection, enabled, coverOverlays, seasonOverlays])
}
