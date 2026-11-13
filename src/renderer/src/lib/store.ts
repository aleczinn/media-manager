import { create } from 'zustand'
import type { ArtworkSlot } from '@shared/artwork'
import { applyEpisodeGroup, compareEpisodes, splitEpisodes } from '@shared/episode-order'
import type { OverlayId } from '@shared/overlays'
import { analysisKey, fileKey, type PeakState, type ScanStatus } from '@shared/peak'
import type { Stereo3D } from '@shared/stereo3d'
import type { EpisodeRef } from '@shared/tmdb-match'
import type {
    ApplyFileResult,
    ApplyJob,
    ApplyProgress,
    ApplySummary,
    ArtworkCandidates,
    ArtworkJob,
    ArtworkResult,
    DiskSpace,
    FfmpegStatus,
    FileAnalysis,
    MediaFile,
    Settings,
    StereoContentResult,
    SubtitleOverride,
    TmdbDetails,
    TmdbEpisode,
    TmdbEpisodeGroup,
    TmdbMovie,
    TmdbSeasonSummary,
    TmdbImage,
    TmdbShow,
    VideoFrame
} from '@shared/types'

interface TmdbState {
    show: TmdbShow | null
    /** Zugeordneter Film (statt einer Serie, ein Film pro Lauf) */
    movie: TmdbMovie | null
    /** Staffeln und Episoden in der gewählten Reihenfolge; Episoden nach Staffel und Folge sortiert */
    seasons: TmdbSeasonSummary[]
    episodes: TmdbEpisode[]
    /** Staffeln und Episoden in Ausstrahlungsreihenfolge (Grundlage für andere Reihenfolgen und Staffelposter) */
    aired: { seasons: TmdbSeasonSummary[]; episodes: TmdbEpisode[] }
    /** Staffeln und Episoden in der gewählten Reihenfolge, noch ohne geteilte Folgen */
    ordered: { seasons: TmdbSeasonSummary[]; episodes: TmdbEpisode[] }
    /** Geteilte Folgen: Folge der Ausstrahlung (`2x8`) → Anzahl Teile */
    splits: Record<string, number>
    /** Andere Reihenfolgen der Serie (DVD, absolut, …) */
    orders: TmdbEpisodeGroup[]
    /** Gewählte Reihenfolge, `null` = Ausstrahlung */
    orderId: string | null
    orderLoading: boolean
    /** Genres laut TMDB (auf Deutsch), zum Einsortieren */
    genres: string[]
    /** Bewertung bei TMDB */
    rating: TmdbDetails['rating']
    loading: boolean
    error: string | null
}

const emptyTmdb: TmdbState = {
    show: null,
    movie: null,
    seasons: [],
    episodes: [],
    aired: { seasons: [], episodes: [] },
    ordered: { seasons: [], episodes: [] },
    splits: {},
    orders: [],
    orderId: null,
    orderLoading: false,
    genres: [],
    rating: null,
    loading: false,
    error: null
}

interface ArtworkState {
    /** Vorschläge von TMDB und Fanart.tv, `null` solange nichts geladen ist */
    candidates: ArtworkCandidates | null
    loading: boolean
    error: string | null
    /** Probleme einer einzelnen Quelle (z. B. Fanart.tv nicht erreichbar) */
    warnings: string[]
    /** Laufender bzw. letzter Export über „Nur Bilder exportieren“ */
    exporting: boolean
    results: ArtworkResult[] | null
}

const emptyArtwork: ArtworkState = { candidates: null, loading: false, error: null, warnings: [], exporting: false, results: null }

/** Alles, was an der zugeordneten Serie bzw. dem Film hängt */
const emptyMedia = {
    tmdb: emptyTmdb,
    episodeOverrides: {},
    stillOverrides: {},
    missingSelected: {},
    missingStills: {},
    artwork: emptyArtwork,
    artworkSelection: {},
    artworkEnabled: {},
    coverOverlays: null,
    seasonOverlays: {}
}

export type StillImagesState = { status: 'loading' } | { status: 'done'; images: TmdbImage[] } | { status: 'error' }

/** Schlüssel der Bildliste: Serie und Folge der Ausstrahlung (so fragt TMDB die Bilder ab) */
export const stillImagesKey = (showId: number, ref: { season: number; episode: number }) => `${showId}:${ref.season}x${ref.episode}`

