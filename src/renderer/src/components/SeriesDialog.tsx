import { useEffect, useRef, useState } from 'react'
import { Film, Loader2, Search, Tv } from 'lucide-react'
import { tmdbImageUrl, type SeriesQuery } from '@shared/tmdb-match'
import type { TmdbShow } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'

export type MediaKind = 'tv' | 'movie'

/** Sucht eine Serie oder einen Film bei TMDB und ordnet sie allen Dateien zu */
export function SeriesDialog({
    open,
    onOpenChange,
    initialKind,
    initialQueries
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialKind: MediaKind
    /** Vorbelegung je Art, aus Ordner- und Dateinamen */
    initialQueries: Record<MediaKind, SeriesQuery | null>
}) {
    const assignShow = useStore((s) => s.assignShow)
    const assignMovie = useStore((s) => s.assignMovie)
    const [kind, setKind] = useState<MediaKind>(initialKind)
    const [query, setQuery] = useState('')
    const [year, setYear] = useState('')
    const [results, setResults] = useState<TmdbShow[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const latestSearch = useRef(0)

    const search = async (searchKind: MediaKind, text: string, yearText: string) => {
        if (!text.trim()) return
        // Nach einem Wechsel zwischen Serie und Film zählt nur die neueste Suche
        const searchId = ++latestSearch.current
        setLoading(true)
        setError(null)
        const parsedYear = Number(yearText)
        const validYear = Number.isInteger(parsedYear) && parsedYear > 1900 ? parsedYear : null
        const result =
            searchKind === 'tv'
                ? await window.api.tmdbSearch(text.trim(), validYear)
                : await window.api.tmdbSearchMovie(text.trim(), validYear)
        if (searchId !== latestSearch.current) return
        setLoading(false)
        if (result.ok) setResults(result.data)
        else {
            setResults([])
            setError(result.error)
        }
    }

    // Mit dem erkannten Namen vorbelegen und direkt suchen (beim Öffnen und beim Wechsel zwischen Serie und Film)
    const prefill = (nextKind: MediaKind) => {
        const initial = initialQueries[nextKind]
        const text = initial?.query ?? ''
        const yearText = initial?.year ? String(initial.year) : ''
        setKind(nextKind)
        setQuery(text)
        setYear(yearText)
        setResults([])
        setError(null)
        if (text) void search(nextKind, text, yearText)
    }

    useEffect(() => {
        if (open) prefill(initialKind)
    }, [open, initialKind, initialQueries])

    const choose = (result: TmdbShow) => {
        if (kind === 'tv') void assignShow(result)
        else assignMovie(result)
        onOpenChange(false)
    }

    const Icon = kind === 'tv' ? Tv : Film

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl" onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Bei TMDB zuordnen</DialogTitle>
                    <DialogDescription>
                        {kind === 'tv'
                            ? 'Die Folgentitel werden anschließend per Staffel und Folge (SxxEyy) zugeordnet.'
                            : 'Die größte Datei ohne Episodenangabe wird zu „Titel (Jahr)“, Extras behalten ihren Namen.'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={kind} onValueChange={(value) => prefill(value as MediaKind)}>
                    <TabsList>
                        <TabsTrigger value="tv">
                            <Tv />
                            Serie
                        </TabsTrigger>
                        <TabsTrigger value="movie">
                            <Film />
                            Film
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                        event.preventDefault()
                        void search(kind, query, year)
                    }}
                >
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={kind === 'tv' ? 'Serienname' : 'Filmtitel'}
                    />
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
                    {results.map((result) => (
                        <button
                            key={result.id}
                            type="button"
                            onClick={() => choose(result)}
                            className="flex items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
                        >
                            {result.posterPath ? (
                                <img
                                    src={tmdbImageUrl(result.posterPath, 'w92')}
                                    alt=""
                                    className="h-[72px] w-12 shrink-0 rounded object-cover"
                                />
                            ) : (
                                <span className="flex h-[72px] w-12 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
                                    <Icon className="size-5" />
                                </span>
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block font-medium">
                                    {result.name}
                                    {result.year && <span className="text-muted-foreground"> ({result.year})</span>}
                                </span>
                                {result.originalName !== result.name && (
                                    <span className="block text-xs text-muted-foreground">{result.originalName}</span>
                                )}
                                <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{result.overview}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    )
}
