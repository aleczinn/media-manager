import type { ReactElement } from 'react'
import {
    AlertTriangle,
    Ban,
    CheckCircle2,
    ChevronRight,
    FileVideo,
    FolderSearch,
    Loader2,
    RotateCcw,
    SkipForward,
    Sparkles,
    XCircle
} from 'lucide-react'
import { formatBytes } from '@shared/space'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Derived, Row } from '@/lib/rows'
import { describePeak } from '@/lib/peak'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
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
                {info.tone === 'pending' && peak?.status === 'running' ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : info.tone === 'error' ? (
                    <AlertTriangle className="size-3.5 text-warning" />
                ) : (
                    <Sparkles className={cn('size-3.5', info.tone === 'none' ? 'text-muted-foreground' : 'text-primary')} />
                )}
            </span>
        </WithTooltip>
    )
}

function TrackSummary({ row }: { row: Row }) {
    const { analysis } = row.entry
    if (!analysis || !row.plan) return null
    const audioAfter = row.plan.audio.length + (row.plan.normalize ? 1 : 0)

    return (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <span title="Audiospuren vorher → nachher">
                A {analysis.audio.length}→{audioAfter}
            </span>
            <span title="Untertitel vorher → nachher">
                UT {analysis.subtitle.length}→{row.plan.subtitle.length}
            </span>
            {row.peakKey && <NormalizeIndicator peakKey={row.peakKey} />}
        </span>
    )
}

function FileRow({ row }: { row: Row }) {
    const expanded = useStore((s) => !!s.expanded[row.entry.file.id])
    const running = useStore((s) => s.run.running)
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

                {/* Rechts: Zielname */}
                <div className="flex min-w-0 items-center gap-1.5 border-l py-2 pr-3 pl-3">
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
                                <Button variant="ghost" size="icon-sm" onClick={() => setOverride(file.id, null)} disabled={running}>
                                    <RotateCcw className="size-3.5" />
                                </Button>
                            </WithTooltip>
                        ) : null}
                    </span>
                </div>
            </div>

            {expanded && row.entry.analysis && row.plan && (
                <TrackDetails analysis={row.entry.analysis} plan={row.plan} peakKey={row.peakKey} />
            )}
        </div>
    )
}

export function FileTable({ derived }: { derived: Derived }) {
    const inputDir = useStore((s) => s.settings?.inputDir)
    const scanning = useStore((s) => s.scanning)
    const running = useStore((s) => s.run.running)
    const setAllExcluded = useStore((s) => s.setAllExcluded)
    const { rows, conflictCount, pendingAnalysis } = derived

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
                </div>
                <div className="flex items-center gap-2 border-l px-3 py-2.5">
                    <span>Zielname</span>
                    {conflictCount > 0 && (
                        <span className="rounded bg-destructive/15 px-1.5 py-px text-destructive normal-case">
                            {conflictCount} Konflikt{conflictCount > 1 && 'e'}, werden übersprungen
                        </span>
                    )}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {rows.map((row) => (
                    <FileRow key={row.entry.file.id} row={row} />
                ))}

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
