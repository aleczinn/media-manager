import { useMemo, useState, type FormEvent } from 'react'
import { ListVideo, Loader2, Music, Search, Video, X, XCircle } from 'lucide-react'
import {
    AUDIO_CODEC_LABELS,
    MAX_HEIGHTS,
    summarizeFormats,
    VIDEO_CODEC_LABELS,
    type YtAudioCodec,
    type YtSelection,
    type YtVideoCodec,
    linkForMode,
    parseYoutubeLink
} from '@shared/youtube-dl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useYtStore } from '@/lib/yt-store'

const linksOf = (text: string) => text.split(/\s+/).filter((part) => /^https?:\/\//i.test(part))

/** Kleines Auswahlfeld wie das Reihenfolge-Dropdown der TMDB-Leiste */
function MiniSelect({
    value,
    onChange,
    disabled,
    title,
    children
}: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    title?: string
    children: React.ReactNode
}) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            title={title}
            className="h-7 rounded border border-input bg-transparent px-1.5 text-xs outline-none disabled:opacity-50 [&>option]:bg-popover"
        >
            {children}
        </select>
    )
}

/**
 * Leiste im YouTube-Modus an der Stelle der TMDB-Leiste: Link zu einem Video oder einer Playlist und das Format.
 * Die Videos erscheinen oben in der Dateiliste und werden beim Anwenden heruntergeladen und gleich verarbeitet.
 */
