import type { ReactElement } from 'react'
import {
    AlertTriangle,
    Ban,
    CheckCircle2,
    ChevronRight,
    Clock,
    FileText,
    FileVideo,
    FileX,
    FolderSearch,
    Image as ImageIcon,
    Loader2,
    RotateCcw,
    SkipForward,
    Sparkles,
    XCircle
} from 'lucide-react'
import { formatBytes } from '@shared/space'
import { formatEpisodeRef } from '@shared/tmdb-match'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Derived, MissingRow, Row } from '@/lib/rows'
import { describePeak } from '@/lib/peak'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { EpisodePicker, EpisodeThumbnail, LocalThumbnail, StillThumbnail } from './EpisodePicker'
import { TrackDetails } from './TrackDetails'

function WithTooltip({ text, children }: { text: string; children: ReactElement }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent className="whitespace-pre-wrap">{text}</TooltipContent>
        </Tooltip>
    )
}

function StatusIcon({ row }: { row: Row }) {
    const { entry, result } = row
    const progress = useStore((s) => s.run.active[entry.file.id])

    if (progress) {
        return (
            <span
                className="flex items-center gap-1 text-xs text-primary tabular-nums"
                title={progress.phase === 'analyze' ? 'Peak-Analyse' : 'Datei wird geschrieben'}
            >
                <Loader2 className="size-4 animate-spin" />
                {progress.phase === 'analyze' ? 'Peak' : `${Math.floor(progress.percent)}%`}
            </span>
        )
    }
    if (result) {
        const icons = {
            ok: <CheckCircle2 className="size-4 text-success" />,
            error: <XCircle className="size-4 text-destructive" />,
            skipped: <SkipForward className="size-4 text-warning" />,
            cancelled: <Ban className="size-4 text-muted-foreground" />
        }
        const labels = { ok: 'Fertig', error: 'Fehler', skipped: 'Übersprungen', cancelled: 'Abgebrochen' }
        const text = [labels[result.status], result.message].filter(Boolean).join(': ')
        return (
            <WithTooltip text={text}>
                <span>{icons[result.status]}</span>
            </WithTooltip>
        )
    }
    if (entry.status === 'pending') return <Loader2 className="size-4 animate-spin text-muted-foreground" />
    if (entry.status === 'error') {
        return (
            <WithTooltip text={`Analyse fehlgeschlagen: ${entry.error}`}>
                <AlertTriangle className="size-4 text-destructive" />
            </WithTooltip>
        )
    }
    return null
}

function NormalizeIndicator({ peakKey }: { peakKey: string }) {
    const peak = useStore((s) => s.peaks[peakKey])
    const settings = useStore((s) => s.settings)
    if (!settings) return null
    const info = describePeak(peak, settings)

    return (
        <WithTooltip text={`Normalisierung: ${info.text}`}>
            <span className="flex">
                {info.tone === 'error' ? (
                    <AlertTriangle className="size-3.5 text-warning" />
                ) : (
                    // Solange der Peak fehlt, nur blass: Wartet bzw. läuft zeigt das Scan-Symbol daneben
                    <Sparkles
                        className={cn(
                            'size-3.5',
                            info.tone === 'pending' ? 'text-primary/35' : info.tone === 'none' ? 'text-muted-foreground' : 'text-primary'
                        )}
                    />
                )}
            </span>
        </WithTooltip>
    )
}

/** Hintergrund-Scan der Datei (Peak und/oder Untertitel-Zählung): Uhr = wartet, Spinner = läuft */
function ScanIndicator({ row }: { row: Row }) {
    const what = row.countsPending ? 'Peak-Analyse und Untertitel-Zählung' : 'Peak-Analyse'
    const hint = row.countsPending ? '\nBis dahin ist die Forced-Erkennung der eingebetteten Untertitel vorläufig.' : ''

    if (row.scanStatus === 'running') {
        return (
            <WithTooltip text={`Hintergrund-Scan läuft (${what})${hint}`}>
                <Loader2 className="size-3.5 animate-spin text-primary" />
            </WithTooltip>
        )
    }
    if (row.scanStatus === 'queued' || (row.countsPending && row.scanStatus !== 'error')) {
        return (
            <WithTooltip text={`Wartet auf den Hintergrund-Scan (${what})${hint}`}>
                <Clock className="size-3.5" />
            </WithTooltip>
        )
    }
    return null
}

