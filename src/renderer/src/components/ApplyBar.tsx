import { useEffect, useRef } from 'react'
import { AlertTriangle, HardDrive, Loader2, Play, Square, XCircle } from 'lucide-react'
import { formatBytes, getSpaceLevel, GB } from '@shared/space'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import type { ArtworkJob } from '@shared/types'
import type { Derived } from '@/lib/rows'
import { useSmoothProgress } from '@/lib/smooth-progress'
import { useStore } from '@/lib/store'
import { cn, formatDuration } from '@/lib/utils'
import { isActive, useYtStore } from '@/lib/yt-store'
import { useDownloadBytes, useSelectedDownloads } from '@/components/YoutubeRows'

function SpaceWarning({ required }: { required: number }) {
    const disk = useStore((s) => s.disk)
    const warningGb = useStore((s) => s.settings?.spaceWarningGb ?? 10)
    const forceApply = useStore((s) => s.forceApply)
    const setForceApply = useStore((s) => s.setForceApply)

    if (!disk || required === 0) return null
    const level = getSpaceLevel(required, disk.free, warningGb)
    if (level === 'ok') return null

    const remaining = disk.free - required

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm',
                level === 'insufficient'
                    ? 'border-destructive/50 bg-destructive/10 text-destructive'
                    : 'border-warning/40 bg-warning/10 text-warning'
            )}
        >
            {level === 'insufficient' ? <XCircle className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}
            <div className="flex-1">
                {level === 'insufficient' ? (
                    <>
                        <strong>Nicht genug Speicherplatz.</strong> Benötigt werden ca. {formatBytes(required)}, frei sind nur{' '}
                        {formatBytes(disk.free)}.
                    </>
                ) : (
                    <>
                        <strong>Speicherplatz wird knapp.</strong> Nach dem Export bleiben nur ca. {formatBytes(Math.max(0, remaining))}{' '}
                        frei (Warnschwelle {warningGb} GB).
                    </>
                )}
            </div>
            {level === 'insufficient' && (
                <Label className="shrink-0 cursor-pointer font-normal text-foreground">
                    <Checkbox checked={forceApply} onCheckedChange={(checked) => setForceApply(checked === true)} />
                    Trotzdem anwenden
                </Label>
            )}
        </div>
    )
}

/** Fortschritt der YouTube-Downloads vor der Verarbeitung */
function DownloadProgress() {
    const items = useYtStore((s) => s.items)
    const runKeys = useYtStore((s) => s.runKeys)
    const startedAt = useYtStore((s) => s.startedAt)
    const phase = useYtStore((s) => s.phase)
    const run = runKeys.map((key) => items[key]).filter(Boolean)
    const finished = run.filter((item) => !isActive(item))
    const errors = run.filter((item) => item.status === 'error').length
    const target =
        run.length > 0 ? run.reduce((sum, item) => sum + (isActive(item) ? (item.progress?.fraction ?? 0) : 1), 0) / run.length : 0
    const { value: fraction, etaSec } = useSmoothProgress(target, startedAt)

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">
                    {phase === 'analyze' ? (
                        'Downloads fertig, Dateien werden analysiert …'
                    ) : (
                        <>
                            Herunterladen: {finished.length}/{run.length} fertig
                            <span className="text-muted-foreground">
                                {' '}
                                · {run.filter((item) => item.status === 'running').length} lädt
                                {errors > 0 && <span className="text-destructive"> · {errors} Fehler</span>} · danach Verarbeitung
                            </span>
                        </>
                    )}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                    {etaSec !== null && phase === 'download' && `noch ca. ${formatDuration(etaSec)} · `}
                    {Math.floor(fraction * 100)}%
                </span>
            </div>
            <Progress value={fraction * 100} indicatorClassName="transition-none" />
        </div>
    )
}

function RunProgress() {
    const run = useStore((s) => s.run)
    const active = Object.values(run.active)

    // Analyse und Schreiben zählen beide, große Dateien entsprechend ihrer Größe mehr
    const inProgress = active.reduce((sum, progress) => sum + progress.fraction * (run.weights[progress.fileId] ?? 0), 0)
    const target = run.totalWeight > 0 ? Math.min(1, (run.doneWeight + inProgress) / run.totalWeight) : 0
    const { value: fraction, etaSec } = useSmoothProgress(target, run.startedAt)
    const analyzing = active.filter((progress) => progress.phase === 'analyze').length

    if (run.total === 0) {
        return (
            <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Starte …
            </div>
        )
    }

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">
                    {run.cancelling ? (
                        'Wird abgebrochen …'
                    ) : (
                        <>
                            {run.done}/{run.total} fertig
                            <span className="text-muted-foreground">
                                {' '}
                                · {active.length} in Arbeit{analyzing > 0 && ` (${analyzing}× Peak-Analyse)`}
                            </span>
                        </>
                    )}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                    {etaSec !== null && `noch ca. ${formatDuration(etaSec)} · `}gesamt {Math.floor(fraction * 100)}%
                </span>
            </div>
            {/* Der Wert wird schon pro Frame geglättet, eine CSS-Transition würde nur nachziehen */}
            <Progress value={fraction * 100} indicatorClassName="transition-none" />
        </div>
    )
}

