import { useMemo } from 'react'
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

export interface ArtworkPlan {
    /** Zugeordnet ist eine Serie, ein Film oder nichts */
    kind: 'tv' | 'movie' | null
    input: ArtworkPlanInput
    /** Vorbelegung der Cover-Overlays aus Datei- und Ordnernamen */
    autoOverlays: OverlayId[]
    coverOverlaysManual: boolean
    /** Bilder, die exportiert werden */
    jobs: ArtworkJob[]
}

/** Leitet aus Zuordnung, Vorschlägen und Auswahl ab, welche Bilder mit welchen Overlays geschrieben werden */
export function useArtworkPlan(rows: Row[]): ArtworkPlan {
    const show = useStore((s) => s.tmdb.show)
    const movie = useStore((s) => s.tmdb.movie)
    const candidates = useStore((s) => s.artwork.candidates)
    const selection = useStore((s) => s.artworkSelection)
    const disabled = useStore((s) => s.artworkDisabled)
    const coverOverlays = useStore((s) => s.coverOverlays)
    const seasonOverlays = useStore((s) => s.seasonOverlays)

    return useMemo(() => {
        const active = rows.filter((row) => !row.excluded)
        const autoOverlays = overlaysFromNames(active.flatMap((row) => [row.entry.file.name, ...sourceFolders(row.entry.file)]))
        const seasons = show
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
            disabled,
            seasons,
            coverOverlays: coverOverlays ?? autoOverlays,
            seasonOverlays
        }
        return {
            kind: show ? 'tv' : movie ? 'movie' : null,
            input,
            autoOverlays,
            coverOverlaysManual: coverOverlays !== null,
            jobs: show || movie ? buildArtworkJobs(input) : []
        }
    }, [rows, show, movie, candidates, selection, disabled, coverOverlays, seasonOverlays])
}
