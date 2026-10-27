import { useEffect, useState } from 'react'
import { Check, ImageOff, Loader2 } from 'lucide-react'
import { formatEpisodeRef, tmdbImageUrl } from '@shared/tmdb-match'
import type { TmdbEpisode, TmdbImage } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

/** Zeigt alle TMDB-Bilder einer Episode; ein Klick übernimmt das Bild für Anzeige und -thumb.jpg */
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
    const [images, setImages] = useState<TmdbImage[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open || !showId) return
        let cancelled = false
        setImages(null)
        setError(null)
        void window.api.tmdbEpisodeImages(showId, episode.season, episode.episode).then((result) => {
            if (cancelled) return
            if (result.ok) setImages(result.data)
            else setError(result.error)
        })
        return () => {
            cancelled = true
        }
    }, [open, showId, episode.season, episode.episode])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl" onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>
                        Bild für {formatEpisodeRef(episode)} · {episode.title}
                    </DialogTitle>
                    <DialogDescription>
                        Das gewählte Bild wird in der Liste angezeigt und als Vorschaubild (-thumb.jpg) gespeichert.
                    </DialogDescription>
                </DialogHeader>

                <div className="-mx-6 min-h-40 overflow-y-auto px-6">
                    {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
                    {!error && !images && (
                        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Bilder werden geladen …
                        </p>
                    )}
                    {images && images.length === 0 && (
                        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                            <ImageOff className="size-4" />
                            Bei TMDB gibt es zu dieser Folge keine Bilder
                        </p>
                    )}
                    {images && images.length > 0 && (
                        <>
                            <div className="grid grid-cols-3 gap-3 pb-1">
                                {images.map((image) => {
                                    const selected = image.path === selectedPath
                                    return (
                                        <button
                                            key={image.path}
                                            type="button"
                                            onClick={() => {
                                                onSelect(image.path)
                                                onOpenChange(false)
                                            }}
                                            className={cn(
                                                'group relative overflow-hidden rounded-lg border-2 transition-colors',
                                                selected ? 'border-primary' : 'border-transparent hover:border-primary/50'
                                            )}
                                        >
                                            <img
                                                src={tmdbImageUrl(image.path, 'w780')}
                                                alt=""
                                                className="aspect-video w-full object-cover"
                                            />
                                            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-px text-[10px] text-white/90">
                                                {image.width}×{image.height}
                                            </span>
                                            {selected && (
                                                <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                    <Check className="size-3.5" />
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                            {images.length === 1 && (
                                <p className="pt-2 text-xs text-muted-foreground">Bei TMDB gibt es zu dieser Folge nur dieses eine Bild.</p>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
