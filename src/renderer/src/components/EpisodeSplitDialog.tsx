import { ArrowRight, ChevronDown } from 'lucide-react'
import { airedKey } from '@shared/episode-order'
import { formatEpisodeRef } from '@shared/tmdb-match'
import type { TmdbEpisode } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const PART_OPTIONS = [1, 2, 3, 4]

/**
 * Folgen, die TMDB als eine führt, in Teile aufteilen (z. B. „Weihnachten“ in Teil 1 und 2).
 * Gezeigt werden die Staffeln aus den Dateien; die neuen Nummern stehen gleich daneben.
 */
export function EpisodeSplitDialog({
    open,
    onOpenChange,
    fileSeasons
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Staffeln, die in den Dateien vorkommen (leer = alle) */
    fileSeasons: number[]
}) {
    const ordered = useStore((s) => s.tmdb.ordered)
    const episodes = useStore((s) => s.tmdb.episodes)
    const splits = useStore((s) => s.tmdb.splits)
    const setEpisodeSplit = useStore((s) => s.setEpisodeSplit)

    const seasons = ordered.seasons.filter((season) => fileSeasons.length === 0 || fileSeasons.includes(season.season))
    const bySeason = (season: number) =>
        ordered.episodes.filter((episode) => episode.season === season).sort((a, b) => a.episode - b.episode)
    // Wo die Folge nach allen Teilungen landet
    const resultOf = (episode: TmdbEpisode) => episodes.filter((other) => airedKey(other) === airedKey(episode))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Folgen teilen</DialogTitle>
                    <DialogDescription>
                        Für Folgen, die TMDB als eine lange Folge führt, die aber als Teil 1 und Teil 2 vorliegen. Alle späteren Folgen der
                        Staffel rücken nach; ab Teil 2 kommt das Vorschaubild aus dem Video. Wird je Serie gespeichert.
                    </DialogDescription>
                </DialogHeader>

                <div className="-mx-6 flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6">
                    {seasons.map((season) => (
                        <div key={season.season}>
                            <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                {season.season === 0 ? 'Specials' : season.name || `Staffel ${season.season}`}
                            </div>
                            <ul className="text-[13px]">
                                {bySeason(season.season).map((episode) => {
                                    const key = airedKey(episode)
                                    const parts = splits[key] ?? 1
                                    const result = resultOf(episode)
                                    const moved = result.length !== 1 || result[0]?.episode !== episode.episode
                                    return (
                                        <li key={key} className="flex items-center gap-2 border-b border-border/40 py-1 last:border-b-0">
                                            <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                                                {formatEpisodeRef(episode)}
                                            </span>
                                            <span className={cn('min-w-0 flex-1 truncate', parts > 1 && 'text-primary')}>{episode.title}</span>
                                            {moved && (
                                                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                                                    <ArrowRight className="size-3" />
                                                    {result.map(formatEpisodeRef).join(', ')}
                                                </span>
                                            )}
                                            <div className="relative shrink-0">
                                                <select
                                                    value={parts}
                                                    onChange={(event) => setEpisodeSplit(key, Number(event.target.value))}
                                                    className={cn(
                                                        'h-6 appearance-none rounded border bg-transparent pr-6 pl-2 text-xs outline-none [&>option]:bg-popover',
                                                        parts > 1 ? 'border-primary/50 text-foreground' : 'border-input text-muted-foreground'
                                                    )}
                                                >
                                                    {PART_OPTIONS.map((count) => (
                                                        <option key={count} value={count}>
                                                            {count === 1 ? 'ganz' : `${count} Teile`}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                    {seasons.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Keine Folgen geladen</p>}
                </div>
            </DialogContent>
        </Dialog>
    )
}