export function YoutubeLinkBar() {
    const settings = useStore((s) => s.settings)
    const updateSettings = useStore((s) => s.updateSettings)
    const applying = useStore((s) => s.run.running)
    const analyzing = useYtStore((s) => s.analyzing)
    const error = useYtStore((s) => s.analyzeError)
    const status = useYtStore((s) => s.status)
    const sources = useYtStore((s) => s.sources)
    const items = useYtStore((s) => s.items)
    const phase = useYtStore((s) => s.phase)
    const { analyze, removeSource } = useYtStore.getState()
    const [text, setText] = useState('')

    const counts = useMemo(() => {
        const summaries = Object.values(items).flatMap((item) => (item.video ? [summarizeFormats(item.video.formats)] : []))
        const video = (codec: YtVideoCodec) => summaries.filter((summary) => summary.video.some((entry) => entry.codec === codec)).length
        const audio = (codec: 'opus' | 'aac') => summaries.filter((summary) => summary.audio.some((entry) => entry.codec === codec)).length
        return {
            total: summaries.length,
            video: { av1: video('av1'), vp9: video('vp9'), h264: video('h264') } as Record<YtVideoCodec, number>,
            audio: { opus: audio('opus'), aac: audio('aac'), mp3: summaries.length } as Record<YtAudioCodec, number>
        }
    }, [items])

    if (!settings) return null
    const busy = phase !== 'idle' || applying
    const unavailable = status?.state === 'error'
    const youtube = settings.youtube
    const selection = youtube.selection
    const setSelection = (change: Partial<YtSelection>) =>
        void updateSettings({ youtube: { ...youtube, selection: { ...selection, ...change } } })
    const count = (value: number) => (counts.total > 0 ? ` · ${value}/${counts.total}` : '')

    const mode = youtube.linkMode
    const links = linksOf(text)
    // Hinweis, wenn der Link ein Video in einer Playlist ist: der Schalter entscheidet, was gelesen wird
    const mixed = links.some((link) => {
        const parsed = parseYoutubeLink(link)
        return !!parsed.videoId && !!parsed.listId
    })

    const submit = (event?: FormEvent) => {
        event?.preventDefault()
        const rejected = links.filter((link) => !linkForMode(link, mode))
        for (const link of links) {
            const url = linkForMode(link, mode)
            if (url) void analyze(url)
        }
        if (rejected.length > 0) {
            useYtStore.setState({ analyzeError: 'Das ist eine Playlist – zum Lesen auf „Playlist“ umstellen' })
            setText(rejected.join(' '))
        } else setText('')
    }

    return (
        <div className="flex flex-col gap-2 rounded-lg border bg-card/60 px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Link</span>
                <form onSubmit={submit} className="flex min-w-72 flex-1 items-center gap-2">
                    <Input
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="Link zu einem YouTube-Video oder einer Playlist einfügen …"
                        disabled={unavailable}
                        className="h-8 flex-1"
                    />
                    <div
                        className="flex items-center rounded-md border p-0.5"
                        title="Bei einem Video aus einer Playlist: nur das Video oder die ganze Playlist lesen"
                    >
                        {(
                            [
                                ['video', 'Einzelvideo', Video],
                                ['playlist', 'Playlist', ListVideo]
                            ] as const
                        ).map(([value, label, Icon]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => {
                                    void updateSettings({ youtube: { ...youtube, linkMode: value } })
                                    useYtStore.setState({ analyzeError: null })
                                }}
                                className={cn(
                                    'flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors',
                                    mode === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                                )}
                            >
                                <Icon className="size-3.5" />
                                {label}
                            </button>
                        ))}
                    </div>
                    <Button type="submit" variant="secondary" size="sm" disabled={links.length === 0 || unavailable}>
                        {analyzing.length > 0 ? <Loader2 className="animate-spin" /> : <Search />}
                        Lesen
                    </Button>
                </form>

                <div className="flex items-center rounded-md border p-0.5">
                    {(
                        [
                            ['video', 'Video', Video],
                            ['audio', 'Nur Audio', Music]
                        ] as const
                    ).map(([type, label, Icon]) => (
                        <button
                            key={type}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                setSelection({
                                    type,
                                    audioCodec: type === 'video' && selection.audioCodec === 'mp3' ? 'opus' : selection.audioCodec
                                })
                            }
                            className={cn(
                                'flex h-6 items-center gap-1 rounded px-2 text-xs transition-colors disabled:opacity-50',
                                selection.type === type ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <Icon className="size-3.5" />
                            {label}
                        </button>
                    ))}
                </div>
                {selection.type === 'video' && (
                    <>
                        <MiniSelect
                            value={selection.videoCodec}
                            onChange={(value) => setSelection({ videoCodec: value as YtVideoCodec })}
                            disabled={busy}
                            title="Bevorzugter Video-Codec; die Zahl sagt, wie viele Videos ihn anbieten"
                        >
                            {(Object.keys(VIDEO_CODEC_LABELS) as YtVideoCodec[]).map((codec) => (
                                <option key={codec} value={codec}>
                                    {VIDEO_CODEC_LABELS[codec]}
                                    {count(counts.video[codec])}
                                </option>
                            ))}
                        </MiniSelect>
                        <MiniSelect
                            value={String(selection.maxHeight ?? '')}
                            onChange={(value) => setSelection({ maxHeight: value ? Number(value) : null })}
                            disabled={busy}
                            title="Höchste Auflösung"
                        >
                            {MAX_HEIGHTS.map((height) => (
                                <option key={height ?? 'best'} value={height ?? ''}>
                                    {height ? `bis ${height}p` : 'Beste Auflösung'}
                                </option>
                            ))}
                        </MiniSelect>
                    </>
                )}
                <MiniSelect
                    value={selection.audioCodec}
                    onChange={(value) => setSelection({ audioCodec: value as YtAudioCodec })}
                    disabled={busy}
                    title="Tonspur; deutsche Spuren werden bevorzugt"
                >
                    {(selection.type === 'audio' ? (['opus', 'aac', 'mp3'] as const) : (['opus', 'aac'] as const)).map((codec) => (
                        <option key={codec} value={codec}>
                            {AUDIO_CODEC_LABELS[codec]}
                            {codec === 'mp3' ? ' (umgewandelt)' : count(counts.audio[codec])}
                        </option>
                    ))}
                </MiniSelect>
            </div>

            {(sources.length > 0 || analyzing.length > 0 || error || unavailable || mixed) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {mixed && (
                        <span className="text-muted-foreground">
                            Video aus einer Playlist:{' '}
                            {mode === 'video' ? 'es wird nur dieses Video gelesen' : 'es wird die ganze Playlist gelesen'}
                        </span>
                    )}
                    {sources.map((source) => {
                        const sourceItems = Object.values(items).filter((item) => item.sourceUrl === source.url)
                        const loading = sourceItems.filter((item) => item.detailLoading).length
                        return (
                            <span
                                key={source.url}
                                className="flex max-w-full items-center gap-1.5 rounded-md bg-secondary py-0.5 pr-0.5 pl-2"
                                title={source.url}
                            >
                                <ListVideo className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{source.title}</span>
                                <span className="shrink-0 text-muted-foreground">
                                    {source.kind === 'playlist' ? `${source.entries.length} Videos` : 'Video'}
                                    {loading > 0 && ` · ${loading} werden gelesen`}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeSource(source.url)}
                                    disabled={busy}
                                    className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                                    title="Entfernen"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </span>
                        )
                    })}
                    {analyzing.map((url) => (
                        <span key={url} className="flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" />
                            Lese {url} …
                        </span>
                    ))}
                    {error && (
                        <span className="flex items-center gap-1.5 text-destructive">
                            <XCircle className="size-3.5" />
                            {error}
                        </span>
                    )}
                    {unavailable && (
                        <span className="flex items-center gap-1.5 text-destructive">
                            <XCircle className="size-3.5" />
                            {status?.message ?? 'yt-dlp nicht verfügbar'} – in den Einstellungen unter „YouTube-Download“ prüfen
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
