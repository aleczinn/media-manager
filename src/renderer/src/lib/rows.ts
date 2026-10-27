import { useMemo } from 'react'
import { findConflicts, type Conflict } from '@shared/conflicts'
import { subtitleTrackId } from '@shared/external-subs'
import { anchorFile, episodeKey, findEpisodeGaps, interleaveMissing, missingEpisodeStem, type TableEntry } from '@shared/missing'
import { fileKey, peakKey, type ScanRequest, type ScanStatus } from '@shared/peak'
import { hasUncountedSubtitles, planTracks, withSubtitleCounts, type TrackPlan } from '@shared/pipeline'
import { buildTargetStem, parseEpisode } from '@shared/rename'
import { estimateRequiredBytes } from '@shared/space'
import { episodeRefFromName, findEpisode, sanitizeTitle, tmdbImageUrl, type EpisodeRef } from '@shared/tmdb-match'
import type { ApplyFileResult, ApplyJob, ArtworkJob, FileAnalysis, SubtitleOverride, TmdbEpisode } from '@shared/types'
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
    /** Episodenbild für Anzeige und -thumb.jpg (manuell gewählt oder Standardbild der Episode) */
    stillPath: string | null
    stillManual: boolean
    /** Hauptdatei des zugeordneten Films (bekommt den Filmnamen) */
    movieMain: boolean
    /** Mehrere angehakte Dateien sind derselben Folge zugeordnet */
    duplicate: boolean
    conflict: Conflict | null
    result: ApplyFileResult | undefined
}

/** Folge einer erkannten Staffel, zu der es keine Datei gibt */
export interface MissingRow {
    /** `episodeKey` der Folge */
    key: string
    episode: TmdbEpisode
    /** Zielname wie bei den Dateien, mit Edition und Quelle der Nachbardatei */
    stem: string
    stillPath: string | null
    stillManual: boolean
    /** Angehakt: das s/w-Bild wird exportiert */
    selected: boolean
}

export interface Derived {
    rows: Row[]
    /** Fehlende Folgen (auch wenn sie ausgeblendet sind) */
    missing: MissingRow[]
    /** Mehrfach zugeordnete Folgen */
    duplicates: EpisodeRef[]
    /** Anzeigereihenfolge der Tabelle: Dateien und, falls eingeblendet, fehlende Folgen an ihrer Stelle */
    order: TableEntry[]
    /** s/w-Bilder der angehakten fehlenden Folgen */
    missingJobs: ArtworkJob[]
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
    const stillOverrides = useStore((s) => s.stillOverrides)
    const missingSelected = useStore((s) => s.missingSelected)
    const missingStills = useStore((s) => s.missingStills)
    const movie = useStore((s) => s.tmdb.movie)

    return useMemo(() => {
        if (!settings) {
            return {
                rows: [],
                missing: [],
                duplicates: [],
                order: [],
                missingJobs: [],
                jobs: [],
                scanRequests: [],
                scanProgress: { done: 0, total: 0 },
                activeCount: 0,
                pendingAnalysis: 0,
                conflictCount: 0,
                requiredBytes: 0
            }
        }

        // Bei einem Film bekommt nur die größte Datei ohne Episodenangabe den Filmnamen, Extras behalten ihren
        const movieMainId = movie
            ? files
                  .filter((entry) => !excluded[entry.file.id] && !parseEpisode(entry.file.name))
                  .reduce<FileEntry | null>((largest, entry) => (!largest || entry.file.size > largest.file.size ? entry : largest), null)
                  ?.file.id
            : undefined

        const base = files.map((entry) => {
            const movieMain = entry.file.id === movieMainId
            const episodeManual = entry.file.id in episodeOverrides
            const ref = episodeManual ? episodeOverrides[entry.file.id] : episodeRefFromName(entry.file.name)
            const episode = tmdbEpisodes.length > 0 ? findEpisode(tmdbEpisodes, ref) : null
            const title = episode ? sanitizeTitle(episode.title) : ''
            const movieName = movieMain && movie ? { title: sanitizeTitle(movie.name), year: movie.year } : null
            const autoStem = settings.pipeline.renameFile
                ? buildTargetStem(entry.file, settings.defaultSource, title, movieName)
                : entry.file.name
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
                stillPath: episode ? (stillOverrides[entry.file.id] ?? episode.stillPath) : null,
                stillManual: !!episode && entry.file.id in stillOverrides,
                movieMain,
                result: results[entry.file.id]
            }
        })

        const active = base.filter((row) => !row.excluded && row.result?.status !== 'ok')
        const conflicts = findConflicts(
            active.map((row) => ({ id: row.entry.file.id, stem: row.stem })),
            outputNames
        )

        // Abgleich mit TMDB, nur für die Staffeln, die in den Dateien vorkommen
        const fileRefs = base.map((row) => (row.episode ? { season: row.episode.season, episode: row.episode.episode } : null))
        const gaps = findEpisodeGaps(
            tmdbEpisodes,
            base.map((row, index) => ({ ref: fileRefs[index], excluded: row.excluded }))
        )
        const duplicateKeys = new Set(gaps.duplicates.map(episodeKey))
        const missing: MissingRow[] = gaps.missing.map((episode) => {
            const key = episodeKey(episode)
            const anchor = anchorFile(fileRefs, episode)
            return {
                key,
                episode,
                stem: missingEpisodeStem(
                    episode,
                    sanitizeTitle(episode.title),
                    anchor ? base[anchor.index].entry.file : null,
                    settings.defaultSource
                ),
                stillPath: missingStills[key] ?? episode.stillPath,
                stillManual: key in missingStills,
                selected: !!missingSelected[key]
            }
        })
        const showMissing = settings.showMissingEpisodes

        const rows: Row[] = base.map((row, index) => ({
            ...row,
            duplicate: !row.excluded && !!fileRefs[index] && duplicateKeys.has(episodeKey(fileRefs[index])),
            conflict: conflicts.get(row.entry.file.id) ?? null
        }))
        const runnable = rows.filter(
            (row) => !row.excluded && row.result?.status !== 'ok' && !row.conflict && row.entry.status === 'done' && row.analysis
        )
        const externalBytes = (row: Row) =>
            settings.pipeline.mergeSubtitles ? row.entry.file.externalSubtitles.reduce((sum, sub) => sum + sub.size, 0) : 0

        return {
            rows,
            missing,
            duplicates: gaps.duplicates,
            order: showMissing
                ? interleaveMissing(
                      fileRefs,
                      missing.map((row) => row.episode)
                  )
                : rows.map((_, index) => ({ type: 'file', index })),
            missingJobs: showMissing
                ? missing
                      .filter((row) => row.selected && row.stillPath)
                      .map((row) => ({
                          fileName: `${row.stem}-thumb.jpg`,
                          url: tmdbImageUrl(row.stillPath!),
                          kind: 'missing',
                          overlays: []
                      }))
                : [],
            jobs: runnable.map((row) => ({
                fileId: row.entry.file.id,
                inputPath: row.entry.file.fullPath,
                size: row.entry.file.size,
                targetName: `${row.stem}.mkv`,
                analysis: row.analysis!,
                thumbUrl: settings.pipeline.saveThumbnails && row.stillPath ? tmdbImageUrl(row.stillPath) : undefined
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
        episodeOverrides,
        stillOverrides,
        missingSelected,
        missingStills,
        movie
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
