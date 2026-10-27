import type { ReactNode } from 'react'
import { AudioLines, Captions, FileText, Film, Sparkles } from 'lucide-react'
import { getAudioTrackName, getAudioType } from '@shared/audio-names'
import { subtitleTrackId } from '@shared/external-subs'
import { normalizeLanguage } from '@shared/languages'
import {
    autoSubtitleState,
    getSubtitleFormat,
    resolveSubtitleType,
    SUBTITLE_STATES,
    subtitleState,
    type ResolvedSubtitleType,
    type SubtitleRemovalReason,
    type TrackPlan
} from '@shared/pipeline'
import type { FileAnalysis, SubtitleOverride, SubtitleTrackInfo } from '@shared/types'
import { describePeak } from '@/lib/peak'
import { useStore } from '@/lib/store'
import { cn, formatDuration } from '@/lib/utils'

function Lang({ code }: { code: string }) {
    return (
        <span className="inline-flex w-8 shrink-0 justify-center rounded bg-secondary px-1 py-px font-mono text-[10px] text-secondary-foreground uppercase">
            {code || '—'}
        </span>
    )
}

function TrackLine({
    lang,
    title,
    meta,
    removed,
    highlight
}: {
    lang: string
    title: string
    meta?: string
    removed?: boolean
    highlight?: boolean
}) {
    return (
        <li
            className={cn(
                'flex items-center gap-2 py-0.5',
                removed && 'text-muted-foreground line-through opacity-60',
                highlight && 'text-primary'
            )}
        >
            <Lang code={lang} />
            <span className={cn('truncate', !title && 'text-muted-foreground')}>{title || 'ohne Titel'}</span>
            {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
        </li>
    )
}

function Section({ icon: Icon, label, children }: { icon: typeof Film; label: string; children: ReactNode }) {
    return (
        <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <Icon className="size-3.5" />
                {label}
            </div>
            <ul className="text-[13px]">{children}</ul>
        </div>
    )
}

const STATE_LABELS: Record<SubtitleOverride, string> = { removed: 'Entfernt', normal: 'Normal', forced: 'Forced', sdh: 'SDH', cc: 'CC' }

const REMOVAL_HINTS: Record<SubtitleRemovalReason, string> = {
    manual: 'Manuell entfernt',
    external: 'Entfernt: Externe Untertitel sind ausgeschaltet',
    language: 'Entfernt: Sprache steht nicht in der Sprachliste',
    duplicate: 'Entfernt: Duplikat, eine bevorzugte Spur gleicher Sprache und Art ist vorhanden'
}

/** Erklärung für den Tooltip, woher der Typ kommt */
function typeHint(track: SubtitleTrackInfo, resolved: ResolvedSubtitleType): string {
    if (resolved.source === 'detected') {
        const byFilename = (resolved.type === 'forced' && track.filenameForced) || (resolved.type === 'sdh' && track.filenameSdh)
        return `Von der App erkannt: ${byFilename ? 'Hinweis im Dateinamen' : 'sehr wenige Einträge'}`
    }
    return resolved.type === 'normal' ? 'Normaler Untertitel' : `${STATE_LABELS[resolved.type]} laut Datei (Markierung oder Titel)`
}

/** Untertitelspur der Quelle; der Chip schaltet per Klick Entfernt → Normal → Forced → SDH → CC durch */
function SourceSubtitleLine({
    fileId,
    track,
    analysis,
    plan,
    language,
    countsPending
}: {
    fileId: string
    track: SubtitleTrackInfo
    analysis: FileAnalysis
    plan: TrackPlan
    language: string
    countsPending: boolean
}) {
    const setTypeOverride = useStore((s) => s.setTypeOverride)
    const settings = useStore((s) => s.settings)
    const { durationSec } = analysis
    const id = subtitleTrackId(track)
    const state = subtitleState(plan, track, durationSec)
    const removalReason = plan.removedSubtitles[id]
    const resolved = resolveSubtitleType(track, durationSec)
    const manual = track.typeOverride !== undefined
    const removed = state === 'removed'
    const perMinute = track.eventCount !== null && durationSec > 0 ? track.eventCount / (durationSec / 60) : null
    // Eingebettete Spur, deren Einträge der Hintergrund-Scan noch zählt
    const counting = countsPending && track.inputIndex === 0 && track.eventCount === null

    // Linksklick vor (+1), Rechtsklick zurück (-1); landet man wieder beim automatischen Zustand, wird die manuelle Wahl entfernt
    const cycle = (step: 1 | -1) => {
        if (!settings) return
        const count = SUBTITLE_STATES.length
        const next = SUBTITLE_STATES[(SUBTITLE_STATES.indexOf(state) + step + count) % count]
        setTypeOverride(fileId, id, next === autoSubtitleState(analysis, track, settings) ? null : next)
    }

    const hint = [
        manual && settings
            ? `Manuell überschrieben (automatisch: ${STATE_LABELS[autoSubtitleState(analysis, track, settings)]})`
            : removalReason
              ? REMOVAL_HINTS[removalReason]
              : typeHint(track, resolved),
        perMinute !== null && `${track.eventCount} Einträge (${perMinute.toFixed(1).replace('.', ',')} pro Minute)`,
        counting && 'Einträge werden noch gezählt, die Forced-Erkennung ist vorläufig',
        'Linksklick: weiter (Entfernt → Normal → Forced → SDH → CC)',
        'Rechtsklick: zurück'
    ]
        .filter(Boolean)
        .join('\n')

    return (
        <li className={cn('flex items-center gap-2 py-0.5', removed && 'text-muted-foreground')}>
            <Lang code={language} />
            <span className={cn('truncate', removed && 'line-through opacity-60', !track.title && 'text-muted-foreground')}>
                {track.title || 'ohne Titel'}
            </span>
            <span className={cn('shrink-0 text-xs text-muted-foreground', removed && 'opacity-60')}>
                {[
                    getSubtitleFormat(track).toUpperCase(),
                    track.eventCount !== null ? `${track.eventCount} Einträge` : counting && 'zählt …'
                ]
                    .filter(Boolean)
                    .join(' · ')}
            </span>
            {track.externalPath && (
                <span
                    className="flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-px text-[10px] text-primary"
                    title={track.externalPath}
                >
                    <FileText className="size-3" />
                    extern
                </span>
            )}
            <button
                type="button"
                onClick={() => cycle(1)}
                onContextMenu={(event) => {
                    event.preventDefault()
                    cycle(-1)
                }}
                title={hint}
                className={cn(
                    'ml-auto shrink-0 rounded-full border px-2 py-px text-[10px] transition-colors',
                    manual
                        ? 'border-warning/50 bg-warning/15 text-warning hover:bg-warning/25'
                        : removed
                          ? 'border-dashed border-input text-muted-foreground/70 hover:bg-accent hover:text-foreground'
                          : resolved.source === 'detected'
                            ? 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/25'
                            : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
            >
                {STATE_LABELS[state]}
                {manual && ' (manuell überschrieben)'}
            </button>
        </li>
    )
}

/** Aufklappbare Übersicht der Spuren: vorher (Quelle) und nachher (Ausgabe). */
export function TrackDetails({
    fileId,
    analysis,
    plan,
    peakKey,
    countsPending
}: {
    fileId: string
    analysis: FileAnalysis
    plan: TrackPlan
    peakKey: string | null
    countsPending: boolean
}) {
    const unknownLanguage = useStore((s) => s.settings?.unknownLanguage ?? 'und')
    const settings = useStore((s) => s.settings)
    const peak = useStore((s) => (peakKey ? s.peaks[peakKey] : undefined))
    const peakInfo = settings && peakKey ? describePeak(peak, settings) : null
    const keptAudio = new Set(plan.audio.map((track) => track.source.index))

    const audioMeta = (track: FileAnalysis['audio'][number]) =>
        `${getAudioTrackName(getAudioType(track)) ?? track.codecId} · ${track.channels} ch`

    return (
        <div className="grid grid-cols-2 gap-6 border-t bg-black/15 px-12 py-3">
            <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-muted-foreground">Vorher · Dauer {formatDuration(analysis.durationSec)}</div>
                <Section icon={Film} label="Video">
                    {analysis.video.map((track) => (
                        <TrackLine key={track.index} lang={track.language} title={track.title} meta={track.codec} />
                    ))}
                </Section>
                <Section icon={AudioLines} label="Audio">
                    {analysis.audio.map((track) => (
                        <TrackLine
                            key={track.index}
                            lang={normalizeLanguage(track.language, unknownLanguage)}
                            title={track.title}
                            meta={audioMeta(track)}
                            removed={!keptAudio.has(track.index)}
                        />
                    ))}
                </Section>
                <Section icon={Captions} label="Untertitel">
                    {analysis.subtitle.length === 0 && <li className="text-muted-foreground">keine</li>}
                    {analysis.subtitle.map((track) => (
                        <SourceSubtitleLine
                            key={subtitleTrackId(track)}
                            fileId={fileId}
                            track={track}
                            analysis={analysis}
                            plan={plan}
                            language={normalizeLanguage(track.language, unknownLanguage)}
                            countsPending={countsPending}
                        />
                    ))}
                </Section>
            </div>

            <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-muted-foreground">Nachher</div>
                <Section icon={Film} label="Video">
                    {plan.video.map((track) => (
                        <TrackLine key={track.source.index} lang={track.source.language} title={track.title} meta={track.source.codec} />
                    ))}
                </Section>
                <Section icon={AudioLines} label="Audio">
                    {plan.normalize && (
                        <li className="flex items-center gap-2 py-0.5 text-primary">
                            <Lang code={plan.normalize.language} />
                            <Sparkles className="size-3.5 shrink-0" />
                            <span className="truncate">{plan.normalize.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">AC3 {plan.normalize.bitrate} · neu</span>
                        </li>
                    )}
                    {plan.normalize && peakInfo && (
                        <li className={cn('py-0.5 pl-10 text-xs', peakInfo.tone === 'error' ? 'text-warning' : 'text-muted-foreground')}>
                            {peakInfo.text}
                        </li>
                    )}
                    {plan.audio.map((track) => (
                        <TrackLine
                            key={track.source.index}
                            lang={track.language}
                            title={track.title}
                            meta={`${track.source.channels} ch`}
                        />
                    ))}
                    {plan.normalizeSkipReason && <li className="py-0.5 text-xs text-warning">{plan.normalizeSkipReason}</li>}
                </Section>
                <Section icon={Captions} label="Untertitel">
                    {plan.subtitle.length === 0 && <li className="text-muted-foreground">keine</li>}
                    {plan.subtitle.map((track) => (
                        <TrackLine
                            key={subtitleTrackId(track.source)}
                            lang={track.language}
                            title={track.title}
                            meta={
                                [
                                    getSubtitleFormat(track.source).toUpperCase(),
                                    track.source.externalPath && 'extern',
                                    ...track.dispositions
                                ]
                                    .filter(Boolean)
                                    .join(' · ') || undefined
                            }
                        />
                    ))}
                </Section>
            </div>
        </div>
    )
}
