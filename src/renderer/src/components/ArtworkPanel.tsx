import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, ImageOff, Loader2, XCircle } from 'lucide-react'
import {
    BASE_SLOTS,
    isSlotEnabled,
    seasonLabel,
    seasonSlot,
    selectedUrl,
    slotCandidates,
    slotKind,
    slotOverlays,
    slotSeason,
    sortSeasons,
    type ArtworkSlot
} from '@shared/artwork'
import { OVERLAYS, overlayFiles, sameOverlays, toggleOverlay, type OverlayId } from '@shared/overlays'
import type { ArtworkCandidate, ArtworkJob } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { overlayUrl, useImageSize, type ArtworkPlan } from '@/lib/artwork'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ImagePickerDialog, type PickerShape } from './ImagePickerDialog'

const SOURCE_LABEL: Record<ArtworkCandidate['source'], string> = { tmdb: 'TMDB', fanart: 'Fanart.tv' }

const SHAPE_CLASS: Record<PickerShape, string> = {
    poster: 'aspect-[2/3]',
    landscape: 'aspect-video',
    logo: 'aspect-[5/2]'
}

const shapeOf = (slot: ArtworkSlot): PickerShape => {
    const kind = slotKind(slot)
    return kind === 'poster' ? 'poster' : kind === 'logo' ? 'logo' : 'landscape'
}

/** Quelle und Sprache; die Größe kommt getrennt dazu, weil sie bei Fanart.tv erst nach dem Laden feststeht */
function candidateBadges(candidate: ArtworkCandidate): string[] {
    const badges = [SOURCE_LABEL[candidate.source], candidate.lang ? candidate.lang.toUpperCase() : 'ohne Text']
    return candidate.fromBackdrop ? [...badges, 'Backdrop'] : badges
}

const toPickerImage = (candidate: ArtworkCandidate) => ({
    id: candidate.url,
    previewUrl: candidate.previewUrl,
    badges: candidateBadges(candidate),
    width: candidate.width,
    height: candidate.height,
    // Fanart.tv liefert keine Größe; dort ist die Vorschau das Original und wird ausgemessen
    measure: candidate.previewUrl === candidate.url
})

/** Die gewählten Overlays über einem Poster, so wie sie beim Export (gestreckt auf 600×900) darüberliegen */
function OverlayStack({ overlays }: { overlays: OverlayId[] }) {
    return overlayFiles(overlays).map((file) => (
        <img key={file} src={overlayUrl(file)} alt="" className="pointer-events-none absolute inset-0 size-full object-fill" />
    ))
}

