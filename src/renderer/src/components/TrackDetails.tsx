import type { ReactNode } from 'react'
import { AudioLines, Captions, Film, Sparkles } from 'lucide-react'
import { getAudioTrackName, getAudioType } from '@shared/audio-names'
import { normalizeLanguage } from '@shared/languages'
import type { TrackPlan } from '@shared/pipeline'
import type { FileAnalysis } from '@shared/types'
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

/** Aufklappbare Übersicht der Spuren: vorher (Quelle) und nachher (Ausgabe). */
export function TrackDetails({ analysis, plan, peakKey }: { analysis: FileAnalysis; plan: TrackPlan; peakKey: string | null }) {
    const unknownLanguage = useStore((s) => s.settings?.unknownLanguage ?? 'und')
    const settings = useStore((s) => s.settings)
    const peak = useStore((s) => (peakKey ? s.peaks[peakKey] : undefined))
    const peakInfo = settings && peakKey ? describePeak(peak, settings) : null
    const keptAudio = new Set(plan.audio.map((track) => track.source.index))
    const keptSubtitles = new Set(plan.subtitle.map((track) => track.source.index))

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
                        <TrackLine
                            key={track.index}
                            lang={normalizeLanguage(track.language, unknownLanguage)}
                            title={track.title}
                            meta={[track.codecId, track.forced && 'forced', track.hearingImpaired && 'SDH'].filter(Boolean).join(' · ')}
                            removed={!keptSubtitles.has(track.index)}
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
                            key={track.source.index}
                            lang={track.language}
                            title={track.title}
                            meta={track.dispositions.join(' · ') || undefined}
                        />
                    ))}
                </Section>
            </div>
        </div>
    )
}