export function ApplyBar({ derived, artworkJobs }: { derived: Derived; artworkJobs: ArtworkJob[] }) {
    const settings = useStore((s) => s.settings)
    const ffmpeg = useStore((s) => s.ffmpeg)
    const disk = useStore((s) => s.disk)
    const run = useStore((s) => s.run)
    const forceApply = useStore((s) => s.forceApply)
    const { apply, cancel } = useStore.getState()
    const youtube = settings?.mode === 'youtube'
    const ytPhase = useYtStore((s) => s.phase)
    const ytStatus = useYtStore((s) => s.status)
    const selectedDownloads = useSelectedDownloads()
    const downloads = youtube ? selectedDownloads : 0
    const downloadSpace = useDownloadBytes()
    const { jobs, pendingAnalysis } = derived
    // Dateien aus dem Input plus die ausgewählten YouTube-Videos (Download und Ergebnis)
    const requiredBytes = derived.requiredBytes + (youtube ? downloadSpace.bytes : 0)
    const unknownSizes = youtube ? downloadSpace.unknown : 0
    // Bilder fehlender Folgen sind Vorschaubilder, sie hängen daher an „Vorschaubild speichern“
    const imageJobs = [
        ...(settings?.pipeline.saveArtwork ? artworkJobs : []),
        ...(settings?.pipeline.saveThumbnails ? derived.missingJobs : [])
    ]

    const insufficient = !!disk && requiredBytes > disk.free
    const ffmpegMissing = !!ffmpeg && (!ffmpeg.ffmpeg || !ffmpeg.ffprobe)

    // Nach den Downloads (und deren Analyse) geht es in einem Rutsch mit der Verarbeitung weiter
    const latest = useRef({ jobs, imageJobs })
    latest.current = { jobs, imageJobs }
    useEffect(() => {
        if (ytPhase !== 'analyze' || pendingAnalysis > 0) return
        const yt = useYtStore.getState()
        yt.markProcessing()
        void (async () => {
            if (latest.current.jobs.length > 0) await apply(latest.current.jobs, latest.current.imageJobs)
            await yt.finish()
        })()
    }, [ytPhase, pendingAnalysis, apply])

    const downloading = ytPhase === 'download' || ytPhase === 'analyze'
    const busy = run.running || ytPhase !== 'idle'

    let blocker: string | null = null
    if (!settings?.outputDir) blocker = 'Kein Output-Ordner gewählt'
    else if (ffmpegMissing) blocker = 'ffmpeg/ffprobe nicht gefunden'
    else if (downloads > 0 && ytStatus?.state === 'error') blocker = 'yt-dlp nicht verfügbar'
    else if (pendingAnalysis > 0 && downloads === 0) blocker = 'Analyse läuft noch …'
    else if (jobs.length === 0 && downloads === 0) blocker = 'Keine Dateien zum Verarbeiten'
    else if (insufficient && !forceApply) blocker = 'Nicht genug Speicherplatz'

    const { summary } = run

    return (
        <div className="flex flex-col gap-2">
            {!busy && <SpaceWarning required={requiredBytes} />}

            <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
                {downloading ? (
                    <DownloadProgress />
                ) : busy ? (
                    <RunProgress />
                ) : (
                    <div className="flex flex-1 items-center gap-5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <HardDrive className="size-4" />
                            Benötigt ca. <span className="text-foreground tabular-nums">{formatBytes(requiredBytes)}</span>
                            {unknownSizes > 0 && (
                                <span className="text-xs" title="Formate dieser Videos noch nicht gelesen, ihre Größe fehlt in der Summe">
                                    (+{unknownSizes} ohne Größe)
                                </span>
                            )}
                            {disk && (
                                <>
                                    {' '}
                                    · frei <span className="text-foreground tabular-nums">{formatBytes(disk.free)}</span>
                                    {disk.total > 0 && <span className="text-xs">(von {(disk.total / GB).toFixed(0)} GB)</span>}
                                </>
                            )}
                        </span>
                        {summary && (
                            <span>
                                Letzter Lauf: <span className="text-success">{summary.ok} fertig</span>
                                {summary.skipped > 0 && <span className="text-warning"> · {summary.skipped} übersprungen</span>}
                                {summary.error > 0 && <span className="text-destructive"> · {summary.error} Fehler</span>}
                                {summary.cancelled > 0 && <span> · {summary.cancelled} abgebrochen</span>}
                                {summary.artwork && (
                                    <span
                                        className={summary.artwork.every((result) => result.ok) ? undefined : 'text-destructive'}
                                        title={summary.artwork
                                            .filter((result) => !result.ok)
                                            .map((result) => `${result.fileName}: ${result.message}`)
                                            .join('\n')}
                                    >
                                        {' '}
                                        · {summary.artwork.filter((result) => result.ok).length}/{summary.artwork.length} Bilder
                                    </span>
                                )}
                            </span>
                        )}
                        {blocker && <span className="ml-auto text-xs">{blocker}</span>}
                    </div>
                )}

                {downloading ? (
                    <Button variant="destructive" onClick={() => void useYtStore.getState().cancel()}>
                        <Square className="size-3.5 fill-current" />
                        Abbrechen
                    </Button>
                ) : busy ? (
                    <Button variant="destructive" onClick={cancel} disabled={run.cancelling || !run.running}>
                        <Square className="size-3.5 fill-current" />
                        Abbrechen
                    </Button>
                ) : (
                    <Button
                        size="lg"
                        onClick={() => (downloads > 0 ? useYtStore.getState().start() : apply(jobs, imageJobs))}
                        disabled={!!blocker}
                        title={
                            downloads > 0 ? 'Lädt die ausgewählten Videos herunter und verarbeitet danach alles in einem Rutsch' : undefined
                        }
                    >
                        <Play className="fill-current" />
                        Anwenden{jobs.length + downloads > 0 && ` (${jobs.length + downloads})`}
                    </Button>
                )}
            </div>
        </div>
    )
}