export type VideoFramesState = { status: 'loading' } | { status: 'done'; frames: VideoFrame[] } | { status: 'error'; error: string }

export type StereoContentState =
    { status: 'running' } | { status: 'done'; result: StereoContentResult } | { status: 'error'; error: string }

export interface FileEntry {
    file: MediaFile
    status: 'pending' | 'done' | 'error'
    analysis?: FileAnalysis
    error?: string
    /** Vom YouTube-Link heruntergeladen (liegt im Temp-Ordner, bleibt beim erneuten Einlesen erhalten) */
    downloaded?: boolean
}

interface RunState {
    running: boolean
    cancelling: boolean
    /** Fortschritt der gerade laufenden Dateien */
    active: Record<string, ApplyProgress>
    /** Anzahl Jobs und erledigte Jobs des aktuellen Laufs */
    total: number
    done: number
    startedAt: number
    /** Gewicht pro Datei (Größe in Bytes), damit große Dateien im Gesamtfortschritt mehr zählen */
    weights: Record<string, number>
    totalWeight: number
    doneWeight: number
    results: Record<string, ApplyFileResult>
    summary: ApplySummary | null
}

interface State {
    settings: Settings | null
    ffmpeg: FfmpegStatus | null
    files: FileEntry[]
    scanning: boolean
    analyzeRequest: number
    /** Zuletzt eingelesener Input-Ordner; erneutes Einlesen desselben Ordners behält Eingaben und Zuordnung */
    scannedDir: string | null
    excluded: Record<string, boolean>
    /** Vom Nutzer bearbeitete Zielnamen (ohne .mkv) */
    overrides: Record<string, string>
    /** YouTube-Modus: Preset für die aktuellen Dateien; wird nicht gespeichert und fällt bei einem anderen Input-Ordner weg */
    activeRuleSetId: string | null
    /** Manuell gewähltes 3D-Format je Datei; `none` = bewusst kein 3D */
    stereoOverrides: Record<string, Stereo3D | 'none'>
    /** Inhaltserkennung (SSIM der Bildhälften) je Datei (`fileKey()`), bleibt bis zum Programmende */
    stereoContent: Record<string, StereoContentState>
    /** Bildliste (mit Größen) je TMDB-Episode (`stillImagesKey`), um zu kleine Standardbilder zu ersetzen */
    stillImages: Record<string, StillImagesState>
    /** Standbilder aus dem Video je Datei (`fileKey()`), Ersatz für fehlende TMDB-Bilder; bleibt bis zum Programmende */
    videoFrames: Record<string, VideoFramesState>
    /** Manuelle Untertitel-Wahl (Typ oder entfernt) je Datei und Spur (`subtitleTrackId`) */
    typeOverrides: Record<string, Record<string, SubtitleOverride>>
    expanded: Record<string, boolean>
    outputNames: string[]
    disk: DiskSpace | null
    forceApply: boolean
    /** Peak-Analysen, Schlüssel aus `peakKey()` */
    peaks: Record<string, PeakState>
    /** Einträge der eingebetteten Untertitel je Datei (`fileKey()`) aus dem Hintergrund-Scan; `null` = fehlgeschlagen */
    subtitleCounts: Record<string, number[] | null>
    /** Zustand des Hintergrund-Scans je Datei (`fileKey()`) */
    scanStatus: Record<string, ScanStatus>
    /** Zugeordnete TMDB-Serie (gilt für die laufende Sitzung) */
    tmdb: TmdbState
    /** Manuell gewählte Episode je Datei; `null` = bewusst keine Zuordnung */
    episodeOverrides: Record<string, EpisodeRef | null>
    /** Manuell gewähltes Episodenbild (TMDB-Pfad) je Datei */
    stillOverrides: Record<string, string>
    /** Angehakte fehlende Folgen (`episodeKey`), deren s/w-Bild exportiert wird; standardmäßig keine */
    missingSelected: Record<string, boolean>
    /** Manuell gewähltes Bild je fehlender Folge (`episodeKey`) */
    missingStills: Record<string, string>
    artwork: ArtworkState
    /** Manuell gewähltes Bild (URL) je Bildplatz */
    artworkSelection: Partial<Record<ArtworkSlot, string>>
    /** Manuell an- oder abgehakte Bildplätze (sonst: Serienbilder an, Staffelposter nur für vorhandene Staffeln) */
    artworkEnabled: Partial<Record<ArtworkSlot, boolean>>
    /** Overlays fürs Cover; `null` = automatisch aus den Dateinamen */
    coverOverlays: OverlayId[] | null
    /** Overlays je Staffelposter (standardmäßig keine) */
    seasonOverlays: Record<number, OverlayId[]>
    run: RunState

