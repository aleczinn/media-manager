import { create } from 'zustand'
import type { ArtworkSlot } from '@shared/artwork'
import type { OverlayId } from '@shared/overlays'
import type { PeakState, ScanStatus } from '@shared/peak'
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
    SubtitleOverride,
    TmdbEpisode,
    TmdbMovie,
    TmdbSeasonSummary,
    TmdbShow
} from '@shared/types'

interface TmdbState {
    show: TmdbShow | null
    /** Zugeordneter Film (statt einer Serie, ein Film pro Lauf) */
    movie: TmdbMovie | null
    seasons: TmdbSeasonSummary[]
    /** Alle Episoden der Serie, nach Staffel und Folge sortiert */
    episodes: TmdbEpisode[]
    loading: boolean
    error: string | null
}

const emptyTmdb: TmdbState = { show: null, movie: null, seasons: [], episodes: [], loading: false, error: null }

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

export interface FileEntry {
    file: MediaFile
    status: 'pending' | 'done' | 'error'
    analysis?: FileAnalysis
    error?: string
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
    results: Record<string, ApplyFileResult>
    summary: ApplySummary | null
}

interface State {
    settings: Settings | null
    ffmpeg: FfmpegStatus | null
    files: FileEntry[]
    scanning: boolean
    analyzeRequest: number
    excluded: Record<string, boolean>
    /** Vom Nutzer bearbeitete Zielnamen (ohne .mkv) */
    overrides: Record<string, string>
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
    setTypeOverride(fileId: string, trackId: string, type: SubtitleOverride | null): void
    assignShow(show: TmdbShow): Promise<void>
    assignMovie(movie: TmdbMovie): void
    /** Entfernt Serie bzw. Film */
    clearShow(): void
    loadArtwork(): Promise<void>
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
    cancel(): Promise<void>
}

const emptyRun: RunState = { running: false, cancelling: false, active: {}, total: 0, done: 0, startedAt: 0, results: {}, summary: null }

export const useStore = create<State>()((set, get) => ({
    settings: null,
    ffmpeg: null,
    files: [],
    scanning: false,
    analyzeRequest: 0,
    excluded: {},
    overrides: {},
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
                        run: { ...state.run, active, done: state.run.done + 1, results: { ...state.run.results, [result.fileId]: result } }
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

        const settings = await window.api.getSettings()
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

        // Peak- und Zählergebnisse bleiben erhalten: Sie hängen an Pfad + Größe und gelten auch nach erneutem Einlesen
        const requestId = get().analyzeRequest + 1
        set({
            scanning: true,
            analyzeRequest: requestId,
            files: [],
            excluded: {},
            overrides: {},
            typeOverrides: {},
            expanded: {},
            ...emptyMedia,
            run: emptyRun
        })
        try {
            const files = await window.api.scan(dir)
            set({ files: files.map((file) => ({ file, status: 'pending' })) })
            void window.api.analyze(requestId, files)
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
    },

    setAllExcluded(excluded) {
        set((state) => ({ excluded: Object.fromEntries(state.files.map((entry) => [entry.file.id, excluded])) }))
    },

    setOverride(id, stem) {
        set((state) => {
            const overrides = { ...state.overrides }
            if (stem === null) delete overrides[id]
            else overrides[id] = stem
            return { overrides }
        })
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

        const seasons = await window.api.tmdbSeasons(show.id)
        if (!isCurrent()) return
        if (!seasons.ok) {
            set((state) => ({ tmdb: { ...state.tmdb, loading: false, error: seasons.error } }))
            return
        }
        // Bilder schon laden, während die Episoden noch kommen; dafür werden die Staffeln gebraucht
        set((state) => ({ tmdb: { ...state.tmdb, seasons: seasons.data } }))
        void get().loadArtwork()

        // Alle Staffeln laden, damit jede Folge im Dropdown frei gewählt werden kann (Specials = Staffel 0 ans Ende)
        const results = await Promise.all(seasons.data.map((season) => window.api.tmdbSeason(show.id, season.season)))
        if (!isCurrent()) return
        const failed = results.find((result) => !result.ok)
        const episodes = results
            .flatMap((result) => (result.ok ? result.data : []))
            .sort((a, b) => (a.season || 999) - (b.season || 999) || a.episode - b.episode)

        set({
            tmdb: {
                show,
                movie: null,
                seasons: seasons.data,
                episodes,
                loading: false,
                error: failed && !failed.ok ? failed.error : null
            }
        })
    },

    assignMovie(movie) {
        set({ ...emptyMedia, tmdb: { ...emptyTmdb, movie } })
        void get().loadArtwork()
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
        const seasons = get().tmdb.seasons.map((season) => season.season)
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

        set((state) => ({
            run: { ...emptyRun, running: true, total: jobs.length, startedAt: Date.now(), results: state.run.results }
        }))
        try {
            const summary = await window.api.apply(jobs, outputDir, artwork)
            set((state) => ({ run: { ...state.run, summary } }))
        } finally {
            set((state) => ({ forceApply: false, run: { ...state.run, running: false, cancelling: false, active: {} } }))
            await get().refreshOutput()
        }
    },

    async cancel() {
        set((state) => ({ run: { ...state.run, cancelling: true } }))
        await window.api.cancelApply()
    }
}))
