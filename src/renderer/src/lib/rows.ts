import { useMemo } from 'react'
import { findConflicts, type Conflict } from '@shared/conflicts'
import { subtitleTrackId } from '@shared/external-subs'
import { anchorFile, episodeKey, findEpisodeGaps, interleaveMissing, missingEpisodeStem, type TableEntry } from '@shared/missing'
import { applyNameRules } from '@shared/name-rules'
import { buildEpisodeNfo, buildMovieNfo, chooseEpisodePlot, type NfoPlot } from '@shared/nfo'
import { fileKey, peakKey, type ScanRequest, type ScanStatus } from '@shared/peak'
import { hasUncountedSubtitles, planTracks, withSubtitleCounts, type TrackPlan } from '@shared/pipeline'
import { buildTargetStem, parseFileEpisode, sourceFolders } from '@shared/rename'
import { detect3D, formatFromVideo, stereoWarning, with3DTag, withResolution, type Stereo3D } from '@shared/stereo3d'
import { estimateRequiredBytes } from '@shared/space'
import { episodeRefFromFile, findEpisode, isLocalImagePath, sanitizeTitle, tmdbImageUrl, type EpisodeRef } from '@shared/tmdb-match'
import type { ApplyFileResult, ApplyJob, ArtworkJob, FileAnalysis, SubtitleOverride, TmdbEpisode } from '@shared/types'
import { cleanYoutubeName } from '@shared/youtube'
import { useStore, type FileEntry, type StereoContentState } from './store'

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
    /** Beschreibung für die NFO (TMDB auf Deutsch oder aus den Datei-Metadaten); `null` ohne zugeordnete Episode */
    plot: NfoPlot | null
    /** Standardbild: TMDB-Bild der Episode, ohne eines (z. B. Teil 2 einer geteilten Folge) ein Standbild aus dem Video */
    defaultStillPath: string | null
    /** Hauptdatei des zugeordneten Films (bekommt den Filmnamen) */
    movieMain: boolean
    /** Mehrere angehakte Dateien sind derselben Folge zugeordnet */
    duplicate: boolean
    stereo: StereoInfo
    conflict: Conflict | null
    result: ApplyFileResult | undefined
}

/** 3D laut Name, Datei oder Inhalt bzw. manueller Wahl */
export interface StereoInfo {
    /** Name oder Datei sagen 3D (auch ohne erkennbares Format) */
    detectedIs3D: boolean
    detected: Stereo3D | null
    /** Woher `detected` stammt */
    source: 'name' | 'file' | 'content' | null
    /** Gilt für Name und `stereo_mode` */
    format: Stereo3D | null
    manual: boolean
    /** Format passt nicht zur Datei (Auflösung, MVC) */
    warning: string | null
    content: StereoContentState | undefined
    /** Inhaltserkennung läuft automatisch: 3D im Namen, aber weder Name noch Datei verraten das Format */
    needsContent: boolean
}

