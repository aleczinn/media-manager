import { useMemo, useState } from 'react'
import { Loader2, Tv, X } from 'lucide-react'
import { episodeRefFromName, seriesQueryFromFile, tmdbImageUrl } from '@shared/tmdb-match'
import { Button } from '@/components/ui/button'
import type { Derived } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { SeriesDialog } from './SeriesDialog'

/** Leiste über der Tabelle: zugeordnete TMDB-Serie und Knöpfe zum Zuordnen/Entfernen */
export function SeriesBar({ derived }: { derived: Derived }) {
    const hasKey = useStore((s) => !!s.settings?.tmdbApiKey)
    const tmdb = useStore((s) => s.tmdb)
    const running = useStore((s) => s.run.running)
    const clearShow = useStore((s) => s.clearShow)
    const [open, setOpen] = useState(false)

    const episodeRows = derived.rows.filter((row) => !row.excluded && episodeRefFromName(row.entry.file.name))
    const matched = episodeRows.filter((row) => row.episode).length

    // Suchbegriff aus der ersten Folge (Ordner- bzw. Dateiname)
    const firstFile = episodeRows[0]?.entry.file
    const initialQuery = useMemo(() => (firstFile ? seriesQueryFromFile(firstFile) : null), [firstFile])

    if (episodeRows.length === 0 && !tmdb.show) return null

    return (
        <div className="flex items-center gap-3 rounded-lg border bg-card/60 px-4 py-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">TMDB</span>

            {tmdb.show ? (
                <div className="flex min-w-0 items-center gap-2.5">
                    {tmdb.show.posterPath ? (
                        <img src={tmdbImageUrl(tmdb.show.posterPath, 'w92')} alt="" className="h-9 w-6 rounded-sm object-cover" />
                    ) : (
                        <Tv className="size-4 text-muted-foreground" />
                    )}
                    <span className="truncate text-sm font-medium">
                        {tmdb.show.name}
                        {tmdb.show.year && <span className="text-muted-foreground"> ({tmdb.show.year})</span>}
                    </span>
                    {tmdb.loading ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Episoden werden geladen …
                        </span>
                    ) : tmdb.error ? (
                        <span className="text-xs text-destructive">{tmdb.error}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground">
                            {matched} von {episodeRows.length} Folgen zugeordnet
                        </span>
                    )}
                </div>
            ) : (
                <span className="text-sm text-muted-foreground">
                    {hasKey ? 'Keine Serie zugeordnet' : 'Für Folgentitel einen TMDB-API-Key in den Einstellungen eintragen'}
                </span>
            )}

            <div className="ml-auto flex items-center gap-2">
                {tmdb.show && (
                    <Button variant="ghost" size="sm" onClick={clearShow} disabled={running}>
                        <X />
                        Entfernen
                    </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={!hasKey || running}>
                    <Tv />
                    {tmdb.show ? 'Andere Serie' : 'Serie zuordnen'}
                </Button>
            </div>

            <SeriesDialog open={open} onOpenChange={setOpen} initialQuery={initialQuery} />
        </div>
    )
}