    init(): Promise<() => void>
    updateSettings(patch: Partial<Settings>): Promise<void>
    recheckFfmpeg(): Promise<void>
    selectInput(): Promise<void>
    selectOutput(): Promise<void>
    scan(): Promise<void>
    refreshOutput(): Promise<void>
    toggleExcluded(id: string): void
    setAllExcluded(excluded: boolean): void
    setOverride(id: string, stem: string | null): void
    setActiveRuleSet(id: string | null): void
    /** `undefined` = zurück auf die Erkennung aus dem Namen */
    setStereo3D(fileId: string, value: Stereo3D | 'none' | undefined): void
    /** Vergleicht die Bildhälften einiger Frames; `force` misst auch nach einem Fehler erneut */
    detectStereoContent(file: { inputPath: string; size: number; durationSec: number }, force?: boolean): Promise<void>
    /** Lädt die Bildliste einer Episode von TMDB (einmal je Episode; nach einem Fehler nicht erneut) */
    loadStillImages(showId: number, ref: { season: number; episode: number }): Promise<void>
    /** Zieht Standbilder aus dem Video (einmal je Datei; nach einem Fehler nur mit `force`) */
    loadFrames(file: { inputPath: string; size: number; durationSec: number }, force?: boolean): Promise<void>
    setTypeOverride(fileId: string, trackId: string, type: SubtitleOverride | null): void
    assignShow(show: TmdbShow): Promise<void>
    /** `null` = Ausstrahlungsreihenfolge; die Wahl wird je Serie gespeichert */
    setEpisodeOrder(orderId: string | null): Promise<void>
    /** Teilt eine Folge (Schlüssel der Ausstrahlung, z. B. `2x8`) in so viele Teile; 1 = nicht geteilt. Wird je Serie gespeichert */
    setEpisodeSplit(key: string, parts: number): void
    assignMovie(movie: TmdbMovie): void
    /** Entfernt Serie bzw. Film */
    clearShow(): void
    loadArtwork(): Promise<void>
    loadDetails(): Promise<void>
    /** `null` = zurück auf den ersten Vorschlag */
    setArtwork(slot: ArtworkSlot, url: string | null): void
    setArtworkEnabled(slot: ArtworkSlot, enabled: boolean): void
    /** `null` = zurück auf die Vorbelegung aus den Dateinamen */
    setCoverOverlays(overlays: OverlayId[] | null): void
    /** `null` = keine */
    setSeasonOverlays(season: number, overlays: OverlayId[] | null): void
    exportArtwork(jobs: ArtworkJob[]): Promise<void>
    /** `undefined` = zurück auf die automatische Zuordnung */
    setEpisode(fileId: string, ref: EpisodeRef | null | undefined): void
    /** `null` = zurück auf das Standardbild der Episode */
    setStill(fileId: string, path: string | null): void
    toggleMissing(key: string): void
    /** `null` = zurück auf das Standardbild der Episode */
    setMissingStill(key: string, path: string | null): void
    toggleExpanded(id: string): void
    setForceApply(force: boolean): void
    apply(jobs: ApplyJob[], artwork: ArtworkJob[]): Promise<void>
    /** Heruntergeladene Videos in die Liste aufnehmen (oben) und analysieren */
    addDownloadedFiles(files: MediaFile[]): void
    /** Heruntergeladene Einträge entfernen (nach dem Aufräumen) */
    removeDownloadedFiles(ids: string[]): void
    cancel(): Promise<void>
}

const emptyRun: RunState = {
    running: false,
    cancelling: false,
    active: {},
    total: 0,
    done: 0,
    startedAt: 0,
    weights: {},
    totalWeight: 0,
    doneWeight: 0,
    results: {},
    summary: null
}