/** YouTube-Modus: wurden Beschreibung (.txt) und Bild (.jpg) zur Datei gefunden? */
function SidecarIndicator({ row }: { row: Row }) {
    const { description, image } = row.entry.file
    const name = (filePath: string) => filePath.split(/[\\/]/).pop()
    return (
        <>
            <WithTooltip text={description ? `Beschreibung: ${name(description.path)}` : 'Keine Beschreibung (.txt) gefunden'}>
                <FileText className={cn('size-3.5', description ? 'text-primary' : 'text-muted-foreground/40')} />
            </WithTooltip>
            <WithTooltip text={image ? `Bild: ${name(image)}` : 'Kein Bild (.jpg) gefunden'}>
                <ImageIcon className={cn('size-3.5', image ? 'text-primary' : 'text-muted-foreground/40')} />
            </WithTooltip>
        </>
    )
}

function TrackSummary({ row }: { row: Row }) {
    const peak = useStore((s) => (row.peakKey ? s.peaks[row.peakKey] : undefined))
    const settings = useStore((s) => s.settings)
    const { analysis } = row
    if (!analysis || !row.plan || !settings) return null
    // Ohne nötige Verstärkung kommt keine normalisierte Spur dazu
    const normalizes = !!row.plan.normalize && describePeak(peak, settings).tone !== 'none'
    const audioAfter = row.plan.audio.length + (normalizes ? 1 : 0)
    const embedded = analysis.subtitle.filter((track) => track.inputIndex === 0).length
    const external = analysis.subtitle.length - embedded

    return (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <span title="Audiospuren vorher → nachher">
                A {analysis.audio.length}→{audioAfter}
            </span>
            <span title={`Untertitel vorher${external > 0 ? ' (eingebettet + extern)' : ''} → nachher`}>
                UT {embedded}
                {external > 0 && <span className="text-primary">+{external}</span>}→{row.plan.subtitle.length}
            </span>
            <ScanIndicator row={row} />
            {row.peakKey && <NormalizeIndicator peakKey={row.peakKey} />}
            {settings.mode === 'youtube' && <SidecarIndicator row={row} />}
        </span>
    )
}

function FileRow({ row }: { row: Row }) {
    const expanded = useStore((s) => !!s.expanded[row.entry.file.id])
    const running = useStore((s) => s.run.running)
    // Im YouTube-Modus zählt die TMDB-Zuordnung nicht, dafür steht dort das Bild neben dem Video
    const youtube = useStore((s) => s.settings?.mode === 'youtube')
    const hasShow = useStore((s) => s.tmdb.episodes.length > 0) && !youtube
    const { toggleExcluded, toggleExpanded, setOverride } = useStore.getState()
    const { file } = row.entry
    const done = row.result?.status === 'ok'
    const folder = file.relativePath.slice(0, Math.max(0, file.relativePath.length - (file.name + file.extension).length - 1))

    return (
        <div className={cn('border-b last:border-b-0', row.excluded && 'opacity-45')}>
            <div className="grid grid-cols-2 items-center">
                {/* Links: Quelldatei */}
                <div className="flex min-w-0 items-center gap-2 py-2 pr-3 pl-3">
                    <Checkbox
                        checked={!row.excluded}
                        disabled={running}
                        onCheckedChange={() => toggleExcluded(file.id)}
                        aria-label="Datei einbeziehen"
                    />
                    <button
                        type="button"
                        onClick={() => toggleExpanded(file.id)}
                        disabled={!row.plan}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                        aria-label="Spuren anzeigen"
                    >
                        <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
                    </button>
                    <FileVideo className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                        <div className={cn('truncate', row.excluded && 'line-through')} title={file.fullPath}>
                            {file.name}
                            <span className="text-muted-foreground">{file.extension}</span>
                        </div>
                        {folder && <div className="truncate text-xs text-muted-foreground">{folder}</div>}
                    </div>
                    <TrackSummary row={row} />
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
                    <span className="flex w-12 shrink-0 justify-center">
                        <StatusIcon row={row} />
                    </span>
                </div>

                {/* Rechts: Zielname, mit zugeordneter Serie davor das Episodenbild und darunter die TMDB-Episode */}
                <div
                    className={cn(
                        'flex min-w-0 items-center gap-3 self-stretch border-l pr-3 pl-3',
                        hasShow || youtube ? 'py-2.5' : 'py-2'
                    )}
                >
                    {hasShow && <EpisodeThumbnail row={row} disabled={row.excluded || running || done} />}
                    {youtube && <LocalThumbnail path={file.image} />}
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <div
                                className={cn(
                                    'flex h-8 min-w-0 flex-1 items-center rounded-md border border-transparent bg-black/20 pr-2 transition-colors focus-within:border-ring',
                                    row.conflict && !row.excluded && 'border-destructive/70 bg-destructive/10',
                                    done && 'border-success/40 bg-success/5'
                                )}
                            >
                                <input
                                    value={row.stem}
                                    disabled={row.excluded || running || done}
                                    onChange={(event) => setOverride(file.id, event.target.value)}
                                    spellCheck={false}
                                    className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed"
                                />
                                <span className="shrink-0 text-sm text-muted-foreground">.mkv</span>
                            </div>
                            <span className="flex w-7 shrink-0 justify-center">
                                {row.conflict && !row.excluded ? (
                                    <WithTooltip text={row.conflict.message}>
                                        <AlertTriangle className="size-4 text-destructive" />
                                    </WithTooltip>
                                ) : row.overridden && !done ? (
                                    <WithTooltip text="Auf Vorschlag zurücksetzen">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => setOverride(file.id, null)}
                                            disabled={running}
                                        >
                                            <RotateCcw className="size-3.5" />
                                        </Button>
                                    </WithTooltip>
                                ) : null}
                            </span>
                        </div>
                        {hasShow && <EpisodePicker row={row} disabled={row.excluded || running || done} />}
                    </div>
                </div>
            </div>

            {expanded && row.analysis && row.plan && (
                <TrackDetails
                    file={file}
                    stem={row.stem}
                    analysis={row.analysis}
                    plan={row.plan}
                    peakKey={row.peakKey}
                    countsPending={row.countsPending}
                />
            )}
        </div>
    )
}

