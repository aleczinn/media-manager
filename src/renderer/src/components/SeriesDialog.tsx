import { useEffect, useState } from 'react'
import { Loader2, Search, Tv } from 'lucide-react'
import { tmdbImageUrl, type SeriesQuery } from '@shared/tmdb-match'
import type { TmdbShow } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'

/** Sucht eine Serie bei TMDB und ordnet sie allen Dateien zu */
export function SeriesDialog({
    open,
    onOpenChange,
    initialQuery
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialQuery: SeriesQuery | null
}) {
    const assignShow = useStore((s) => s.assignShow)
    const [query, setQuery] = useState('')
    const [year, setYear] = useState('')
    const [results, setResults] = useState<TmdbShow[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const search = async (text: string, yearText: string) => {
        if (!text.trim()) return
        setLoading(true)
        setError(null)
        const parsedYear = Number(yearText)
        const result = await window.api.tmdbSearch(text.trim(), Number.isInteger(parsedYear) && parsedYear > 1900 ? parsedYear : null)
        setLoading(false)
        if (result.ok) setResults(result.data)
        else {
            setResults([])
            setError(result.error)
        }
    }

    // Beim Öffnen mit dem erkannten Seriennamen vorbelegen und direkt suchen
    useEffect(() => {
        if (!open) return
        const text = initialQuery?.query ?? ''
        const yearText = initialQuery?.year ? String(initialQuery.year) : ''
        setQuery(text)
        setYear(yearText)
        setResults([])
        setError(null)
        if (text) void search(text, yearText)
    }, [open, initialQuery])

    const choose = (show: TmdbShow) => {
        void assignShow(show)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl" onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Serie bei TMDB zuordnen</DialogTitle>
                    <DialogDescription>Die Folgentitel werden anschließend per Staffel und Folge (SxxEyy) zugeordnet.</DialogDescription>
                </DialogHeader>

                <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void search(query, year)
                    }}
                >
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Serienname" />
                    <Input
                        value={year}
                        onChange={(event) => setYear(event.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="Jahr"
                        className="w-20"
                    />
                    <Button type="submit" variant="secondary" disabled={loading || !query.trim()}>
                        {loading ? <Loader2 className="animate-spin" /> : <Search />}
                        Suchen
                    </Button>
                </form>

                <div className="-mx-6 flex min-h-40 flex-col gap-1 overflow-y-auto px-6">
                    {error && <p className="py-6 text-center text-sm text-destructive">{error}</p>}
                    {!error && !loading && results.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Keine Treffer</p>
                    )}
                    {results.map((show) => (
                        <button
                            key={show.id}
                            type="button"
                            onClick={() => choose(show)}
                            className="flex items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                        >
                            {show.posterPath ? (
                                <img
                                    src={tmdbImageUrl(show.posterPath, 'w92')}
                                    alt=""
                                    className="h-[72px] w-12 shrink-0 rounded object-cover"
                                />
                            ) : (
                                <span className="flex h-[72px] w-12 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
                                    <Tv className="size-5" />
                                </span>
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block font-medium">
                                    {show.name}
                                    {show.year && <span className="text-muted-foreground"> ({show.year})</span>}
                                </span>
                                {show.originalName !== show.name && (
                                    <span className="block text-xs text-muted-foreground">{show.originalName}</span>
                                )}
                                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{show.overview}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