/**
 * Ab- oder Anwählen vergisst das Ergebnis des letzten Laufs (z. B. „fertig“) und liest den Output-Ordner neu ein.
 * So greift wieder die normale Prüfung, und eine schon exportierte Datei fällt als „existiert bereits“ auf.
 */
function forgetResults(ids: string[]): void {
    const { run, refreshOutput } = useStore.getState()
    if (!ids.some((id) => id in run.results)) return
    const results = { ...run.results }
    ids.forEach((id) => delete results[id])
    useStore.setState({ run: { ...run, results } })
    void refreshOutput()
}

export const useStore = create<State>()((set, get) => ({
    settings: null,
    ffmpeg: null,
    files: [],
    scanning: false,
    analyzeRequest: 0,
    scannedDir: null,
    excluded: {},
    overrides: {},
    activeRuleSetId: null,
    stereoOverrides: {},
    stereoContent: {},
    videoFrames: {},
    stillImages: {},
    typeOverrides: {},
    expanded: {},
    outputNames: [],
    disk: null,
    forceApply: false,
    peaks: {},
    subtitleCounts: {},
    scanStatus: {},
    ...emptyMedia,
    run: emptyRun,

    async init() {
        const unsubscribers = [
            window.api.onAnalysis((event) => {
                if (event.requestId !== get().analyzeRequest) return
                set((state) => ({
                    files: state.files.map((entry) =>
                        entry.file.id !== event.fileId
                            ? entry
                            : 'analysis' in event
                              ? { ...entry, status: 'done', analysis: event.analysis }
                              : { ...entry, status: 'error', error: event.error }
                    )
                }))
            }),
            window.api.onApplyProgress((progress) =>
                set((state) => ({ run: { ...state.run, active: { ...state.run.active, [progress.fileId]: progress } } }))
            ),
            window.api.onApplyFileDone((result) =>
                set((state) => {
                    const active = { ...state.run.active }
                    delete active[result.fileId]
                    return {
                        run: {
                            ...state.run,
                            active,
                            done: state.run.done + 1,
                            doneWeight: state.run.doneWeight + (state.run.weights[result.fileId] ?? 0),
                            results: { ...state.run.results, [result.fileId]: result }
                        }
                    }
                })
            ),
            window.api.onPeakUpdate(({ key, state: peak }) => set((state) => ({ peaks: { ...state.peaks, [key]: peak } }))),
            window.api.onSubtitleCounts(({ fileKey, counts }) =>
                set((state) => ({ subtitleCounts: { ...state.subtitleCounts, [fileKey]: counts } }))
            ),
            window.api.onScanStatus(({ fileKey, status }) => set((state) => ({ scanStatus: { ...state.scanStatus, [fileKey]: status } })))
        ]

        // Bei Rückkehr ins Fenster Output-Ordner und freien Platz aktualisieren
        const onFocus = () => {
            if (!get().run.running) void get().refreshOutput()
        }
        window.addEventListener('focus', onFocus)

        // Beim Start immer im Modus Filme & Serien, YouTube wird bewusst umgeschaltet
        const settings = { ...(await window.api.getSettings()), mode: 'media' as const }
        set({ settings })
        void get().recheckFfmpeg()
        if (settings.inputDir) void get().scan()
        if (settings.outputDir) void get().refreshOutput()

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe())
            window.removeEventListener('focus', onFocus)
        }
    },

    async updateSettings(patch) {
        const current = get().settings
        if (!current) return
        const next = { ...current, ...patch }
        set({ settings: next })
        set({ settings: await window.api.saveSettings(next) })
    },

    async recheckFfmpeg() {
        set({ ffmpeg: await window.api.checkFfmpeg() })
    },

    async selectInput() {
        const dir = await window.api.selectFolder(get().settings?.inputDir)
        if (!dir) return
        await get().updateSettings({ inputDir: dir })
        await get().scan()
    },

    async selectOutput() {
        const dir = await window.api.selectFolder(get().settings?.outputDir || get().settings?.inputDir)
        if (!dir) return
        await get().updateSettings({ outputDir: dir })
        await get().refreshOutput()
    },

    async scan() {
        const dir = get().settings?.inputDir
        if (!dir || get().run.running) return

        // Peak- und Zählergebnisse bleiben immer erhalten: Sie hängen an Pfad + Größe und gelten auch nach erneutem Einlesen.
        // Derselbe Ordner noch einmal (Aktualisieren) behält zusätzlich Eingaben, Analysen und die TMDB-Zuordnung.
        const refresh = dir === get().scannedDir
        const requestId = get().analyzeRequest + 1
        // Heruntergeladene, noch nicht verarbeitete Videos liegen nicht im Input und bleiben oben in der Liste
        const results = get().run.results
        const downloaded = get().files.filter((entry) => entry.downloaded && results[entry.file.id]?.status !== 'ok')
        set({
            scanning: true,
            analyzeRequest: requestId,
            run: emptyRun,
            ...(refresh
                ? {}
                : {
                      scannedDir: dir,
                      files: [],
                      excluded: {},
                      overrides: {},
                      activeRuleSetId: null,
                      stereoOverrides: {},
                      typeOverrides: {},
                      expanded: {},
                      ...emptyMedia
                  })
        })
        try {
            const files = await window.api.scan(dir)
            const previous = new Map(get().files.map((entry) => [entry.file.id, entry]))
            const changed = (file: MediaFile) => {
                const before = previous.get(file.id)
                return !!before && analysisKey(before.file) !== analysisKey(file)
            }
            // Unveränderte Dateien behalten ihre Analyse, nur neue und geänderte werden (im Main-Prozess ggf. aus dem Cache) analysiert
            const scanned = files.map((file): FileEntry => {
                const before = previous.get(file.id)
                return before?.status === 'done' && !changed(file) ? { ...before, file } : { file, status: 'pending' }
            })
            const entries = [...downloaded, ...scanned.filter((entry) => !downloaded.some((d) => d.file.id === entry.file.id))]
            const ids = new Set(entries.map((entry) => entry.file.id))
            const keep = <T>(record: Record<string, T>, drop: (id: string) => boolean = () => false) =>
                Object.fromEntries(Object.entries(record).filter(([id]) => ids.has(id) && !drop(id)))
            const changedIds = new Set(files.filter(changed).map((file) => file.id))

            set((state) => ({
                files: entries,
                // Eingaben verschwundener Dateien fallen weg; die Spurwahl einer geänderten Datei passt nicht mehr zu ihren Spuren
                excluded: keep(state.excluded),
                overrides: keep(state.overrides),
                stereoOverrides: keep(state.stereoOverrides),
                typeOverrides: keep(state.typeOverrides, (id) => changedIds.has(id)),
                expanded: keep(state.expanded),
                episodeOverrides: keep(state.episodeOverrides),
                stillOverrides: keep(state.stillOverrides)
            }))
            const pending = entries.filter((entry) => entry.status === 'pending').map((entry) => entry.file)
            if (pending.length > 0) void window.api.analyze(requestId, pending)
        } finally {
            set({ scanning: false })
        }
    },

    async refreshOutput() {
        const dir = get().settings?.outputDir
        if (!dir) {
            set({ outputNames: [], disk: null })
            return
        }
        const [outputNames, disk] = await Promise.all([window.api.listOutput(dir), window.api.diskSpace(dir)])
        set({ outputNames, disk })
    },

    toggleExcluded(id) {
        set((state) => ({ excluded: { ...state.excluded, [id]: !state.excluded[id] } }))
        forgetResults([id])
    },

    setAllExcluded(excluded) {
        set((state) => ({ excluded: Object.fromEntries(state.files.map((entry) => [entry.file.id, excluded])) }))
        forgetResults(get().files.map((entry) => entry.file.id))
    },

    setActiveRuleSet(id) {
        set({ activeRuleSetId: id })
    },

    setOverride(id, stem) {
        set((state) => {
            const overrides = { ...state.overrides }
            if (stem === null) delete overrides[id]
            else overrides[id] = stem
            return { overrides }
        })
    },

    setStereo3D(fileId, value) {
        set((state) => {
            const stereoOverrides = { ...state.stereoOverrides }
            if (value === undefined) delete stereoOverrides[fileId]
            else stereoOverrides[fileId] = value
            // Die Kennung soll im Namen ankommen, daher die Namensbearbeitung zurücksetzen
            const overrides = { ...state.overrides }
            delete overrides[fileId]
            return { stereoOverrides, overrides }
        })
    },

    async detectStereoContent(file, force = false) {
        const key = fileKey(file)
        const current = get().stereoContent[key]
        if (current && (current.status !== 'error' || !force)) return
        set((state) => ({ stereoContent: { ...state.stereoContent, [key]: { status: 'running' } } }))
        const result = await window.api.detectStereo(file)
        set((state) => ({
            stereoContent: {
                ...state.stereoContent,
                [key]: result.ok ? { status: 'done', result: result.data } : { status: 'error', error: result.error }
            }
        }))
    },

    async loadStillImages(showId, ref) {
        const key = stillImagesKey(showId, ref)
        if (get().stillImages[key]) return
        set((state) => ({ stillImages: { ...state.stillImages, [key]: { status: 'loading' } } }))
        const result = await window.api.tmdbEpisodeImages(showId, ref.season, ref.episode)
        set((state) => ({
            stillImages: { ...state.stillImages, [key]: result.ok ? { status: 'done', images: result.data } : { status: 'error' } }
        }))
    },

    async loadFrames(file, force = false) {
        const key = fileKey(file)
        const current = get().videoFrames[key]
        if (current && (current.status !== 'error' || !force)) return
        set((state) => ({ videoFrames: { ...state.videoFrames, [key]: { status: 'loading' } } }))
        const result = await window.api.extractFrames(file)
        set((state) => ({
            videoFrames: {
                ...state.videoFrames,
                [key]: result.ok ? { status: 'done', frames: result.data } : { status: 'error', error: result.error }
            }
        }))
    },

    setTypeOverride(fileId, trackId, type) {
        set((state) => {
            const forFile = { ...state.typeOverrides[fileId] }
            if (type === null) delete forFile[trackId]
            else forFile[trackId] = type
            return { typeOverrides: { ...state.typeOverrides, [fileId]: forFile } }
        })
    },

    async assignShow(show) {
        set({ ...emptyMedia, tmdb: { ...emptyTmdb, show, loading: true } })
        const isCurrent = () => get().tmdb.show?.id === show.id
        void get().loadDetails()

        const seasons = await window.api.tmdbSeasons(show.id)
        if (!isCurrent()) return
        if (!seasons.ok) {
            set((state) => ({ tmdb: { ...state.tmdb, loading: false, error: seasons.error } }))
            return
        }
        // Bilder schon laden, während die Episoden noch kommen; dafür werden die Staffeln gebraucht
        set((state) => ({ tmdb: { ...state.tmdb, seasons: seasons.data, aired: { ...state.tmdb.aired, seasons: seasons.data } } }))
        void get().loadArtwork()
        // Andere Reihenfolgen sind optional, Fehler bleiben still
        const ordersRequest = window.api.tmdbEpisodeGroups(show.id)

        // Alle Staffeln laden, damit jede Folge im Dropdown frei gewählt werden kann (Specials = Staffel 0 ans Ende)
        const results = await Promise.all(seasons.data.map((season) => window.api.tmdbSeason(show.id, season.season)))
        if (!isCurrent()) return
        const failed = results.find((result) => !result.ok)
        const episodes = results.flatMap((result) => (result.ok ? result.data : [])).sort(compareEpisodes)
        const orders = await ordersRequest
        if (!isCurrent()) return

        const aired = { seasons: seasons.data, episodes }
        const splits = get().settings?.episodeSplits[show.id] ?? {}
        set((state) => ({
            tmdb: {
                ...state.tmdb,
                show,
                movie: null,
                ...splitEpisodes(episodes, seasons.data, splits),
                aired,
                ordered: aired,
                splits,
                orders: orders.ok ? orders.data : [],
                loading: false,
                error: failed && !failed.ok ? failed.error : null
            }
        }))

        // Zuletzt für diese Serie gewählte Reihenfolge wiederherstellen, sofern es sie noch gibt
        const saved = get().settings?.episodeOrders[show.id]
        if (saved && orders.ok && orders.data.some((order) => order.id === saved)) await get().setEpisodeOrder(saved)
    },

    async setEpisodeOrder(orderId) {
        const { show, aired } = get().tmdb
        if (!show || get().tmdb.orderLoading) return
        // Manuelle Zuordnungen beziehen sich auf die alte Nummerierung und gelten danach nicht mehr
        const reset = { episodeOverrides: {}, stillOverrides: {}, missingSelected: {}, missingStills: {} }
        const remember = () => {
            const settings = get().settings
            if (!settings || (settings.episodeOrders[show.id] ?? null) === orderId) return
            const episodeOrders = { ...settings.episodeOrders }
            if (orderId === null) delete episodeOrders[show.id]
            else episodeOrders[show.id] = orderId
            void get().updateSettings({ episodeOrders })
        }

        if (orderId === null) {
            set((state) => ({
                ...reset,
                tmdb: { ...state.tmdb, orderId: null, ordered: aired, ...splitEpisodes(aired.episodes, aired.seasons, state.tmdb.splits) }
            }))
            remember()
            return
        }

        set((state) => ({ tmdb: { ...state.tmdb, orderLoading: true } }))
        const result = await window.api.tmdbEpisodeGroup(orderId)
        if (get().tmdb.show !== show) return
        if (!result.ok) {
            set((state) => ({ tmdb: { ...state.tmdb, orderLoading: false, error: result.error } }))
            return
        }
        const ordered = applyEpisodeGroup(result.data, aired.episodes)
        set((state) => ({
            ...reset,
            tmdb: {
                ...state.tmdb,
                orderId,
                orderLoading: false,
                ordered,
                ...splitEpisodes(ordered.episodes, ordered.seasons, state.tmdb.splits),
                error: null
            }
        }))
        remember()
    },

    setEpisodeSplit(key, parts) {
        const { show, ordered, splits: current } = get().tmdb
        if (!show || (current[key] ?? 1) === parts) return
        const splits = { ...current }
        if (parts > 1) splits[key] = parts
        else delete splits[key]
        // Die Nummern ab der geteilten Folge ändern sich, manuelle Zuordnungen passen danach nicht mehr
        set((state) => ({
            episodeOverrides: {},
            stillOverrides: {},
            missingSelected: {},
            missingStills: {},
            tmdb: { ...state.tmdb, splits, ...splitEpisodes(ordered.episodes, ordered.seasons, splits) }
        }))
        const settings = get().settings
        if (!settings) return
        const episodeSplits = { ...settings.episodeSplits }
        if (Object.keys(splits).length > 0) episodeSplits[show.id] = splits
        else delete episodeSplits[show.id]
        void get().updateSettings({ episodeSplits })
    },

    assignMovie(movie) {
        set({ ...emptyMedia, tmdb: { ...emptyTmdb, movie } })
        void get().loadArtwork()
        void get().loadDetails()
    },

    async loadDetails() {
        const { show, movie } = get().tmdb
        const target = show ?? movie
        if (!target) return
        // Genres und Bewertung sind nur Hinweise zum Einsortieren: Fehler werden still ignoriert
        const result = await window.api.tmdbDetails(show ? 'tv' : 'movie', target.id)
        if (!result.ok || (get().tmdb.show ?? get().tmdb.movie) !== target) return
        set((state) => ({ tmdb: { ...state.tmdb, genres: result.data.genres, rating: result.data.rating } }))
    },

    clearShow() {
        set(emptyMedia)
    },

    async loadArtwork() {
        const { show, movie } = get().tmdb
        const target = show ?? movie
        if (!target) return
        const isCurrent = () => (get().tmdb.show ?? get().tmdb.movie) === target

        // Staffelposter für alle Staffeln; angehakt sind später nur die aus den Dateien
        const seasons = get().tmdb.aired.seasons.map((season) => season.season)
        set((state) => ({ artwork: { ...state.artwork, loading: true, error: null, warnings: [] } }))
        const result = await window.api.artworkCandidates({ kind: show ? 'tv' : 'movie', tmdbId: target.id, seasons: show ? seasons : [] })
        if (!isCurrent()) return
        set((state) => ({
            artwork: result.ok
                ? { ...state.artwork, loading: false, candidates: result.data.candidates, warnings: result.data.warnings }
                : { ...state.artwork, loading: false, error: result.error }
        }))
    },

    setArtwork(slot, url) {
        set((state) => {
            const artworkSelection = { ...state.artworkSelection }
            if (url === null) delete artworkSelection[slot]
            else artworkSelection[slot] = url
            return { artworkSelection }
        })
    },

    setArtworkEnabled(slot, enabled) {
        set((state) => ({ artworkEnabled: { ...state.artworkEnabled, [slot]: enabled } }))
    },

    setCoverOverlays(coverOverlays) {
        set({ coverOverlays })
    },

    setSeasonOverlays(season, overlays) {
        set((state) => {
            const seasonOverlays = { ...state.seasonOverlays }
            if (overlays === null || overlays.length === 0) delete seasonOverlays[season]
            else seasonOverlays[season] = overlays
            return { seasonOverlays }
        })
    },

    async exportArtwork(jobs) {
        const outputDir = get().settings?.outputDir
        if (!outputDir || jobs.length === 0 || get().artwork.exporting) return
        set((state) => ({ artwork: { ...state.artwork, exporting: true, results: null } }))
        try {
            const results = await window.api.exportArtwork(jobs, outputDir)
            set((state) => ({ artwork: { ...state.artwork, results } }))
        } finally {
            set((state) => ({ artwork: { ...state.artwork, exporting: false } }))
            await get().refreshOutput()
        }
    },

    setEpisode(fileId, ref) {
        set((state) => {
            const episodeOverrides = { ...state.episodeOverrides }
            if (ref === undefined) delete episodeOverrides[fileId]
            else episodeOverrides[fileId] = ref
            // Ein bewusst gewählter Titel soll im Namen ankommen, daher die Namensbearbeitung zurücksetzen
            const overrides = { ...state.overrides }
            delete overrides[fileId]
            // Eine andere Episode hat andere Bilder, also wieder ihr Standardbild
            const stillOverrides = { ...state.stillOverrides }
            delete stillOverrides[fileId]
            return { episodeOverrides, overrides, stillOverrides }
        })
    },

    setStill(fileId, path) {
        set((state) => {
            const stillOverrides = { ...state.stillOverrides }
            if (path === null) delete stillOverrides[fileId]
            else stillOverrides[fileId] = path
            return { stillOverrides }
        })
    },

    toggleMissing(key) {
        set((state) => ({ missingSelected: { ...state.missingSelected, [key]: !state.missingSelected[key] } }))
    },

    setMissingStill(key, path) {
        set((state) => {
            const missingStills = { ...state.missingStills }
            if (path === null) delete missingStills[key]
            else missingStills[key] = path
            return { missingStills }
        })
    },

    toggleExpanded(id) {
        set((state) => ({ expanded: { ...state.expanded, [id]: !state.expanded[id] } }))
    },

    setForceApply(forceApply) {
        set({ forceApply })
    },

    async apply(jobs, artwork) {
        const outputDir = get().settings?.outputDir
        if (!outputDir || jobs.length === 0 || get().run.running) return

        const weights = Object.fromEntries(jobs.map((job) => [job.fileId, Math.max(1, job.size)]))
        const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
        set((state) => ({
            run: {
                ...emptyRun,
                running: true,
                total: jobs.length,
                startedAt: Date.now(),
                weights,
                totalWeight,
                results: state.run.results
            }
        }))
        try {
            const summary = await window.api.apply(jobs, outputDir, artwork)
            set((state) => ({ run: { ...state.run, summary } }))
        } finally {
            set((state) => ({ forceApply: false, run: { ...state.run, running: false, cancelling: false, active: {} } }))
            await get().refreshOutput()
        }
    },

    addDownloadedFiles(files) {
        if (files.length === 0) return
        const ids = new Set(files.map((file) => file.id))
        set((state) => ({
            files: [
                ...files.map((file): FileEntry => ({ file, status: 'pending', downloaded: true })),
                ...state.files.filter((entry) => !ids.has(entry.file.id))
            ]
        }))
        void window.api.analyze(get().analyzeRequest, files)
    },

    removeDownloadedFiles(ids) {
        const drop = new Set(ids)
        set((state) => ({ files: state.files.filter((entry) => !(entry.downloaded && drop.has(entry.file.id))) }))
    },

    async cancel() {
        set((state) => ({ run: { ...state.run, cancelling: true } }))
        await window.api.cancelApply()
    }
}))
