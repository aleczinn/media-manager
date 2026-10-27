import { useEffect, useState } from 'react'
import { formatEpisodeRef, tmdbImageUrl } from '@shared/tmdb-match'
import type { TmdbEpisode } from '@shared/types'
import { useStore } from '@/lib/store'
import { ImagePickerDialog, type PickerImage } from './ImagePickerDialog'

/** Lädt alle TMDB-Bilder einer Episode; ein Klick übernimmt das Bild für Anzeige und -thumb.jpg */
export function StillPickerDialog({
    open,
    onOpenChange,
    episode,
    selectedPath,
    onSelect
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    episode: TmdbEpisode
    selectedPath: string | null
    onSelect: (path: string) => void
}) {
    const showId = useStore((s) => s.tmdb.show?.id)
    const [images, setImages] = useState<PickerImage[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open || !showId) return
        let cancelled = false
        setImages(null)
        setError(null)
        void window.api.tmdbEpisodeImages(showId, episode.season, episode.episode).then((result) => {
            if (cancelled) return
            if (!result.ok) return setError(result.error)
            setImages(
                result.data.map((image) => ({
                    id: image.path,
                    previewUrl: tmdbImageUrl(image.path, 'w780'),
                    badges: [`${image.width}×${image.height}`]
                }))
            )
        })
        return () => {
            cancelled = true
        }
    }, [open, showId, episode.season, episode.episode])

    return (
        <ImagePickerDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Bild für ${formatEpisodeRef(episode)} · ${episode.title}`}
            description="Das gewählte Bild wird in der Liste angezeigt und als Vorschaubild (-thumb.jpg) gespeichert."
            images={images}
            error={error}
            selectedId={selectedPath}
            onSelect={onSelect}
            empty="Bei TMDB gibt es zu dieser Folge keine Bilder"
        />
    )
}
