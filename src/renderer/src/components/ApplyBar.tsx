import { AlertTriangle, HardDrive, Loader2, Play, Square, XCircle } from 'lucide-react'
import { formatBytes, getSpaceLevel, GB } from '@shared/space'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import type { Derived } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn, formatDuration } from '@/lib/utils'

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

function RunProgress() {
    const progress = useStore((s) => s.run.progress)
    const cancelling = useStore((s) => s.run.cancelling)

    if (!progress) {
        return (
            <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Starte …
            </div>
        )
    }

    const overall = ((progress.index + progress.percent / 100) / progress.total) * 100
    const phase = progress.phase === 'analyze' ? 'Peak-Analyse' : 'Datei wird geschrieben'

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">
                    <span className="text-muted-foreground">
                        Datei {progress.index + 1}/{progress.total} ·
                    </span>{' '}
                    {cancelling ? 'Wird abgebrochen …' : `${phase} ${Math.floor(progress.percent)}%`}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                    {progress.etaSec !== null && `noch ca. ${formatDuration(progress.etaSec)} · `}gesamt {Math.floor(overall)}%
                </span>
            </div>
            <Progress value={overall} />
        </div>
    )
}

export function ApplyBar({ derived }: { derived: Derived }) {
    const settings = useStore((s) => s.settings)
    const ffmpeg = useStore((s) => s.ffmpeg)
    const disk = useStore((s) => s.disk)
    const run = useStore((s) => s.run)
    const forceApply = useStore((s) => s.forceApply)
    const { apply, cancel } = useStore.getState()
    const { jobs, requiredBytes, pendingAnalysis } = derived

    const insufficient = !!disk && requiredBytes > disk.free
    const ffmpegMissing = !!ffmpeg && (!ffmpeg.ffmpeg || !ffmpeg.ffprobe)

    let blocker: string | null = null
    if (!settings?.outputDir) blocker = 'Kein Output-Ordner gewählt'
    else if (ffmpegMissing) blocker = 'ffmpeg/ffprobe nicht gefunden'
    else if (pendingAnalysis > 0) blocker = 'Analyse läuft noch …'
    else if (jobs.length === 0) blocker = 'Keine Dateien zum Verarbeiten'
    else if (insufficient && !forceApply) blocker = 'Nicht genug Speicherplatz'

    const { summary } = run

    return (
        <div className="flex flex-col gap-2">
            {!run.running && <SpaceWarning required={requiredBytes} />}

            <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
                {run.running ? (
                    <RunProgress />
                ) : (
                    <div className="flex flex-1 items-center gap-5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <HardDrive className="size-4" />
                            Benötigt ca. <span className="text-foreground tabular-nums">{formatBytes(requiredBytes)}</span>
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
                            </span>
                        )}
                        {blocker && <span className="ml-auto text-xs">{blocker}</span>}
                    </div>
                )}

                {run.running ? (
                    <Button variant="destructive" onClick={cancel} disabled={run.cancelling}>
                        <Square className="size-3.5 fill-current" />
                        Abbrechen
                    </Button>
                ) : (
                    <Button size="lg" onClick={() => apply(jobs)} disabled={!!blocker}>
                        <Play className="fill-current" />
                        Anwenden{jobs.length > 0 && ` (${jobs.length})`}
                    </Button>
                )}
            </div>
        </div>
    )
}