/** Hinweis zur fehlenden Folge, bei noch nicht ausgestrahlten mit Termin */
function missingHint(airDate: string | null): string {
    const text = 'Folge nicht im Eingabeordner gefunden'
    if (!airDate || airDate <= new Date().toISOString().slice(0, 10)) return text
    return `${text} · erscheint am ${new Date(airDate).toLocaleDateString('de-DE')}`
}

/** Folge einer erkannten Staffel ohne Datei; angehakt wird ihr Bild schwarz-weiß als -thumb.jpg exportiert */
function MissingFileRow({ row }: { row: MissingRow }) {
    const running = useStore((s) => s.run.running)
    const toggleMissing = useStore((s) => s.toggleMissing)
    const setMissingStill = useStore((s) => s.setMissingStill)
    const { episode } = row
    const label = `${formatEpisodeRef(episode)} · ${episode.title}`

    return (
        <div className={cn('border-b last:border-b-0', !row.selected && 'opacity-45')}>
            <div className="grid grid-cols-2 items-center">
                <div className="flex min-w-0 items-center gap-2 py-2 pr-3 pl-3">
                    <Checkbox
                        checked={row.selected}
                        disabled={running || !row.stillPath}
                        onCheckedChange={() => toggleMissing(row.key)}
                        aria-label="Bild der fehlenden Folge exportieren"
                        title={
                            row.stillPath
                                ? 'Angehakt wird das Episodenbild schwarz-weiß als -thumb.jpg exportiert'
                                : 'Bei TMDB gibt es zu dieser Folge kein Bild'
                        }
                    />
                    {/* Platzhalter für den Aufklapp-Pfeil, damit die Spalten mit den Dateizeilen fluchten */}
                    <span className="size-5 shrink-0" />
                    <FileX className="size-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-muted-foreground" title={label}>
                            {label}
                        </div>
                        <div className="truncate text-xs text-warning">{missingHint(episode.airDate)}</div>
                    </div>
                </div>

                <div className="flex min-w-0 items-center gap-3 self-stretch border-l py-2.5 pr-3 pl-3">
                    <StillThumbnail
                        episode={episode}
                        stillPath={row.stillPath}
                        stillManual={row.stillManual}
                        disabled={running}
                        onChange={(path) => setMissingStill(row.key, path)}
                        missing
                    />
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <div className="flex h-8 min-w-0 flex-1 items-center rounded-md border border-transparent bg-black/20 pr-2">
                                <span className="min-w-0 flex-1 truncate px-2.5 text-sm text-muted-foreground" title={row.stem}>
                                    {row.stem}
                                </span>
                                <span className="shrink-0 text-sm text-muted-foreground">-thumb.jpg</span>
                            </div>
                            <span className="w-7 shrink-0" />
                        </div>
                        <span className="flex h-6 w-fit max-w-full items-center truncate rounded border border-dashed border-input px-2 text-xs text-muted-foreground">
                            {label}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

/** Fehlende und doppelte Folgen im Tabellenkopf, dazu der Schalter für die fehlenden Folgen */
function EpisodeCheck({ derived }: { derived: Derived }) {
    const showMissing = useStore((s) => s.settings?.showMissingEpisodes ?? true)
    const updateSettings = useStore((s) => s.updateSettings)
    const { missing, duplicates } = derived
    const refs = (list: { season: number; episode: number }[]) => list.map(formatEpisodeRef).join(', ')

    return (
        <>
            {missing.length > 0 && (
                <WithTooltip text={`Es fehlen ${refs(missing.map((row) => row.episode))}`}>
                    <span className="rounded bg-warning/15 px-1.5 py-px text-warning normal-case">
                        {missing.length === 1 ? '1 Folge fehlt' : `${missing.length} Folgen fehlen`}
                    </span>
                </WithTooltip>
            )}
            {duplicates.length > 0 && (
                <WithTooltip text={`Mehrere Dateien auf derselben Folge: ${refs(duplicates)}`}>
                    <span className="rounded bg-warning/15 px-1.5 py-px text-warning normal-case">{refs(duplicates)} doppelt</span>
                </WithTooltip>
            )}
            <Label className="ml-auto cursor-pointer font-normal tracking-normal normal-case">
                <Checkbox checked={showMissing} onCheckedChange={(checked) => updateSettings({ showMissingEpisodes: checked === true })} />
                Fehlende Folgen anzeigen
            </Label>
        </>
    )
}

export function FileTable({ derived }: { derived: Derived }) {
    const inputDir = useStore((s) => s.settings?.inputDir)
    const scanning = useStore((s) => s.scanning)
    const running = useStore((s) => s.run.running)
    const setAllExcluded = useStore((s) => s.setAllExcluded)
    const hasShow = useStore((s) => s.tmdb.episodes.length > 0 && s.settings?.mode !== 'youtube')
    const { rows, missing, order, conflictCount, pendingAnalysis, scanProgress } = derived

    const selectedCount = rows.filter((row) => !row.excluded).length
    const allIncluded = rows.length > 0 && rows.every((row) => !row.excluded)
    const noneIncluded = rows.every((row) => row.excluded)

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/40">
            <div className="grid grid-cols-2 border-b bg-card text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <div className="flex items-center gap-2 px-3 py-2.5">
                    <Checkbox
                        checked={allIncluded ? true : noneIncluded ? false : 'indeterminate'}
                        disabled={running || rows.length === 0}
                        onCheckedChange={() => setAllExcluded(allIncluded)}
                        aria-label="Alle auswählen"
                    />
                    <span>Quelldateien</span>
                    <span className="normal-case">
                        ({selectedCount}/{rows.length} ausgewählt{pendingAnalysis > 0 && `, ${pendingAnalysis} in Analyse`})
                    </span>
                    {scanProgress.done < scanProgress.total && (
                        <WithTooltip
                            text={
                                'Peak-Analyse und Untertitel-Zählung lesen jede Datei einmal komplett.\n' +
                                'Anwenden ist schon jetzt möglich; noch fehlende Scans werden dabei vorgezogen.'
                            }
                        >
                            <span className="ml-auto flex items-center gap-1.5 normal-case">
                                <Loader2 className="size-3.5 animate-spin text-primary" />
                                Hintergrund-Scan {scanProgress.done}/{scanProgress.total}
                            </span>
                        </WithTooltip>
                    )}
                </div>
                <div className="flex items-center gap-2 border-l px-3 py-2.5">
                    <span>Zielname</span>
                    {conflictCount > 0 && (
                        <span className="rounded bg-destructive/15 px-1.5 py-px text-destructive normal-case">
                            {conflictCount} Konflikt{conflictCount > 1 && 'e'}, werden übersprungen
                        </span>
                    )}
                    {hasShow && rows.length > 0 && <EpisodeCheck derived={derived} />}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {order.map((entry) =>
                    entry.type === 'file' ? (
                        <FileRow key={rows[entry.index].entry.file.id} row={rows[entry.index]} />
                    ) : (
                        <MissingFileRow key={`missing-${missing[entry.index].key}`} row={missing[entry.index]} />
                    )
                )}

                {rows.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                        {scanning ? (
                            <>
                                <Loader2 className="size-8 animate-spin" />
                                Ordner wird eingelesen …
                            </>
                        ) : (
                            <>
                                <FolderSearch className="size-10 opacity-60" />
                                {inputDir ? 'Keine Mediendateien (.mkv, .mp4, .avi) gefunden' : 'Wähle oben einen Input-Ordner aus'}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
