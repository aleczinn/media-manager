import { create } from 'zustand'
import type {
    ApplyFileResult,
    ApplyJob,
    ApplyProgress,
    ApplySummary,
    DiskSpace,
    FfmpegStatus,
    FileAnalysis,
    MediaFile,
    Settings
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
    progress: ApplyProgress | null
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
    expanded: Record<string, boolean>
    outputNames: string[]
    disk: DiskSpace | null
    forceApply: boolean
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
    toggleExpanded(id: string): void
    setForceApply(force: boolean): void
    apply(jobs: ApplyJob[]): Promise<void>
    cancel(): Promise<void>
}

const emptyRun: RunState = { running: false, cancelling: false, progress: null, results: {}, summary: null }

export const useStore = create<State>()((set, get) => ({
    settings: null,
    ffmpeg: null,
    files: [],
    scanning: false,
    analyzeRequest: 0,
    excluded: {},
    overrides: {},
    expanded: {},
    outputNames: [],
    disk: null,
    forceApply: false,
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
            window.api.onApplyProgress((progress) => set((state) => ({ run: { ...state.run, progress } }))),
            window.api.onApplyFileDone((result) =>
                set((state) => ({ run: { ...state.run, results: { ...state.run.results, [result.fileId]: result } } }))
            )
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

        const requestId = get().analyzeRequest + 1
        set({ scanning: true, analyzeRequest: requestId, files: [], excluded: {}, overrides: {}, expanded: {}, run: emptyRun })
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
            run: { running: true, cancelling: false, progress: null, results: state.run.results, summary: null }
        }))
        try {
            const summary = await window.api.apply(jobs, outputDir)
            set((state) => ({ run: { ...state.run, summary } }))
        } finally {
            set((state) => ({ forceApply: false, run: { ...state.run, running: false, cancelling: false, progress: null } }))
            await get().refreshOutput()
        }
    },

    async cancel() {
        set((state) => ({ run: { ...state.run, cancelling: true } }))
        await window.api.cancelApply()
    }
}))
