import type { ReactNode } from 'react'
import { AudioLines, Captions, FileText, Film, Sparkles } from 'lucide-react'
import { getAudioTrackName, getAudioType } from '@shared/audio-names'
import { subtitleTrackId } from '@shared/external-subs'
import { normalizeLanguage } from '@shared/languages'
import {
    autoSubtitleType,
    getSubtitleFormat,
    resolveSubtitleType,
    SUBTITLE_TYPES,
    type ResolvedSubtitleType,
    type TrackPlan
} from '@shared/pipeline'
import type { FileAnalysis, SubtitleTrackInfo, SubtitleType } from '@shared/types'
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

const TYPE_LABELS: Record<SubtitleType, string> = { normal: 'Normal', forced: 'Forced', sdh: 'SDH', cc: 'CC' }

/** Erklärung für den Tooltip, woher der Typ kommt */
function typeHint(track: SubtitleTrackInfo, resolved: ResolvedSubtitleType, auto: ResolvedSubtitleType): string {
    if (resolved.source === 'override') return `Manuell überschrieben (automatisch: ${TYPE_LABELS[auto.type]})`
    if (resolved.source === 'detected') {
        const byFilename = (resolved.type === 'forced' && track.filenameForced) || (resolved.type === 'sdh' && track.filenameSdh)
        return `Von der App erkannt: ${byFilename ? 'Hinweis im Dateinamen' : 'sehr wenige Einträge'}`
    }
    return resolved.type === 'normal' ? 'Normaler Untertitel' : `${TYPE_LABELS[resolved.type]} laut Datei (Markierung oder Titel)`
}

/** Untertitelspur der Quelle; der Typ-Chip schaltet per Klick Normal → Forced → SDH → CC durch */
function SourceSubtitleLine({
    fileId,
    track,
    durationSec,
    language,
    removed
}: {
    fileId: string
    track: SubtitleTrackInfo
    durationSec: number
    language: string
    removed: boolean
}) {
    const setTypeOverride = useStore((s) => s.setTypeOverride)
    const resolved = resolveSubtitleType(track, durationSec)
    const auto = autoSubtitleType(track, durationSec)
    const perMinute = track.eventCount !== null && durationSec > 0 ? track.eventCount / (durationSec / 60) : null

    // Nächster Typ; landet man wieder beim automatischen, wird die manuelle Wahl entfernt
    const cycle = () => {
        const next = SUBTITLE_TYPES[(SUBTITLE_TYPES.indexOf(resolved.type) + 1) % SUBTITLE_TYPES.length]
        setTypeOverride(fileId, subtitleTrackId(track), next === auto.type ? null : next)
    }

    const hint = [
        typeHint(track, resolved, auto),
        perMinute !== null && `${track.eventCount} Einträge (${perMinute.toFixed(1).replace('.', ',')} pro Minute)`,
        'Linksklick: Typ wechseln'
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
                {[getSubtitleFormat(track).toUpperCase(), track.eventCount !== null && `${track.eventCount} Einträge`]
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
                onClick={cycle}
                title={hint}
                className={cn(
                    'ml-auto shrink-0 rounded-full border px-2 py-px text-[10px] transition-colors',
                    resolved.source === 'override' && 'border-warning/50 bg-warning/15 text-warning hover:bg-warning/25',
                    resolved.source === 'detected' && 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/25',
                    resolved.source === 'file' && 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
            >
                {TYPE_LABELS[resolved.type]}
                {resolved.source === 'override' && ' (manuell überschrieben)'}
            </button>
        </li>
    )
}

/** Aufklappbare Übersicht der Spuren: vorher (Quelle) und nachher (Ausgabe). */

export function TrackDetails({
    fileId,
    analysis,
    plan,
    peakKey
}: {
    fileId: string
    analysis: FileAnalysis
    plan: TrackPlan
    peakKey: string | null
}) {
    const unknownLanguage = useStore((s) => s.settings?.unknownLanguage ?? 'und')
    const settings = useStore((s) => s.settings)
    const peak = useStore((s) => (peakKey ? s.peaks[peakKey] : undefined))
    const peakInfo = settings && peakKey ? describePeak(peak, settings) : null
    const keptAudio = new Set(plan.audio.map((track) => track.source.index))
    const keptSubtitles = new Set(plan.subtitle.map((track) => subtitleTrackId(track.source)))

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
                            durationSec={analysis.durationSec}
                            language={normalizeLanguage(track.language, unknownLanguage)}
                            removed={!keptSubtitles.has(subtitleTrackId(track))}
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
