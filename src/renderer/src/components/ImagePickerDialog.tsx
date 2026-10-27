import type { ReactNode } from 'react'
import { Check, ImageOff, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface PickerImage {
    /** Kennung, die bei Auswahl zurückgegeben wird (z. B. URL oder TMDB-Pfad) */
    id: string
    previewUrl: string
    /** Kleine Hinweise auf dem Bild, z. B. Quelle, Sprache, Auflösung */
    badges: string[]
}

export type PickerShape = 'landscape' | 'poster' | 'logo'

const SHAPES: Record<PickerShape, { grid: string; image: string }> = {
    landscape: { grid: 'grid-cols-3', image: 'aspect-video object-cover' },
    // Poster werden beim Export auf 600×900 gestreckt, die Vorschau zeigt das schon
    poster: { grid: 'grid-cols-5', image: 'aspect-[2/3] object-fill' },
    logo: { grid: 'grid-cols-3', image: 'aspect-[5/2] object-contain p-3' }
}

/** Raster mit allen Vorschlägen; ein Klick übernimmt das Bild und schließt den Dialog */
export function ImagePickerDialog({
    open,
    onOpenChange,
    title,
    description,
    images,
    error,
    selectedId,
    onSelect,
    shape = 'landscape',
    empty = 'Keine Bilder gefunden',
    overlay
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: ReactNode
    description: ReactNode
    /** `null` = wird noch geladen */
    images: PickerImage[] | null
    error?: string | null
    selectedId: string | null
    onSelect: (id: string) => void
    shape?: PickerShape
    empty?: string
    /** Wird über jedes Bild gelegt (z. B. die gewählten Overlays) */
    overlay?: ReactNode
}) {
    const { grid, image: imageClass } = SHAPES[shape]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl" onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="-mx-6 max-h-[70vh] min-h-40 overflow-y-auto px-6">
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
                            {empty}
                        </p>
                    )}
                    {images && images.length > 0 && (
                        <>
                            <div className={cn('grid gap-3 pb-1', grid)}>
                                {images.map((image) => {
                                    const selected = image.id === selectedId
                                    return (
                                        <button
                                            key={image.id}
                                            type="button"
                                            onClick={() => {
                                                onSelect(image.id)
                                                onOpenChange(false)
                                            }}
                                            className={cn(
                                                'flex flex-col overflow-hidden rounded-lg border-2 bg-secondary/40 transition-colors',
                                                selected ? 'border-primary' : 'border-transparent hover:border-primary/50'
                                            )}
                                        >
                                            <span className={cn('relative block', shape === 'logo' && 'checkerboard')}>
                                                <img
                                                    src={image.previewUrl}
                                                    alt=""
                                                    loading="lazy"
                                                    className={cn('block w-full', imageClass)}
                                                />
                                                {overlay}
                                                {selected && (
                                                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                        <Check className="size-3.5" />
                                                    </span>
                                                )}
                                            </span>
                                            {/* Unter dem Bild, damit sie keine Overlays verdecken */}
                                            {image.badges.length > 0 && (
                                                <span className="flex flex-wrap gap-1 px-1.5 py-1">
                                                    {image.badges.map((badge) => (
                                                        <span
                                                            key={badge}
                                                            className="rounded bg-secondary px-1.5 py-px text-[10px] text-muted-foreground"
                                                        >
                                                            {badge}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                            {images.length === 1 && <p className="pt-2 text-xs text-muted-foreground">Es gibt nur dieses eine Bild.</p>}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
