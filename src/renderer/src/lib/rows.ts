import { useMemo } from 'react'
import { findConflicts, type Conflict } from '@shared/conflicts'
import { planTracks, type TrackPlan } from '@shared/pipeline'
import { buildTargetStem } from '@shared/rename'
import { estimateRequiredBytes } from '@shared/space'
import type { ApplyFileResult, ApplyJob } from '@shared/types'
import { useStore, type FileEntry } from './store'

export interface Row {
    entry: FileEntry
    excluded: boolean
    autoStem: string
    stem: string
    overridden: boolean
    plan: TrackPlan | null
    conflict: Conflict | null
    result: ApplyFileResult | undefined
}

export interface Derived {
    rows: Row[]
    /** Dateien, die beim Anwenden verarbeitet werden */
    jobs: ApplyJob[]
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
    const outputNames = useStore((s) => s.outputNames)
    const results = useStore((s) => s.run.results)

    return useMemo(() => {
        if (!settings) return { rows: [], jobs: [], activeCount: 0, pendingAnalysis: 0, conflictCount: 0, requiredBytes: 0 }

        const base = files.map((entry) => {
            const autoStem = settings.pipeline.renameFile ? buildTargetStem(entry.file, settings.defaultSource) : entry.file.name
            const override = overrides[entry.file.id]
            return {
                entry,
                excluded: !!excluded[entry.file.id],
                autoStem,
                stem: override ?? autoStem,
                overridden: override !== undefined && override !== autoStem,
                plan: entry.analysis ? planTracks(entry.analysis, settings) : null,
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
            (row) => !row.excluded && row.result?.status !== 'ok' && !row.conflict && row.entry.status === 'done' && row.entry.analysis
        )

        return {
            rows,
            jobs: runnable.map((row) => ({
                fileId: row.entry.file.id,
                inputPath: row.entry.file.fullPath,
                targetName: `${row.stem}.mkv`,
                analysis: row.entry.analysis!
            })),
            activeCount: active.length,
            pendingAnalysis: active.filter((row) => row.entry.status === 'pending').length,
            conflictCount: active.filter((row) => conflicts.has(row.entry.file.id)).length,
            requiredBytes: estimateRequiredBytes(
                runnable.map((row) => ({ size: row.entry.file.size, durationSec: row.entry.analysis!.durationSec, plan: row.plan }))
            )
        }
    }, [settings, files, excluded, overrides, outputNames, results])
}
