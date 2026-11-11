import { useEffect, useState } from 'react'
import { localImageUrl } from '@shared/local-image'
import { fileKey } from '@shared/peak'
import { isHd, sortByResolution } from '@shared/stills'
import { formatEpisodeRef, tmdbImageUrl } from '@shared/tmdb-match'
import type { TmdbEpisode } from '@shared/types'
import { useStore } from '@/lib/store'
import { ImagePickerDialog, type PickerImage } from './ImagePickerDialog'

/**
 * Lädt alle TMDB-Bilder einer Episode und, falls die Datei bekannt ist, einige Standbilder aus dem Video
 * (wichtig für Teil 2 einer geteilten Folge, den TMDB nicht kennt). Ein Klick übernimmt das Bild für Anzeige und -thumb.jpg.
 */
export function StillPickerDialog({
    open,
    onOpenChange,
    episode,
    selectedPath,
    onSelect,
    file
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    episode: TmdbEpisode
    selectedPath: string | null
    onSelect: (path: string) => void
    /** Video der Folge; ohne (fehlende Folge) gibt es nur TMDB-Bilder */
    file?: { inputPath: string; size: number; durationSec: number }
}) {
    const showId = useStore((s) => s.tmdb.show?.id)
    const framesKey = file ? fileKey(file) : null
    const frames = useStore((s) => (framesKey ? s.videoFrames[framesKey] : undefined))
    const [tmdbImages, setTmdbImages] = useState<PickerImage[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open || !showId) return
        let cancelled = false
        setTmdbImages(null)
        setError(null)
        // Bilder hängen an der Nummer der Ausstrahlung, auch wenn eine andere Reihenfolge gewählt oder die Folge geteilt ist
        const { season, episode: number } = episode.aired ?? episode
        void window.api.tmdbEpisodeImages(showId, season, number).then((result) => {
            if (cancelled) return
            if (!result.ok) {
                setError(result.error)
                setTmdbImages([])
                return
            }
            setTmdbImages(
                result.data.map((image) => ({
                    id: image.path,
                    previewUrl: tmdbImageUrl(image.path, 'w780'),
                    badges: ['TMDB'],
                    width: image.width,
                    height: image.height
                }))
            )
        })
        return () => {
            cancelled = true
        }
    }, [open, showId, episode.aired, episode.season, episode.episode])

    // Standbilder erst beim Öffnen ziehen (für Folgen ohne TMDB-Bild passiert das schon vorher); nach einem Fehler
    // einmal je Öffnen neu versuchen. Abhängig vom Schlüssel, nicht vom Objekt, das bei jedem Rendern neu entsteht.
    useEffect(() => {
        if (open && file) void useStore.getState().loadFrames(file, true)
    }, [open, framesKey])

    const frameImages: PickerImage[] =
        frames?.status === 'done'
            ? frames.frames.map((frame) => ({
                  id: frame.path,
                  previewUrl: localImageUrl(frame.path),
                  badges: [`Video · ${Math.round(frame.position * 100)} %`],
                  width: frame.width,
                  height: frame.height
              }))
            : []
    const framesPending = !!file && (!frames || frames.status === 'loading')
    // Warten, bis beide Quellen da sind, damit das Raster nicht springt
    // HD-Bilder von TMDB, dann HD-Standbilder, kleine Bilder am Ende und markiert
    const images =
        tmdbImages === null || framesPending
            ? null
            : sortByResolution(
                  [...tmdbImages, ...frameImages].map((image) => ({ width: 0, height: 0, ...image }))
              ).map((image) => (image.width > 0 && !isHd(image) ? { ...image, warning: 'geringe Auflösung' } : image))
    const frameError = frames?.status === 'error' ? `Standbilder aus dem Video: ${frames.error}` : null

    return (
        <ImagePickerDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Bild für ${formatEpisodeRef(episode)} · ${episode.title}`}
            description={
                file
                    ? 'Bilder von TMDB und Standbilder aus dem Video. Das gewählte Bild wird in der Liste angezeigt und als Vorschaubild (-thumb.jpg) gespeichert.'
                    : 'Das gewählte Bild wird in der Liste angezeigt und als Vorschaubild (-thumb.jpg) gespeichert.'
            }
            images={images}
            // Ein Fehler einer Quelle stört nicht, solange die andere Bilder liefert
            error={images && images.length === 0 ? (error ?? frameError) : null}
            selectedId={selectedPath}
            onSelect={onSelect}
            empty="Bei TMDB gibt es zu dieser Folge keine Bilder"
        />
    )
}
