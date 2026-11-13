import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCcw, X, XCircle } from 'lucide-react'
import { validateStem } from '@shared/rename'
import { formatBytes } from '@shared/space'
import { formatChoices } from '@shared/youtube-dl'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { cn, formatDuration } from '@/lib/utils'
import { isActive, itemTargetStem, resolveItem, useYtStore, type YtItem } from '@/lib/yt-store'

const formatSeconds = (seconds: number | null) => {
    if (seconds === null) return ''
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

/** Eigene Formatwahl für ein Video */
function FormatDialog({ item, onClose }: { item: YtItem | null; onClose: () => void }) {
    const setManual = useYtStore((s) => s.setManual)
    const choices = useMemo(() => (item?.video ? formatChoices(item.video.formats) : { video: [], audio: [] }), [item?.video])
    const [videoId, setVideoId] = useState('')
    const [audioId, setAudioId] = useState('')
    const key = item?.key

    // Nur beim Öffnen vorbelegen, nicht bei jeder Änderung des Eintrags
    useEffect(() => {
        if (!item) return
        setVideoId(item.manual ? (item.manual.videoId ?? '') : (choices.video[0]?.id ?? ''))
        setAudioId(item.manual ? (item.manual.audioId ?? '') : (choices.audio[0]?.id ?? ''))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, choices])

    const size = (bytes: number | null) => (bytes ? ` · ${formatBytes(bytes)}` : '')

    return (
        <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Format wählen</DialogTitle>
                    <DialogDescription className="truncate">{item?.video?.title ?? item?.entry.title}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        Video
                        <Select value={videoId} onChange={(event) => setVideoId(event.target.value)}>
                            <option value="">Kein Video (nur Audio)</option>
                            {choices.video.map((format) => (
                                <option key={format.id} value={format.id}>
                                    {format.label}
                                    {size(format.filesize)} · {format.id}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        Audio
                        <Select value={audioId} onChange={(event) => setAudioId(event.target.value)}>
                            <option value="">Kein Audio</option>
                            {choices.audio.map((format) => (
                                <option key={format.id} value={format.id}>
                                    {format.label}
                                    {size(format.filesize)} · {format.id}
                                </option>
                            ))}
                        </Select>
                    </label>
                </div>
                <DialogFooter>
                    <Button
                        variant="ghost"
                        className="mr-auto"
                        onClick={() => {
                            if (item) setManual(item.key, null)
                            onClose()
                        }}
                    >
                        Auswahl oben nutzen
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        Abbrechen
                    </Button>
                    <Button
                        disabled={!videoId && !audioId}
                        onClick={() => {
                            if (item) setManual(item.key, { videoId: videoId || null, audioId: audioId || null })
                            onClose()
                        }}
                    >
                        Übernehmen
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** Status rechts in der Zeile: Fortschritt, Fehler mit „Erneut“ oder Hinweis */
function ItemStatus({ item }: { item: YtItem }) {
    const { retry, cancel } = useYtStore.getState()

    if (item.status === 'running' && item.progress) {
        const { progress } = item
        const text =
            progress.phase === 'merge'
                ? 'Zusammenführen …'
                : progress.phase === 'post'
                  ? 'Bild & Beschreibung …'
                  : progress.fraction === 0 && !progress.speed
                    ? 'Wird vorbereitet …'
                    : `${Math.floor(progress.fraction * 100)}%${progress.speed ? ` · ${formatBytes(progress.speed)}/s` : ''}${progress.etaSec ? ` · ${formatDuration(progress.etaSec)}` : ''}`
        return (
            <div className="flex w-52 shrink-0 items-center gap-1.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Progress value={progress.fraction * 100} className="h-1.5" />
                    <span className="truncate text-[11px] text-muted-foreground tabular-nums">{text}</span>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => void cancel(item.key)} title="Download abbrechen">
                    <X />
                </Button>
            </div>
        )
    }

    switch (item.status) {
        case 'waiting':
        case 'queued':
        case 'running':
            return (
                <div className="flex w-52 shrink-0 items-center justify-between gap-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Loader2 className="size-3.5 animate-spin" />
                        {item.status === 'waiting' ? 'Wartet auf Formate' : item.status === 'queued' ? 'In Warteschlange' : 'Startet …'}
                    </span>
                    <Button variant="ghost" size="icon-sm" onClick={() => void cancel(item.key)} title="Download abbrechen">
                        <X />
                    </Button>
                </div>
            )
        case 'ok':
            return (
                <span className="flex w-52 shrink-0 items-center gap-1.5 text-xs text-success" title={item.path}>
                    <CheckCircle2 className="size-4 shrink-0" />
                    {item.delivered ? 'Fertig im Output' : 'Geladen'}
                </span>
            )
        case 'error':
        case 'cancelled':
            return (
                <div
                    className={cn(
                        'flex w-52 shrink-0 items-center justify-between gap-1.5 text-xs',
                        item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    )}
                    title={item.message}
                >
                    <span className="flex min-w-0 items-center gap-1.5">
                        {item.status === 'error' && <XCircle className="size-4 shrink-0" />}
                        <span className="line-clamp-2">{item.status === 'error' ? (item.message ?? 'Fehler') : 'Abgebrochen'}</span>
                    </span>
                    <Button variant="ghost" size="icon-sm" onClick={() => retry(item.key)} title="Erneut versuchen">
                        <RotateCcw />
                    </Button>
                </div>
            )
        default:
            return (
                <span className="flex w-52 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {item.checked ? (
                        <>
                            <Download className="size-3.5" />
                            Wird heruntergeladen
                        </>
                    ) : (
                        'Nicht ausgewählt'
                    )}
                </span>
            )
    }
}

function YoutubeRow({ item, onFormat }: { item: YtItem; onFormat: (item: YtItem) => void }) {
    const settings = useStore((s) => s.settings)
    const activeRuleSetId = useStore((s) => s.activeRuleSetId)
    const source = useYtStore((s) => s.sources.find((candidate) => candidate.url === item.sourceUrl))
    const phase = useYtStore((s) => s.phase)
    const { toggle, retry, setStemOverride } = useYtStore.getState()
    if (!settings || !source) return null

    const resolved = resolveItem(item, settings.youtube.selection)
    const title = item.video?.title ?? item.entry.title
    const duration = item.video?.durationSec ?? item.entry.durationSec
    const thumbnail = item.video?.thumbnail ?? item.entry.thumbnail
    const excluded = !item.checked && !isActive(item)
    const locked = phase !== 'idle'
    const stem = itemTargetStem(item, source, settings, activeRuleSetId)
    const target = `${stem}.${resolved?.audioOnly ? resolved.ext : 'mkv'}`
    const invalid = validateStem(stem)

    return (
        <div className={cn('border-b', excluded && 'opacity-45')}>
            <div className="grid grid-cols-2 items-center">
                {/* Links: Video aus dem Link */}
                <div className="flex min-w-0 items-center gap-2 py-2 pr-3 pl-3">
                    <Checkbox
                        checked={item.checked}
                        disabled={locked || !!item.detailError}
                        onCheckedChange={() => toggle(item.key)}
                        aria-label="Video herunterladen"
                    />
                    <div className="relative h-[45px] w-20 shrink-0 overflow-hidden rounded bg-secondary">
                        {thumbnail && <img src={thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
                        {duration !== null && (
                            <span className="absolute right-0.5 bottom-0.5 rounded bg-black/75 px-1 text-[10px] text-white tabular-nums">
                                {formatSeconds(duration)}
                            </span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className={cn('truncate', excluded && 'line-through')} title={item.video?.url ?? item.entry.url}>
                            {title}
                        </div>
                        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                            {source.kind === 'playlist' && <span className="shrink-0">#{item.entry.index}</span>}
                            {item.detailLoading ? (
                                <span className="flex items-center gap-1">
                                    <Loader2 className="size-3 animate-spin" />
                                    Formate werden gelesen …
                                </span>
                            ) : item.detailError ? (
                                <span className="flex min-w-0 items-center gap-1 text-destructive">
                                    <XCircle className="size-3.5 shrink-0" />
                                    <span className="truncate" title={item.detailError}>
                                        {item.detailError}
                                    </span>
                                    <button type="button" className="shrink-0 underline" onClick={() => retry(item.key)}>
                                        erneut
                                    </button>
                                </span>
                            ) : resolved ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => onFormat(item)}
                                        disabled={locked}
                                        className={cn(
                                            '-mx-1 truncate rounded px-1 hover:bg-secondary hover:text-foreground',
                                            item.manual && 'text-primary'
                                        )}
                                        title="Format für dieses Video ändern"
                                    >
                                        {resolved.label}
                                        {item.manual && ' (eigene Wahl)'}
                                    </button>
                                    {resolved.notice && (
                                        <span className="flex min-w-0 items-center gap-1 text-warning" title={resolved.notice}>
                                            <AlertTriangle className="size-3.5 shrink-0" />
                                            <span className="truncate">{resolved.notice}</span>
                                        </span>
                                    )}
                                </>
                            ) : item.video ? (
                                <span className="text-destructive">Kein passendes Format</span>
                            ) : (
                                <span>Formate werden beim Auswählen gelesen</span>
                            )}
                        </div>
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {resolved?.estimatedSize ? `~${formatBytes(resolved.estimatedSize)}` : ''}
                    </span>
                </div>

                {/* Rechts: Zielname nach der Verarbeitung und Status des Downloads */}
                <div className="flex min-w-0 items-center gap-3 self-stretch border-l py-2 pr-3 pl-3">
                    <div
                        className={cn(
                            'flex h-8 min-w-0 flex-1 items-center rounded-md border border-transparent bg-black/20 pr-2 transition-colors focus-within:border-ring',
                            invalid && !excluded && 'border-destructive/70 bg-destructive/10'
                        )}
                        title={invalid ?? target}
                    >
                        <input
                            value={stem}
                            disabled={locked || excluded}
                            onChange={(event) => setStemOverride(item.key, event.target.value)}
                            spellCheck={false}
                            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed"
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">{target.match(/\.[^.]+$/)?.[0]}</span>
                    </div>
                    {item.stemOverride !== undefined && !locked && (
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setStemOverride(item.key, null)}
                            title="Auf Vorschlag zurücksetzen"
                        >
                            <RotateCcw className="size-3.5" />
                        </Button>
                    )}
                    <ItemStatus item={item} />
                </div>
            </div>
        </div>
    )
}

/** Videos aus den Links oben in der Dateiliste; geladene erscheinen danach als normale Dateien */
export function YoutubeRows() {
    const sources = useYtStore((s) => s.sources)
    const items = useYtStore((s) => s.items)
    const [formatItem, setFormatItem] = useState<YtItem | null>(null)

    const visible = sources.flatMap((source) =>
        source.entries
            .map((entry) => items[`${source.url}|${entry.id}`])
            // Geladene Videos stehen jetzt als Datei in der Liste (Audio ist schon fertig im Output)
            .filter((item) => item && !(item.status === 'ok' && !item.delivered))
    )
    if (visible.length === 0) return null

    return (
        <>
            {visible.map((item) => (
                <YoutubeRow key={item.key} item={item} onFormat={setFormatItem} />
            ))}
            <FormatDialog item={formatItem} onClose={() => setFormatItem(null)} />
        </>
    )
}

/** Anzahl der Videos, die beim Anwenden heruntergeladen werden */
/**
 * Geschätzter Platz für die ausgewählten Videos: Alle werden erst in den Temp-Ordner im Output geladen und dann
 * verarbeitet, die Rohdateien verschwinden erst danach. Daher zählt jedes Video doppelt (Audio kommt direkt in den Output).
 */
export function useDownloadBytes(): { bytes: number; unknown: number } {
    const items = useYtStore((s) => s.items)
    const selection = useStore((s) => s.settings?.youtube.selection)
    return useMemo(() => {
        let bytes = 0
        let unknown = 0
        if (!selection) return { bytes, unknown }
        for (const item of Object.values(items)) {
            if (!item.checked || item.detailError || item.status === 'ok') continue
            const resolved = resolveItem(item, selection)
            if (!resolved?.estimatedSize) unknown++
            else bytes += resolved.estimatedSize * (resolved.audioOnly ? 1 : 2)
        }
        return { bytes, unknown }
    }, [items, selection])
}

export function useSelectedDownloads(): number {
    return useYtStore((s) => Object.values(s.items).filter((item) => item.checked && !item.detailError && item.status !== 'ok').length)
}