function OverlayChips({
    value,
    onChange,
    onReset,
    resetHint,
    disabled
}: {
    value: OverlayId[]
    onChange: (overlays: OverlayId[]) => void
    onReset: () => void
    resetHint: string
    disabled: boolean
}) {
    return (
        <div
            className="flex flex-wrap gap-1"
            onContextMenu={(event) => {
                event.preventDefault()
                if (!disabled) onReset()
            }}
            title={resetHint}
        >
            {OVERLAYS.map((overlay) => {
                const active = value.includes(overlay.id)
                return (
                    <button
                        key={overlay.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(toggleOverlay(value, overlay.id))}
                        title={`Overlay ${overlay.position}`}
                        className={cn(
                            'rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                            active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {overlay.label}
                    </button>
                )
            })}
        </div>
    )
}

function SlotCard({ slot, label, plan, className }: { slot: ArtworkSlot; label: string; plan: ArtworkPlan; className?: string }) {
    const candidates = useStore((s) => s.artwork.candidates)
    const loading = useStore((s) => s.artwork.loading)
    const manual = useStore((s) => slot in s.artworkSelection)
    const running = useStore((s) => s.run.running)
    const hasFanartKey = useStore((s) => !!s.settings?.fanartApiKey.trim())
    const { setArtwork, setArtworkEnabled, setCoverOverlays, setSeasonOverlays } = useStore.getState()
    const [pickerOpen, setPickerOpen] = useState(false)

    const list = slotCandidates(candidates, slot)
    const url = selectedUrl(plan.input, slot)
    const current = list.find((candidate) => candidate.url === url) ?? null
    const shape = shapeOf(slot)
    const season = slotSeason(slot)
    const overlays = slotOverlays(plan.input, slot)
    const isPoster = shape === 'poster'
    const enabled = isSlotEnabled(plan.input, slot)
    const size = useImageSize(current && current.previewUrl === current.url ? current.url : null, current?.width, current?.height)

    // Das Cover ist aus den Dateinamen vorbelegt, Staffelposter haben standardmäßig keine Overlays
    const changeOverlays = (next: OverlayId[]) => {
        if (season === null) setCoverOverlays(sameOverlays(next, plan.autoOverlays) ? null : next)
        else setSeasonOverlays(season, next)
    }

    return (
        <div className={cn('flex flex-col gap-2', !enabled && 'opacity-50', className)}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                    checked={enabled && !!url}
                    disabled={!url || running}
                    onCheckedChange={(checked) => setArtworkEnabled(slot, checked === true)}
                    aria-label={`${label} exportieren`}
                />
                <span className="truncate font-medium">{label}</span>
                <span className="ml-auto shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                    {list.length > 0 && `${list.length} ${list.length === 1 ? 'Bild' : 'Bilder'}`}
                </span>
            </label>

            <button
                type="button"
                disabled={list.length === 0 || running}
                onClick={() => setPickerOpen(true)}
                onContextMenu={(event) => {
                    event.preventDefault()
                    if (!running) setArtwork(slot, null)
                }}
                title={list.length > 0 ? 'Klick: anderes Bild wählen · Rechtsklick: Standardbild' : undefined}
                aria-label={`${label} wählen`}
                className={cn(
                    'relative w-full overflow-hidden rounded-md bg-secondary/60 transition-opacity enabled:cursor-pointer enabled:hover:opacity-90',
                    SHAPE_CLASS[shape],
                    shape === 'logo' && 'checkerboard',
                    manual ? 'border-2 border-warning/70' : 'border'
                )}
            >
                {current ? (
                    <>
                        <img
                            src={current.previewUrl}
                            alt=""
                            className={cn(
                                'size-full',
                                shape === 'poster' ? 'object-fill' : shape === 'logo' ? 'object-contain p-3' : 'object-cover'
                            )}
                        />
                        {isPoster && <OverlayStack overlays={overlays} />}
                    </>
                ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
                        {loading ? <Loader2 className="size-4 animate-spin" /> : <ImageOff className="size-4" />}
                        {loading
                            ? 'Wird geladen …'
                            : slot === 'landscape' && !hasFanartKey
                              ? 'Nur mit Fanart.tv-Key'
                              : 'Kein Bild gefunden'}
                    </span>
                )}
            </button>

            {current && (
                <div className="flex flex-wrap gap-1">
                    {[...candidateBadges(current), ...(size ? [`${size.width}×${size.height}`] : [])].map((badge) => (
                        <span key={badge} className="rounded bg-secondary px-1.5 py-px text-[10px] text-muted-foreground">
                            {badge}
                        </span>
                    ))}
                </div>
            )}

            {isPoster && (
                <OverlayChips
                    value={overlays}
                    onChange={changeOverlays}
                    onReset={() => (season === null ? setCoverOverlays(null) : setSeasonOverlays(season, null))}
                    resetHint={
                        season === null ? 'Rechtsklick: zurück auf die Vorbelegung aus den Dateinamen' : 'Rechtsklick: keine Overlays'
                    }
                    disabled={running}
                />
            )}

            <ImagePickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                title={label}
                description={
                    isPoster
                        ? 'Das Bild wird auf 600×900 gestreckt und mit den gewählten Overlays gespeichert.'
                        : shape === 'logo'
                          ? 'Das Logo wird unverändert als PNG gespeichert.'
                          : slot === 'landscape'
                            ? 'Zuerst die Landscape-Bilder von Fanart.tv, danach die Backdrops (mit Text zuerst). Größere Bilder werden auf höchstens 1920×1080 verkleinert.'
                            : 'Größere Bilder werden auf höchstens 1920×1080 verkleinert.'
                }
                images={list.map(toPickerImage)}
                selectedId={url}
                onSelect={(id) => setArtwork(slot, id === list[0]?.url ? null : id)}
                shape={shape}
                overlay={isPoster ? <OverlayStack overlays={overlays} /> : undefined}
            />
        </div>
    )
}

function ExportResults() {
    const results = useStore((s) => s.artwork.results)
    if (!results) return null
    const failed = results.filter((result) => !result.ok)
    if (failed.length === 0) {
        return (
            <span className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3.5" />
                {results.length} {results.length === 1 ? 'Bild' : 'Bilder'} gespeichert
            </span>
        )
    }
    return (
        <span
            className="flex items-center gap-1.5 text-xs text-destructive"
            title={failed.map((result) => `${result.fileName}: ${result.message}`).join('\n')}
        >
            <XCircle className="size-3.5" />
            {failed.length} von {results.length} fehlgeschlagen
        </span>
    )
}

/** Bilder-Tab: Cover, Logo, Backdrop, Landscape und Staffelposter wählen und exportieren */
export function ArtworkPanel({ plan, missingJobs }: { plan: ArtworkPlan; missingJobs: ArtworkJob[] }) {
    const tmdb = useStore((s) => s.tmdb)
    const artwork = useStore((s) => s.artwork)
    const hasFanartKey = useStore((s) => !!s.settings?.fanartApiKey.trim())
    const outputDir = useStore((s) => s.settings?.outputDir)
    const running = useStore((s) => s.run.running)
    const exportArtwork = useStore((s) => s.exportArtwork)
    // Dazu die s/w-Bilder der angehakten fehlenden Folgen aus der Dateiliste
    const exportJobs = [...plan.jobs, ...missingJobs]
    const target = tmdb.show ?? tmdb.movie

    if (!target) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border bg-card/40 text-sm text-muted-foreground">
                Zuerst eine Serie oder einen Film bei TMDB zuordnen
            </div>
        )
    }

    const seasons = sortSeasons(plan.input.seasons)

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card/40">
            <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
                <span className="text-sm font-medium">
                    Bilder für {target.name}
                    {target.year && <span className="text-muted-foreground"> ({target.year})</span>}
                </span>
                {artwork.loading && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Vorschläge werden geladen …
                    </span>
                )}
                {artwork.error && <span className="text-xs text-destructive">{artwork.error}</span>}
                {artwork.warnings.map((warning) => (
                    <span key={warning} className="flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="size-3.5" />
                        {warning}
                    </span>
                ))}
                {!hasFanartKey && (
                    <span className="text-xs text-muted-foreground">
                        Nur TMDB; für mehr Bilder und Landscape einen Fanart.tv-Key in den Einstellungen eintragen
                    </span>
                )}

                <div className="ml-auto flex items-center gap-3">
                    <ExportResults />
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => exportArtwork(exportJobs)}
                        disabled={!outputDir || running || artwork.exporting || exportJobs.length === 0}
                        title={
                            outputDir
                                ? `Nach ${outputDir}` +
                                  (missingJobs.length > 0
                                      ? `\ninklusive ${missingJobs.length} Bild(er) fehlender Folgen (schwarz-weiß)`
                                      : '')
                                : 'Kein Output-Ordner gewählt'
                        }
                    >
                        {artwork.exporting ? <Loader2 className="animate-spin" /> : <Download />}
                        Nur Bilder exportieren{exportJobs.length > 0 && ` (${exportJobs.length})`}
                    </Button>
                </div>
            </div>

            <div className="flex flex-col gap-6 overflow-y-auto p-4">
                <div className="flex flex-wrap items-start gap-5">
                    {BASE_SLOTS.map(({ slot, label }) => (
                        <SlotCard
                            key={slot}
                            slot={slot}
                            label={label}
                            plan={plan}
                            className={slot === 'poster' ? 'w-[200px]' : slot === 'logo' ? 'w-[260px]' : 'w-[340px]'}
                        />
                    ))}
                </div>

                {seasons.length > 0 && (
                    <div className="flex flex-col gap-3">
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Staffelposter</span>
                        <div className="flex flex-wrap items-start gap-5">
                            {seasons.map((season) => (
                                <SlotCard
                                    key={season}
                                    slot={seasonSlot(season)}
                                    label={seasonLabel(season)}
                                    plan={plan}
                                    className="w-[170px]"
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
