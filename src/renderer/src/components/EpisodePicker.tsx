import { useState } from 'react'
import { AlertTriangle, ChevronDown, ImageOff } from 'lucide-react'
import { episodeRefFromName, formatEpisodeRef, tmdbImageUrl } from '@shared/tmdb-match'
import type { TmdbEpisode } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { overlayUrl } from '@/lib/artwork'
import type { Row } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { StillPickerDialog } from './StillPickerDialog'

const refKey = (episode: { season: number; episode: number }) => `${episode.season}:${episode.episode}`

/** Auswahl der TMDB-Episode pro Datei; Titel und Vorschaubild folgen der Auswahl */
export function EpisodePicker({ row, disabled }: { row: Row; disabled: boolean }) {
    const episodes = useStore((s) => s.tmdb.episodes)
    const seasons = useStore((s) => s.tmdb.seasons)
    const setEpisode = useStore((s) => s.setEpisode)
    const fileId = row.entry.file.id

    const bySeason = new Map<number, TmdbEpisode[]>()
    for (const episode of episodes) bySeason.set(episode.season, [...(bySeason.get(episode.season) ?? []), episode])
    const seasonName = (season: number) =>
        season === 0 ? 'Specials' : (seasons.find((s) => s.season === season)?.name ?? `Staffel ${season}`)

    const onChange = (value: string) => {
        if (!value) return setEpisode(fileId, null)
        const [season, episode] = value.split(':').map(Number)
        const auto = episodeRefFromName(row.entry.file.name)
        // Wählt man wieder die automatisch erkannte Folge, gilt die Zuordnung als automatisch
        setEpisode(fileId, auto && auto.season === season && auto.episode === episode ? undefined : { season, episode })
    }

    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative min-w-0">
                <select
                    value={row.episode ? refKey(row.episode) : ''}
                    onChange={(event) => onChange(event.target.value)}
                    onContextMenu={(event) => {
                        // Rechtsklick: zurück auf die per Staffel und Folge erkannte Episode
                        event.preventDefault()
                        if (!disabled) setEpisode(fileId, undefined)
                    }}
                    disabled={disabled}
                    className={cn(
                        'h-6 max-w-full appearance-none truncate rounded border bg-transparent pr-6 pl-2 text-xs outline-none disabled:opacity-50 [&>optgroup]:bg-popover [&>option]:bg-popover',
                        row.episodeManual
                            ? 'border-warning/50 text-warning'
                            : row.episode
                              ? 'border-input text-muted-foreground'
                              : 'border-dashed border-input text-muted-foreground/70'
                    )}
                    title={
                        row.episodeManual
                            ? 'Manuell gewählte Episode\nRechtsklick: zurück auf die erkannte Folge'
                            : 'Automatisch per Staffel und Folge zugeordnet'
                    }
                >
                    <option value="">Keine TMDB-Episode</option>
                    {[...bySeason.entries()].map(([season, list]) => (
                        <optgroup key={season} label={seasonName(season)}>
                            {list.map((episode) => (
                                <option key={refKey(episode)} value={refKey(episode)}>
                                    {formatEpisodeRef(episode)} · {episode.title}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            {row.episodeManual && <span className="shrink-0 text-[10px] text-warning">manuell</span>}
            {row.duplicate && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                    </TooltipTrigger>
                    <TooltipContent>Mehrere Dateien sind dieser Folge zugeordnet</TooltipContent>
                </Tooltip>
            )}
        </div>
    )
}

/**
 * Vorschaubild der zugeordneten Episode links neben Zielname und Dropdown.
 * Überfahren: große Vorschau · Klick: anderes Bild wählen · Rechtsklick: Standardbild der Episode
 */
export function EpisodeThumbnail({ row, disabled }: { row: Row; disabled: boolean }) {
    const setStill = useStore((s) => s.setStill)
    const fileId = row.entry.file.id
    return (
        <StillThumbnail
            episode={row.episode}
            stillPath={row.stillPath}
            stillManual={row.stillManual}
            disabled={disabled}
            onChange={(path) => setStill(fileId, path)}
        />
    )
}

const VIGNETTE_URL = overlayUrl('overlay-vignette.png')

/** Episodenbild; bei fehlenden Folgen schwarz-weiß mit Vignette, so wie es exportiert wird */
function StillImage({ src, missing, className }: { src: string; missing: boolean; className: string }) {
    if (!missing) return <img src={src} alt="" className={className} />
    return (
        <span className={cn('relative block overflow-hidden', className)}>
            <img src={src} alt="" className="size-full object-cover grayscale" />
            {VIGNETTE_URL && <img src={VIGNETTE_URL} alt="" className="absolute inset-0 size-full" />}
        </span>
    )
}

/** Vorschaubild einer Episode mit Bildauswahl; `onChange(null)` = zurück auf das Standardbild */
export function StillThumbnail({
    episode,
    stillPath,
    stillManual,
    disabled,
    onChange,
    missing = false
}: {
    episode: TmdbEpisode | null
    stillPath: string | null
    stillManual: boolean
    disabled: boolean
    onChange: (path: string | null) => void
    /** Fehlende Folge: Vorschau schwarz-weiß mit Vignette */
    missing?: boolean
}) {
    const [pickerOpen, setPickerOpen] = useState(false)
    const box = cn(
        'h-[62px] w-[110px] shrink-0 overflow-hidden rounded-md border bg-secondary/60',
        stillManual ? 'border-2 border-warning/70' : 'border'
    )

    if (!episode) {
        return (
            <span className={cn(box, 'flex items-center justify-center text-muted-foreground/60')} title="Keine TMDB-Episode zugeordnet">
                <ImageOff className="size-4" />
            </span>
        )
    }

    const thumbnail = (
        <button
            type="button"
            disabled={disabled}
            onClick={() => setPickerOpen(true)}
            onContextMenu={(event) => {
                event.preventDefault()
                if (!disabled) onChange(null)
            }}
            className={cn(
                box,
                'cursor-pointer transition-opacity hover:opacity-85 disabled:cursor-default',
                !stillPath && 'flex items-center justify-center'
            )}
            aria-label="Anderes Bild wählen"
        >
            {stillPath ? (
                <StillImage src={tmdbImageUrl(stillPath, 'w300')} missing={missing} className="size-full object-cover" />
            ) : (
                <ImageOff className="size-4 text-muted-foreground/60" />
            )}
        </button>
    )

    return (
        <>
            {stillPath ? (
                <Tooltip>
                    <TooltipTrigger asChild>{thumbnail}</TooltipTrigger>
                    <TooltipContent side="left" className="max-w-none p-1.5">
                        <StillImage
                            src={tmdbImageUrl(stillPath, 'w1280')}
                            missing={missing}
                            className="aspect-video w-[520px] rounded object-cover"
                        />
                        <div className="flex items-center justify-between gap-4 px-1 pt-1.5 text-xs">
                            <span>
                                {formatEpisodeRef(episode)} · {episode.title}
                                {stillManual && <span className="text-warning"> · manuell gewählt</span>}
                            </span>
                            <span className="text-muted-foreground">Klick: anderes Bild · Rechtsklick: Standardbild</span>
                        </div>
                    </TooltipContent>
                </Tooltip>
            ) : (
                <span title="Bei TMDB gibt es zu dieser Folge kein Standardbild. Klick: Bilder der Folge anzeigen">{thumbnail}</span>
            )}
            <StillPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                episode={episode}
                selectedPath={stillPath}
                onSelect={(path) => onChange(path === episode.stillPath ? null : path)}
            />
        </>
    )
}