/** Format nach Rangfolge: Name, Datei (`stereo_mode`, MVC), Inhaltserkennung */
function resolveStereo(
    entry: FileEntry,
    override: Stereo3D | 'none' | undefined,
    content: StereoContentState | undefined,
    youtube: boolean
): StereoInfo {
    const fromName = detect3D(entry.file.name, sourceFolders(entry.file))
    const video = entry.analysis?.video[0]
    const fromFile = formatFromVideo(video)
    const layout = content?.status === 'done' ? content.result.layout : null
    const fromContent = layout ? withResolution(layout, video) : null
    const [detected, source] = fromName.format
        ? [fromName.format, 'name' as const]
        : fromFile
          ? [fromFile, 'file' as const]
          : fromContent
            ? [fromContent, 'content' as const]
            : [null, null]
    const format = youtube ? null : override !== undefined ? (override === 'none' ? null : override) : detected
    return {
        detectedIs3D: fromName.is3D || !!fromFile,
        detected,
        source,
        format,
        manual: override !== undefined,
        warning: stereoWarning(format, video),
        content,
        needsContent: !youtube && fromName.is3D && !fromName.format && !fromFile && override === undefined && !!entry.analysis
    }
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
    /** Dateien, deren Folge kein TMDB-Bild hat: Standbilder aus dem Video ziehen */
    frameRequests: { inputPath: string; size: number; durationSec: number }[]
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
    const activeRuleSetId = useStore((s) => s.activeRuleSetId)
    const stereoOverrides = useStore((s) => s.stereoOverrides)
    const stereoContent = useStore((s) => s.stereoContent)
    const typeOverrides = useStore((s) => s.typeOverrides)
    const outputNames = useStore((s) => s.outputNames)
    const results = useStore((s) => s.run.results)
    const subtitleCounts = useStore((s) => s.subtitleCounts)
    const scanStatus = useStore((s) => s.scanStatus)
    const showEpisodes = useStore((s) => s.tmdb.episodes)
    const episodeOverrides = useStore((s) => s.episodeOverrides)
    const stillOverrides = useStore((s) => s.stillOverrides)
    const videoFrames = useStore((s) => s.videoFrames)
    const missingSelected = useStore((s) => s.missingSelected)
    const missingStills = useStore((s) => s.missingStills)
    const assignedMovie = useStore((s) => s.tmdb.movie)
    const assignedShow = useStore((s) => s.tmdb.show)
    const genres = useStore((s) => s.tmdb.genres)

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
                frameRequests: [],
                scanProgress: { done: 0, total: 0 },
                activeCount: 0,
                pendingAnalysis: 0,
                conflictCount: 0,
                requiredBytes: 0
            }
        }

        // Im YouTube-Modus spielt die TMDB-Zuordnung keine Rolle
        const youtube = settings.mode === 'youtube'
        const tmdbEpisodes = youtube ? [] : showEpisodes
        const movie = youtube ? null : assignedMovie
        const nameSteps = settings.nameRuleSets.find((set) => set.id === activeRuleSetId)?.steps ?? []

        // Bei einem Film bekommt nur die größte Datei ohne Episodenangabe den Filmnamen, Extras behalten ihren
        const movieMainId = movie
            ? files
                  .filter((entry) => !excluded[entry.file.id] && !parseFileEpisode(entry.file))
                  .reduce<FileEntry | null>((largest, entry) => (!largest || entry.file.size > largest.file.size ? entry : largest), null)
                  ?.file.id
            : undefined

        const base = files.map((entry) => {
            const movieMain = entry.file.id === movieMainId
            const episodeManual = entry.file.id in episodeOverrides
            const ref = episodeManual ? episodeOverrides[entry.file.id] : episodeRefFromFile(entry.file)
            const episode = tmdbEpisodes.length > 0 ? findEpisode(tmdbEpisodes, ref) : null
            const title = episode ? sanitizeTitle(episode.title) : ''
            const movieName = movieMain && movie ? { title: sanitizeTitle(movie.name), year: movie.year } : null
            const stereo = resolveStereo(
                entry,
                stereoOverrides[entry.file.id],
                stereoContent[fileKey({ inputPath: entry.file.fullPath, size: entry.file.size })],
                youtube
            )
            // Jellyfin erkennt 3D an der Kennung am Ende, z. B. „… {source-BluRay} 3D.HTAB“
            const autoStem = !settings.pipeline.renameFile
                ? entry.file.name
                : youtube
                  ? applyNameRules(cleanYoutubeName(entry.file.name), nameSteps)
                  : with3DTag(buildTargetStem(entry.file, settings.defaultSource, title, movieName), stereo.format)
            const override = overrides[entry.file.id]
            const key = fileKey({ inputPath: entry.file.fullPath, size: entry.file.size })
            const counts = subtitleCounts[key]
            const counted = entry.analysis ? withSubtitleCounts(entry.analysis, counts) : null
            const analysis = counted ? applyTypeOverrides(counted, typeOverrides[entry.file.id]) : null
            const plan = analysis ? planTracks(analysis, settings) : null
            const frames = videoFrames[key]
            const defaultStillPath = episode
                ? (episode.stillPath ?? (frames?.status === 'done' ? (frames.frames[0]?.path ?? null) : null))
                : null
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
                stillPath: episode ? (stillOverrides[entry.file.id] ?? defaultStillPath) : null,
                stillManual: !!episode && entry.file.id in stillOverrides,
                defaultStillPath,
                plot: episode
                    ? chooseEpisodePlot(episode, entry.analysis?.tags, {
                          isPart: !!episode.part,
                          useFile: settings.pipeline.nfoFileDescription
                      })
                    : null,
                movieMain,
                stereo,
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
        /** NFO für Jellyfin: Folgen mit zugeordneter TMDB-Episode und die Hauptdatei eines Films */
        const buildNfo = (row: Row): string | null => {
            if (row.episode && assignedShow) {
                const { episode } = row
                // Nummer wie im Zielnamen (aus dem Dateinamen), ersatzweise die der zugeordneten Folge
                const ref = episodeRefFromFile(row.entry.file) ?? { season: episode.season, episode: episode.episode }
                const tmdb = episode.aired ?? episode
                return buildEpisodeNfo({
                    showTitle: assignedShow.name,
                    season: ref.season,
                    episode: ref.episode,
                    title: episode.title,
                    plot: row.plot?.text ?? '',
                    aired: episode.airDate,
                    lock: !!episode.part || ref.season !== tmdb.season || ref.episode !== tmdb.episode
                })
            }
            if (row.movieMain && movie) {
                return buildMovieNfo({
                    title: movie.name,
                    originalTitle: movie.originalName,
                    year: movie.year,
                    plot: movie.overview,
                    genres,
                    tmdbId: movie.id
                })
            }
            return null
        }
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
                // Lokale Standbilder gehen als Pfad an den Main-Prozess, TMDB-Bilder als Adresse
                thumbUrl:
                    settings.pipeline.saveThumbnails && row.stillPath
                        ? isLocalImagePath(row.stillPath)
                            ? row.stillPath
                            : tmdbImageUrl(row.stillPath)
                        : undefined,
                descriptionPath: row.entry.file.description?.path,
                stereo3d: row.stereo.format ?? undefined,
                nfo: settings.pipeline.saveNfo && !youtube ? (buildNfo(row) ?? undefined) : undefined,
                ...(youtube && { imagePath: row.entry.file.image ?? undefined, copySidecars: true })
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
            frameRequests: rows
                .filter(
                    (row) =>
                        !row.excluded &&
                        row.episode &&
                        !row.episode.stillPath &&
                        row.analysis &&
                        !videoFrames[fileKey({ inputPath: row.entry.file.fullPath, size: row.entry.file.size })]
                )
                .map((row) => ({ inputPath: row.entry.file.fullPath, size: row.entry.file.size, durationSec: row.analysis!.durationSec })),
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
        activeRuleSetId,
        stereoOverrides,
        stereoContent,
        typeOverrides,
        subtitleCounts,
        scanStatus,
        outputNames,
        results,
        showEpisodes,
        episodeOverrides,
        stillOverrides,
        videoFrames,
        missingSelected,
        missingStills,
        assignedMovie,
        assignedShow,
        genres
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
