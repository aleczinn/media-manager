import { create } from 'zustand'
import type { PeakState } from '@shared/peak'
import type {
    ApplyFileResult,
    ApplyJob,
    ApplyProgress,
    ApplySummary,
    DiskSpace,
    FfmpegStatus,
    FileAnalysis,
    MediaFile,
    Settings,
    SubtitleOverride
} from '@shared/types'

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
    toggleExpanded(id: string): void
    setForceApply(force: boolean): void
    apply(jobs: ApplyJob[]): Promise<void>
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
            window.api.onPeakUpdate(({ key, state: peak }) => set((state) => ({ peaks: { ...state.peaks, [key]: peak } })))
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

        // Peak-Ergebnisse bleiben erhalten: Sie hängen an Pfad + Größe und gelten auch nach erneutem Einlesen
        const requestId = get().analyzeRequest + 1
        set({
            scanning: true,
            analyzeRequest: requestId,
            files: [],
            excluded: {},
            overrides: {},
            typeOverrides: {},
            expanded: {},
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

    toggleExpanded(id) {
        set((state) => ({ expanded: { ...state.expanded, [id]: !state.expanded[id] } }))
    },

    setForceApply(forceApply) {
        set({ forceApply })
    },

    async apply(jobs) {
        const outputDir = get().settings?.outputDir
        if (!outputDir || jobs.length === 0 || get().run.running) return

        set((state) => ({
            run: { ...emptyRun, running: true, total: jobs.length, startedAt: Date.now(), results: state.run.results }
        }))
        try {
            const summary = await window.api.apply(jobs, outputDir)
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
