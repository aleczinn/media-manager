import { useMemo } from 'react'
import { findConflicts, type Conflict } from '@shared/conflicts'
import { subtitleTrackId } from '@shared/external-subs'
import { fileKey, peakKey, type ScanRequest, type ScanStatus } from '@shared/peak'
import { hasUncountedSubtitles, planTracks, withSubtitleCounts, type TrackPlan } from '@shared/pipeline'
import { buildTargetStem } from '@shared/rename'
import { estimateRequiredBytes } from '@shared/space'
import { episodeRefFromName, findEpisode, sanitizeTitle, tmdbImageUrl } from '@shared/tmdb-match'
import type { ApplyFileResult, ApplyJob, FileAnalysis, SubtitleOverride, TmdbEpisode } from '@shared/types'
import { useStore, type FileEntry } from './store'

export interface Row {
    entry: FileEntry
    /** Analyse inkl. Untertitel-Zählung aus dem Hintergrund-Scan und manuell gewählter Untertiteltypen */
    analysis: FileAnalysis | null
    /** Untertitel-Einträge werden im Hintergrund noch gezählt (Forced-Erkennung vorläufig) */
    countsPending: boolean
    /** Zustand des Hintergrund-Scans dieser Datei (Peak und/oder Zählung) */
    scanStatus: ScanStatus | undefined
    excluded: boolean
    autoStem: string
    stem: string
    overridden: boolean
    plan: TrackPlan | null
    /** Schlüssel der Peak-Analyse, falls die Datei normalisiert würde */
    peakKey: string | null
    /** Zugeordnete TMDB-Episode (automatisch per SxxEyy oder manuell gewählt) */
    episode: TmdbEpisode | null
    /** Episode wurde manuell gewählt (auch „keine Zuordnung“) */
    episodeManual: boolean
    conflict: Conflict | null
    result: ApplyFileResult | undefined
}

export interface Derived {
    rows: Row[]
    /** Dateien, die beim Anwenden verarbeitet werden */
    jobs: ApplyJob[]
    /** Hintergrund-Scans (Peak und/oder Untertitel-Zählung), die schon vor dem Anwenden laufen können */
    scanRequests: ScanRequest[]
    /** Fortschritt der Hintergrund-Scans über alle aktiven Dateien */
    scanProgress: { done: number; total: number }
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
    const subtitleCounts = useStore((s) => s.subtitleCounts)
    const scanStatus = useStore((s) => s.scanStatus)
    const tmdbEpisodes = useStore((s) => s.tmdb.episodes)
    const episodeOverrides = useStore((s) => s.episodeOverrides)

    return useMemo(() => {
        if (!settings) {
            return {
                rows: [],
                jobs: [],
                scanRequests: [],
                scanProgress: { done: 0, total: 0 },
                activeCount: 0,
                pendingAnalysis: 0,
                conflictCount: 0,
                requiredBytes: 0
            }
        }

        const base = files.map((entry) => {
            const episodeManual = entry.file.id in episodeOverrides
            const ref = episodeManual ? episodeOverrides[entry.file.id] : episodeRefFromName(entry.file.name)
            const episode = tmdbEpisodes.length > 0 ? findEpisode(tmdbEpisodes, ref) : null
            const title = episode ? sanitizeTitle(episode.title) : ''
            const autoStem = settings.pipeline.renameFile ? buildTargetStem(entry.file, settings.defaultSource, title) : entry.file.name
            const override = overrides[entry.file.id]
            const key = fileKey({ inputPath: entry.file.fullPath, size: entry.file.size })
            const counts = subtitleCounts[key]
            const counted = entry.analysis ? withSubtitleCounts(entry.analysis, counts) : null
            const analysis = counted ? applyTypeOverrides(counted, typeOverrides[entry.file.id]) : null
            const plan = analysis ? planTracks(analysis, settings) : null
            return {
                entry,
                analysis,
                countsPending: !!analysis && counts === undefined && hasUncountedSubtitles(analysis),
                scanStatus: scanStatus[key],
                excluded: !!excluded[entry.file.id],
                autoStem,
                stem: override ?? autoStem,
                overridden: override !== undefined && override !== autoStem,
                plan,
                peakKey: plan?.normalize
                    ? peakKey({ inputPath: entry.file.fullPath, size: entry.file.size, trackIndex: plan.normalize.source.index })
                    : null,
                episode,
                episodeManual,
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
                analysis: row.analysis!,
                thumbUrl: settings.pipeline.saveThumbnails && row.episode?.stillPath ? tmdbImageUrl(row.episode.stillPath) : undefined
            })),
            // Auch Dateien mit Namenskonflikt vorab scannen, der Konflikt wird meist noch behoben.
            // Peak und Zählung landen pro Datei in einem gemeinsamen Lesedurchgang; Bekanntes überspringt der Main-Prozess.
            scanRequests: rows
                .filter((row) => !row.excluded && row.result?.status !== 'ok' && row.analysis && (row.countsPending || row.plan?.normalize))
                .map((row) => ({
                    inputPath: row.entry.file.fullPath,
                    size: row.entry.file.size,
                    durationSec: row.analysis!.durationSec,
                    peakTrackIndex: row.plan?.normalize?.source.index ?? null,
                    countSubtitles: row.countsPending
                })),
            scanProgress: {
                total: active.filter((row) => row.scanStatus).length,
                done: active.filter((row) => row.scanStatus === 'done' || row.scanStatus === 'error').length
            },
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
    }, [
        settings,
        files,
        excluded,
        overrides,
        typeOverrides,
        subtitleCounts,
        scanStatus,
        outputNames,
        results,
        tmdbEpisodes,
        episodeOverrides
    ])
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
