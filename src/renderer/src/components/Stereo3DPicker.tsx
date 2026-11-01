import { ChevronDown, Loader2, ScanEye } from 'lucide-react'
import { STEREO_FORMATS, type Stereo3D } from '@shared/stereo3d'
import { Button } from '@/components/ui/button'
import type { StereoInfo } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const percent = (value: number) => value.toFixed(2).replace('.', ',')

/** Ergebnis der Inhaltserkennung als kurzer Text */
export function describeContent(stereo: StereoInfo): string | null {
    const { content } = stereo
    if (!content) return null
    if (content.status === 'running') return '3D-Format wird am Bildinhalt geprüft …'
    if (content.status === 'error') return `Inhaltserkennung fehlgeschlagen: ${content.error}`
    const { sbs, tab, layout } = content.result
    const verdict = layout === 'sbs' ? 'Side-by-Side' : layout === 'tab' ? 'Over-Under' : 'nicht eindeutig'
    return `Inhaltsanalyse: SSIM links/rechts ${percent(sbs)} · oben/unten ${percent(tab)} → ${verdict}`
}

/** Woher das erkannte Format stammt, für den Tooltip */
function sourceHint(stereo: StereoInfo): string {
    if (stereo.manual) return 'Manuell gewähltes 3D-Format\nRechtsklick: zurück auf die Erkennung'
    if (stereo.source === 'name') return 'Aus Datei- bzw. Ordnernamen erkannt'
    if (stereo.source === 'file')
        return stereo.detected === 'MVC' ? 'MVC-Spur in der Datei gefunden' : 'Aus der Datei erkannt (stereo_mode)'
    if (stereo.source === 'content') return describeContent(stereo) ?? 'Am Bildinhalt erkannt'
    return 'Kein 3D erkannt'
}

/** Auswahl des 3D-Formats pro Datei; vorbelegt aus Name, Datei oder Bildinhalt, Rechtsklick setzt darauf zurück */
export function Stereo3DPicker({ fileId, stereo, disabled }: { fileId: string; stereo: StereoInfo; disabled: boolean }) {
    const setStereo3D = useStore((s) => s.setStereo3D)
    const running = useStore((s) => s.run.running)
    const auto = stereo.detected ?? 'none'
    const checking = stereo.content?.status === 'running' && !stereo.manual

    const onChange = (value: Stereo3D | 'none') => setStereo3D(fileId, value === auto ? undefined : value)

    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative min-w-0">
                <select
                    value={stereo.format ?? 'none'}
                    onChange={(event) => onChange(event.target.value as Stereo3D | 'none')}
                    onContextMenu={(event) => {
                        event.preventDefault()
                        if (!disabled && !running) setStereo3D(fileId, undefined)
                    }}
                    disabled={disabled || running}
                    className={cn(
                        'h-6 max-w-full appearance-none truncate rounded border bg-transparent pr-6 pl-2 text-xs outline-none disabled:opacity-50 [&>option]:bg-popover',
                        stereo.manual
                            ? 'border-warning/50 text-warning'
                            : stereo.format
                              ? 'border-primary/50 text-primary'
                              : 'border-dashed border-input text-muted-foreground/70'
                    )}
                    title={`${sourceHint(stereo)}\nLandet als „3D.<Format>“ im Namen und als stereo_mode in der MKV`}
                >
                    <option value="none">Kein 3D</option>
                    {STEREO_FORMATS.map(({ format, label }) => (
                        <option key={format} value={format}>
                            3D · {format} ({label})
                        </option>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            {stereo.manual && <span className="shrink-0 text-[10px] text-warning">manuell</span>}
            {checking && (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    3D-Format wird geprüft …
                </span>
            )}
            {!checking && !stereo.manual && stereo.detectedIs3D && !stereo.detected && (
                <span className="shrink-0 text-[10px] text-warning" title={describeContent(stereo) ?? undefined}>
                    3D-Format nicht erkannt
                </span>
            )}
            {stereo.warning && (
                <span className="min-w-0 truncate text-[10px] text-warning" title={stereo.warning}>
                    {stereo.warning}
                </span>
            )}
        </div>
    )
}

/** Knopf in der Spurübersicht: Anordnung am Bildinhalt prüfen, für jede Datei */
export function StereoContentButton({
    file,
    stereo
}: {
    file: { inputPath: string; size: number; durationSec: number }
    stereo: StereoInfo
}) {
    const detect = useStore((s) => s.detectStereoContent)
    const running = useStore((s) => s.run.running)
    const busy = stereo.content?.status === 'running'
    // Ein Ergebnis bleibt gemerkt; nach einem Fehler lässt sich neu prüfen
    const done = stereo.content?.status === 'done'
    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={busy || done || running}
            onClick={() => void detect(file, true)}
            title="Vergleicht in sechs Frames die linke mit der rechten und die obere mit der unteren Bildhälfte"
        >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ScanEye className="size-3.5" />}
            Inhalt prüfen
        </Button>
    )
}

/** Kleiner Chip „3D · HTAB“ in der Quellzeile */
export function Stereo3DChip({ stereo }: { stereo: StereoInfo }) {
    if (!stereo.format) return null
    return (
        <span
            className={cn(
                'shrink-0 rounded px-1.5 py-px text-[10px] font-medium',
                stereo.manual ? 'bg-warning/15 text-warning' : stereo.warning ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'
            )}
            title={[STEREO_FORMATS.find((entry) => entry.format === stereo.format)?.label, sourceHint(stereo), stereo.warning]
                .filter(Boolean)
                .join('\n')}
        >
            3D · {stereo.format}
        </span>
    )
}
