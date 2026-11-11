import { useMemo, useState } from 'react'
import { ChevronDown, Film, Loader2, ListOrdered, Star, Tv, X } from 'lucide-react'
import { EPISODE_GROUP_TYPES } from '@shared/episode-order'
import { parseEpisode } from '@shared/rename'
import { episodeRefFromName, movieQueryFromFile, seriesQueryFromFile, tmdbImageUrl } from '@shared/tmdb-match'
import { Button } from '@/components/ui/button'
import type { TmdbEpisodeGroup } from '@shared/types'
import type { Derived } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { SeriesDialog } from './SeriesDialog'

/** „DVD · Name (24 Folgen)“; der Typ entfällt, wenn der Name ihn schon nennt */
function orderLabel(order: TmdbEpisodeGroup): string {
    const type = EPISODE_GROUP_TYPES[order.type]
    const name = type && !order.name.toLowerCase().includes(type.toLowerCase()) ? `${type} · ${order.name}` : order.name
    return `${name} (${order.episodeCount} Folgen)`
}

/** Leiste über der Tabelle: zugeordnete TMDB-Serie bzw. Film und Knöpfe zum Zuordnen/Entfernen */
export function SeriesBar({ derived }: { derived: Derived }) {
    const hasKey = useStore((s) => !!s.settings?.tmdbApiKey)
    const tmdb = useStore((s) => s.tmdb)
    const running = useStore((s) => s.run.running)
    const clearShow = useStore((s) => s.clearShow)
    const setEpisodeOrder = useStore((s) => s.setEpisodeOrder)
    const [open, setOpen] = useState(false)

    const activeRows = derived.rows.filter((row) => !row.excluded)
    const episodeRows = activeRows.filter((row) => episodeRefFromName(row.entry.file.name))
    const matched = episodeRows.filter((row) => row.episode).length
    const movieMain = derived.rows.find((row) => row.movieMain)

    // Suchbegriffe aus der ersten Folge bzw. der größten Datei ohne Episodenangabe (Ordner- bzw. Dateiname)
    const firstEpisode = episodeRows[0]?.entry.file
    const largestOther = activeRows
        .filter((row) => !parseEpisode(row.entry.file.name))
        .reduce<(typeof activeRows)[number] | null>(
            (largest, row) => (!largest || row.entry.file.size > largest.entry.file.size ? row : largest),
            null
        )?.entry.file
    const initialQueries = useMemo(
        () => ({
            tv: firstEpisode ? seriesQueryFromFile(firstEpisode) : null,
            movie: largestOther ? movieQueryFromFile(largestOther) : null
        }),
        [firstEpisode, largestOther]
    )

    const target = tmdb.show ?? tmdb.movie
    if (derived.rows.length === 0 && !target) return null

    return (
        <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">TMDB</span>

            {target ? (
                <div className="flex min-w-0 items-center gap-2.5">
                    {target.posterPath ? (
                        <img src={tmdbImageUrl(target.posterPath, 'w92')} alt="" className="h-9 w-6 rounded-sm object-cover" />
                    ) : tmdb.show ? (
                        <Tv className="size-4 text-muted-foreground" />
                    ) : (
                        <Film className="size-4 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-medium">
                        {target.name}
                        {target.year && <span className="text-muted-foreground"> ({target.year})</span>}
                    </span>
                    {tmdb.loading ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Episoden werden geladen …
                        </span>
                    ) : tmdb.error ? (
                        <span className="text-xs text-destructive">{tmdb.error}</span>
                    ) : tmdb.show ? (
                        <span className="text-xs text-muted-foreground">
                            {matched} von {episodeRows.length} Folgen zugeordnet
                        </span>
                    ) : (
                        <span className="truncate text-xs text-muted-foreground">
                            Film{movieMain ? ` · Hauptdatei ${movieMain.entry.file.name}` : ' · keine Datei ohne Episodenangabe'}
                        </span>
                    )}
                    {tmdb.show && !tmdb.loading && tmdb.orders.length > 0 && (
                        <div className="relative ml-2 flex shrink-0 items-center">
                            {tmdb.orderLoading ? (
                                <Loader2 className="pointer-events-none absolute left-1.5 size-3.5 animate-spin text-muted-foreground" />
                            ) : (
                                <ListOrdered className="pointer-events-none absolute left-1.5 size-3.5 text-muted-foreground" />
                            )}
                            <select
                                value={tmdb.orderId ?? ''}
                                onChange={(event) => void setEpisodeOrder(event.target.value || null)}
                                disabled={running || tmdb.orderLoading}
                                title={
                                    'Episodenreihenfolge laut TMDB, z. B. DVD statt Ausstrahlung\n' +
                                    'Staffel und Folge im Dateinamen werden in dieser Reihenfolge gesucht; die Wahl wird je Serie gespeichert'
                                }
                                className={cn(
                                    'h-6 max-w-64 appearance-none truncate rounded border bg-transparent pr-6 pl-6 text-xs outline-none disabled:opacity-50 [&>option]:bg-popover',
                                    tmdb.orderId ? 'border-primary/50 text-foreground' : 'border-input text-muted-foreground'
                                )}
                            >
                                <option value="">Ausstrahlung</option>
                                {tmdb.orders.map((order) => (
                                    <option key={order.id} value={order.id}>
                                        {orderLabel(order)}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-muted-foreground" />
                        </div>
                    )}
                    {tmdb.genres.length > 0 && (
                        <span className="ml-4 flex min-w-0 items-center gap-1 overflow-hidden" title={tmdb.genres.join(', ')}>
                            {tmdb.genres.map((genre) => (
                                <span
                                    key={genre}
                                    className="shrink-0 rounded bg-secondary px-1.5 py-px text-[11px] whitespace-nowrap text-muted-foreground"
                                >
                                    {genre}
                                </span>
                            ))}
                        </span>
                    )}
                    {tmdb.rating && (
                        <span
                            className="ml-4 flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums"
                            title={`Bewertung bei TMDB: ${tmdb.rating.average.toFixed(1).replace('.', ',')} von 10 (${tmdb.rating.votes.toLocaleString('de-DE')} Stimmen)`}
                        >
                            <Star className="size-3.5 fill-warning text-warning" />
                            <span>
                                <span className="font-medium text-foreground">{tmdb.rating.average.toFixed(1).replace('.', ',')}</span>/10
                            </span>
                            <span className="text-[10px] tracking-wide uppercase">TMDB</span>
                        </span>
                    )}
                </div>
            ) : (
                <span className="text-sm text-muted-foreground">
                    {hasKey
                        ? 'Keine Serie und kein Film zugeordnet'
                        : 'Für Titel und Bilder einen TMDB-API-Key in den Einstellungen eintragen'}
                </span>
            )}

            <div className="ml-auto flex items-center gap-2">
                {target && (
                    <Button variant="ghost" size="sm" onClick={clearShow} disabled={running}>
                        <X />
                        Entfernen
                    </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={!hasKey || running}>
                    {episodeRows.length > 0 || tmdb.show ? <Tv /> : <Film />}
                    {target ? 'Ändern' : 'Serie / Film zuordnen'}
                </Button>
            </div>

            <SeriesDialog
                open={open}
                onOpenChange={setOpen}
                initialKind={tmdb.movie || (!tmdb.show && episodeRows.length === 0) ? 'movie' : 'tv'}
                initialQueries={initialQueries}
            />
        </div>
    )
}
