import { useMemo } from 'react'
import { findConflicts, type Conflict } from '@shared/conflicts'
import { subtitleTrackId } from '@shared/external-subs'
import { peakKey, type PeakRequest } from '@shared/peak'
import { planTracks, type TrackPlan } from '@shared/pipeline'
import { buildTargetStem } from '@shared/rename'
import { estimateRequiredBytes } from '@shared/space'
import type { ApplyFileResult, ApplyJob, FileAnalysis, SubtitleOverride } from '@shared/types'
import { useStore, type FileEntry } from './store'

export interface Row {
    entry: FileEntry
    /** Analyse inkl. manuell gewählter Untertiteltypen */
    analysis: FileAnalysis | null
    excluded: boolean
    autoStem: string
    stem: string
    overridden: boolean
    plan: TrackPlan | null
    /** Schlüssel der Peak-Analyse, falls die Datei normalisiert würde */
    peakKey: string | null
    conflict: Conflict | null
    result: ApplyFileResult | undefined
}

export interface Derived {
    rows: Row[]
    /** Dateien, die beim Anwenden verarbeitet werden */
    jobs: ApplyJob[]
    /** Peak-Analysen, die schon vor dem Anwenden im Hintergrund laufen können */
    peakRequests: PeakRequest[]
    activeCount: number
    pendingAnalysis: number
    conflictCount: number
    requiredBytes: number
}

/** Leitet Zielnamen, Spurplanung, Konflikte und Jobs aus dem State ab. */
export function useDerived(): Derived {
    const settings = useStore((s) => s.settings)
    const files = useStore((s) => s.files)
    const excluded = useStore((s) => s.excluded)
    const overrides = useStore((s) => s.overrides)
    const typeOverrides = useStore((s) => s.typeOverrides)
    const outputNames = useStore((s) => s.outputNames)
    const results = useStore((s) => s.run.results)

    return useMemo(() => {
        if (!settings) {
            return { rows: [], jobs: [], peakRequests: [], activeCount: 0, pendingAnalysis: 0, conflictCount: 0, requiredBytes: 0 }
        }

        const base = files.map((entry) => {
            const autoStem = settings.pipeline.renameFile ? buildTargetStem(entry.file, settings.defaultSource) : entry.file.name
            const override = overrides[entry.file.id]
            const analysis = entry.analysis ? applyTypeOverrides(entry.analysis, typeOverrides[entry.file.id]) : null
            const plan = analysis ? planTracks(analysis, settings) : null
            return {
                entry,
                analysis,
                excluded: !!excluded[entry.file.id],
                autoStem,
                stem: override ?? autoStem,
                overridden: override !== undefined && override !== autoStem,
                plan,
                peakKey: plan?.normalize
                    ? peakKey({ inputPath: entry.file.fullPath, size: entry.file.size, trackIndex: plan.normalize.source.index })
                    : null,
                result: results[entry.file.id]
            }
        })

        const active = base.filter((row) => !row.excluded && row.result?.status !== 'ok')
        const conflicts = findConflicts(
            active.map((row) => ({ id: row.entry.file.id, stem: row.stem })),
            outputNames
        )

        const rows: Row[] = base.map((row) => ({ ...row, conflict: conflicts.get(row.entry.file.id) ?? null }))
        const runnable = rows.filter(
            (row) => !row.excluded && row.result?.status !== 'ok' && !row.conflict && row.entry.status === 'done' && row.analysis
        )
        const externalBytes = (row: Row) =>
            settings.pipeline.mergeSubtitles ? row.entry.file.externalSubtitles.reduce((sum, sub) => sum + sub.size, 0) : 0

        return {
            rows,
            jobs: runnable.map((row) => ({
                fileId: row.entry.file.id,
                inputPath: row.entry.file.fullPath,
                size: row.entry.file.size,
                targetName: `${row.stem}.mkv`,
                analysis: row.analysis!
            })),
            // Auch Dateien mit Namenskonflikt vorab analysieren, der Konflikt wird meist noch behoben
            peakRequests: rows
                .filter((row) => !row.excluded && row.result?.status !== 'ok' && row.plan?.normalize)
                .map((row) => ({
                    inputPath: row.entry.file.fullPath,
                    size: row.entry.file.size,
                    trackIndex: row.plan!.normalize!.source.index,
                    durationSec: row.analysis!.durationSec
                })),
            activeCount: active.length,
            pendingAnalysis: active.filter((row) => row.entry.status === 'pending').length,
            conflictCount: active.filter((row) => conflicts.has(row.entry.file.id)).length,
            requiredBytes: estimateRequiredBytes(
                runnable.map((row) => ({
                    size: row.entry.file.size + externalBytes(row),
                    durationSec: row.analysis!.durationSec,
                    plan: row.plan
                }))
            )
        }
    }, [settings, files, excluded, overrides, typeOverrides, outputNames, results])
}

/** Trägt die manuell gewählten Untertiteltypen in eine Kopie der Analyse ein */
function applyTypeOverrides(analysis: FileAnalysis, overrides: Record<string, SubtitleOverride> | undefined): FileAnalysis {
    if (!overrides || Object.keys(overrides).length === 0) return analysis
    return {
        ...analysis,
        subtitle: analysis.subtitle.map((track) => {
            const override = overrides[subtitleTrackId(track)]
            return override === undefined ? track : { ...track, typeOverride: override }
        })
    }
}
