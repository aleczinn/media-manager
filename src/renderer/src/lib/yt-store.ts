import { create } from 'zustand'
import { applyNameRules } from '@shared/name-rules'
import type { Settings } from '@shared/types'
import { cleanYoutubeName } from '@shared/youtube'
import {
    DETAIL_CANCELLED,
    DOWNLOAD_DIR,
    downloadStem,
    fullSizeThumbnails,
    resolveManual,
    resolveSelection,
    type YtBinaryStatus,
    type YtDownloadJob,
    type YtEntry,
    type YtProgress,
    type YtResolved,
    type YtSelection,
    type YtSource,
    type YtVideo
} from '@shared/youtube-dl'
import { useStore } from './store'

export type YtItemStatus = 'idle' | 'waiting' | 'queued' | 'running' | 'ok' | 'error' | 'cancelled'

export interface YtManualFormat {
    videoId: string | null
    audioId: string | null
}

export interface YtItem {
    key: string
    sourceUrl: string
    entry: YtEntry
    video: YtVideo | null
    detailLoading: boolean
    detailError: string | null
    checked: boolean
    /** Eigene Formatwahl statt der globalen Auswahl */
    manual: YtManualFormat | null
    status: YtItemStatus
    progress: YtProgress | null
    message?: string
    /** Heruntergeladene Datei im Temp-Ordner (bzw. bei Audio im Output) */
    path?: string
    /** Nur Audio: schon fertig im Output */
    delivered?: boolean
    /** Von Hand eingetragener Zielname (ohne Endung); geht nach dem Download an die Datei über */
    stemOverride?: string
}

/**
 * Ablauf von „Anwenden“ mit Links: `download` lädt die ausgewählten Videos in den Temp-Ordner im Output, `analyze`
 * wartet, bis die neuen Dateien analysiert sind, `process` ist die normale Verarbeitung nach Output.
 */
export type YtPhase = 'idle' | 'download' | 'analyze' | 'process'

interface YtState {
    status: YtBinaryStatus | null
    /** Links, die gerade analysiert werden */
    analyzing: string[]
    analyzeError: string | null
    sources: YtSource[]
    items: Record<string, YtItem>
    phase: YtPhase
    /** Videos des aktuellen Downloads (für den Gesamtfortschritt) */
    runKeys: string[]
    startedAt: number

    init(): Promise<() => void>
    update(): Promise<void>
    analyze(url: string): Promise<void>
    loadDetails(key: string): Promise<void>
    toggle(key: string): void
    setAllChecked(checked: boolean): void
    removeSource(sourceUrl: string): void
    setManual(key: string, manual: YtManualFormat | null): void
    /** `null` = zurück auf den Vorschlag */
    setStemOverride(key: string, stem: string | null): void
    /** Ausgewählte Videos herunterladen, danach geht es mit der Verarbeitung weiter */
    start(): void
    retry(key: string): void
    cancel(key?: string): Promise<void>
    /** Die Verarbeitung beginnt (von der Leiste unten gestartet) */
    markProcessing(): void
    /** Nach der Verarbeitung: erfolgreich verarbeitete Downloads löschen */
    finish(): Promise<void>
}

const itemKey = (sourceUrl: string, id: string) => `${sourceUrl}|${id}`
/** Playlists mit mehr Videos kommen abgewählt an */
export const AUTO_CHECK_LIMIT = 50
const ACTIVE: YtItemStatus[] = ['waiting', 'queued', 'running']

export const isActive = (item: YtItem) => ACTIVE.includes(item.status)
/** Wird beim Anwenden heruntergeladen */
export const isSelected = (item: YtItem) => item.checked && !item.detailError && item.status !== 'ok'

export const workDirOf = (outputDir: string) => `${outputDir.replace(/[\\/]+$/, '')}\\${DOWNLOAD_DIR}`

/** Format eines Videos nach globaler Auswahl oder eigener Wahl */
export function resolveItem(item: YtItem, selection: YtSelection): YtResolved | null {
    if (!item.video) return null
    return item.manual
        ? resolveManual(item.manual.videoId, item.manual.audioId, item.video.formats, item.video.durationSec)
        : resolveSelection(selection, item.video.formats, item.video.durationSec)
}

/** Dateiname des Downloads (ohne Endung) */
export function itemStem(item: YtItem, source: YtSource, settings: Settings): string {
    return downloadStem(
        { title: item.video?.title || item.entry.title, index: item.entry.index },
        { kind: source.kind, entryCount: source.entries.length },
        { indexPrefix: settings.youtube.indexPrefix }
    )
}

/** Zielname nach der Verarbeitung, wie bei Dateien aus dem Input (bereinigt, Namensregeln) */
export function itemTargetStem(item: YtItem, source: YtSource, settings: Settings, activeRuleSetId: string | null): string {
    const stem = itemStem(item, source, settings)
    if (item.stemOverride !== undefined) return item.stemOverride
    if (!settings.pipeline.renameFile) return stem
    const steps = settings.nameRuleSets.find((set) => set.id === activeRuleSetId)?.steps ?? []
    return applyNameRules(cleanYoutubeName(stem), steps)
}

/** Auftrag für den Main-Prozess; `string` = Grund, warum es nicht geht */
export function buildJob(item: YtItem, source: YtSource, settings: Settings): YtDownloadJob | string {
    const youtube = settings.youtube
    if (!settings.outputDir) return 'Kein Output-Ordner gewählt'
    if (!item.video) return 'Analyse fehlt'
    const resolved = resolveItem(item, youtube.selection)
    if (!resolved) return 'Kein passendes Format'
    return {
        id: item.key,
        url: item.video.url,
        formatSpec: resolved.formatSpec,
        audioOnly: resolved.audioOnly,
        ext: resolved.ext,
        workDir: workDirOf(settings.outputDir),
        stem: itemStem(item, source, settings),
        thumbnailUrl: youtube.saveThumbnail ? item.video.thumbnail : null,
        description: youtube.saveDescription ? item.video.description : null,
        partSizes: resolved.partSizes,
        folderImageUrls: source.kind === 'playlist' && youtube.saveFolderImage ? fullSizeThumbnails(source.thumbnail) : [],
        folderImageDir: source.kind === 'playlist' && youtube.saveFolderImage ? settings.outputDir : null
    }
}

export const useYtStore = create<YtState>()((set, get) => {
    const patch = (key: string, change: Partial<YtItem>) =>
        set((state) => (state.items[key] ? { items: { ...state.items, [key]: { ...state.items[key], ...change } } } : {}))

    /** Alle Downloads fertig: Dateien einlesen, in die Liste übernehmen und analysieren lassen */
    const checkDownloadsDone = () => {
        const { phase, runKeys, items } = get()
        if (phase !== 'download' || runKeys.some((key) => items[key] && isActive(items[key]))) return
        const { settings, activeRuleSetId } = useStore.getState()
        const outputDir = settings?.outputDir
        const done = runKeys.map((key) => items[key]).filter((item) => item?.status === 'ok' && item.path)
        // Videos werden wie Input-Dateien verarbeitet, reines Audio kommt direkt in den Output
        const videos = new Set(done.filter((item) => item.path!.toLowerCase().endsWith('.mkv')).map((item) => item.path!))
        const audio = done.filter((item) => !videos.has(item.path!))
        if (!settings || !outputDir || done.length === 0) {
            set({ phase: 'analyze' })
            return
        }
        void (async () => {
            if (audio.length > 0) {
                const delivered = await window.api.ytDeliver(
                    audio.map((item) => {
                        const source = get().sources.find((candidate) => candidate.url === item.sourceUrl)
                        return {
                            path: item.path!,
                            targetStem: source ? itemTargetStem(item, source, settings, activeRuleSetId) : item.entry.title
                        }
                    }),
                    outputDir
                )
                for (const result of delivered) {
                    const item = audio.find((candidate) => candidate.path === result.id)
                    if (!item) continue
                    if (result.status === 'ok') patch(item.key, { status: 'ok', delivered: true, path: result.path, message: undefined })
                    else patch(item.key, { status: 'error', message: result.message })
                }
            }
            if (videos.size > 0) {
                const files = await window.api.scan(workDirOf(outputDir))
                const store = useStore.getState()
                store.addDownloadedFiles(files.filter((file) => videos.has(file.fullPath)))
                // Von Hand eingetragene Namen gelten weiter für die geladene Datei
                for (const item of done)
                    if (item.stemOverride !== undefined && videos.has(item.path!)) store.setOverride(item.path!, item.stemOverride)
            }
            set({ phase: 'analyze' })
        })()
    }

    /** Wartende Videos mit fertiger Analyse an den Main-Prozess geben */
    const flush = () => {
        const settings = useStore.getState().settings
        if (!settings) return
        const { items, sources } = get()
        const jobs: YtDownloadJob[] = []
        for (const item of Object.values(items)) {
            if (item.status !== 'waiting' || (!item.video && !item.detailError)) continue
            const source = sources.find((candidate) => candidate.url === item.sourceUrl)
            const job = source ? buildJob(item, source, settings) : 'Quelle fehlt'
            if (typeof job === 'string') patch(item.key, { status: 'error', message: item.detailError ?? job })
            else {
                jobs.push(job)
                patch(item.key, { status: 'queued', message: undefined })
            }
        }
        if (jobs.length > 0) void window.api.ytDownload(jobs)
        checkDownloadsDone()
    }

    return {
        status: null,
        analyzing: [],
        analyzeError: null,
        sources: [],
        items: {},
        phase: 'idle',
        runKeys: [],
        startedAt: 0,

        init: async () => {
            const unsubscribe = [
                window.api.onYtStatus((status) => set({ status })),
                window.api.onYtProgress((progress) => {
                    const item = get().items[progress.id]
                    if (item && isActive(item)) patch(progress.id, { status: 'running', progress })
                }),
                window.api.onYtItemDone((result) => {
                    patch(result.id, {
                        status: result.status === 'skipped' ? 'ok' : result.status,
                        message: result.message,
                        path: result.path,
                        progress: null
                    })
                    checkDownloadsDone()
                })
            ]
            set({ status: await window.api.ytStatus() })
            return () => unsubscribe.forEach((fn) => fn())
        },

        update: async () => {
            set({ status: await window.api.ytUpdate() })
        },

        analyze: async (input) => {
            const url = input.trim()
            if (!url || get().analyzing.includes(url)) return
            set((state) => ({ analyzing: [...state.analyzing, url], analyzeError: null }))
            const result = await window.api.ytAnalyze(url)
            set((state) => ({ analyzing: state.analyzing.filter((entry) => entry !== url) }))
            if (!result.ok) {
                set({ analyzeError: result.error })
                return
            }
            const source = result.data
            // Große Playlists kommen abgewählt an, damit nicht hunderte Videos gelesen werden; Formate erst beim Auswählen
            const checked = source.kind === 'video' || source.entries.length <= AUTO_CHECK_LIMIT
            set((state) => {
                const items = { ...state.items }
                for (const entry of source.entries) {
                    const key = itemKey(source.url, entry.id)
                    if (items[key]) continue
                    items[key] = {
                        key,
                        sourceUrl: source.url,
                        entry,
                        video: source.video?.id === entry.id ? source.video : null,
                        detailLoading: false,
                        detailError: null,
                        checked,
                        manual: null,
                        status: 'idle',
                        progress: null
                    }
                }
                const sources = state.sources.some((existing) => existing.url === source.url)
                    ? state.sources.map((existing) => (existing.url === source.url ? source : existing))
                    : [...state.sources, source]
                return { sources, items }
            })
            if (checked) for (const entry of source.entries) void get().loadDetails(itemKey(source.url, entry.id))
        },

        loadDetails: async (key) => {
            const item = get().items[key]
            if (!item || item.video || item.detailLoading) return
            patch(key, { detailLoading: true, detailError: null })
            const result = await window.api.ytVideo(item.entry.id, item.entry.url)
            if (result.ok) patch(key, { video: result.data, detailLoading: false })
            else if (result.error === DETAIL_CANCELLED) patch(key, { detailLoading: false })
            else patch(key, { detailLoading: false, detailError: result.error, checked: false })
            flush()
        },

        toggle: (key) => {
            const item = get().items[key]
            if (!item || isActive(item) || item.detailError) return
            patch(key, { checked: !item.checked })
            if (!item.checked) void get().loadDetails(key)
            else if (item.detailLoading) void window.api.ytDropDetails([item.entry.id])
        },

        setAllChecked: (checked) => {
            const changed = Object.values(get().items).filter((item) => !isActive(item) && !item.detailError && item.checked !== checked)
            set((state) => ({
                items: Object.fromEntries(
                    Object.entries(state.items).map(([key, item]) => [
                        key,
                        !isActive(item) && !item.detailError ? { ...item, checked } : item
                    ])
                )
            }))
            if (checked) for (const item of changed) void get().loadDetails(item.key)
            else void window.api.ytDropDetails(changed.filter((item) => item.detailLoading).map((item) => item.entry.id))
        },

        removeSource: (sourceUrl) => {
            if (get().phase !== 'idle') return
            const pending = Object.values(get().items).filter((item) => item.sourceUrl === sourceUrl && item.detailLoading)
            if (pending.length > 0) void window.api.ytDropDetails(pending.map((item) => item.entry.id))
            set((state) => ({
                sources: state.sources.filter((source) => source.url !== sourceUrl),
                items: Object.fromEntries(Object.entries(state.items).filter(([, item]) => item.sourceUrl !== sourceUrl))
            }))
        },

        setManual: (key, manual) => patch(key, { manual }),

        setStemOverride: (key, stem) => patch(key, { stemOverride: stem ?? undefined }),

        start: () => {
            if (get().phase !== 'idle') return
            const keys = Object.values(get().items)
                .filter(isSelected)
                .map((item) => item.key)
            set({ phase: 'download', runKeys: keys, startedAt: Date.now() })
            for (const key of keys) patch(key, { status: 'waiting', message: undefined, progress: null })
            flush()
        },

        retry: (key) => {
            const item = get().items[key]
            if (!item || isActive(item)) return
            if (item.detailError) {
                patch(key, { detailError: null })
                void get().loadDetails(key)
            }
            patch(key, { status: 'idle', checked: true, message: undefined })
        },

        cancel: async (key) => {
            const { items, phase } = get()
            if (key) {
                if (items[key]?.status === 'waiting') patch(key, { status: 'cancelled' })
                await window.api.ytCancel(key)
                checkDownloadsDone()
                return
            }
            // Alles abbrechen: Downloads stoppen, die Verarbeitung startet dann nicht mehr
            for (const item of Object.values(items)) if (item.status === 'waiting') patch(item.key, { status: 'cancelled' })
            if (phase === 'download' || phase === 'analyze') set({ phase: 'idle' })
            await window.api.ytCancel()
        },

        markProcessing: () => set({ phase: 'process' }),

        finish: async () => {
            const { files, run, settings } = useStore.getState()
            set({ phase: 'idle' })
            if (!settings?.outputDir) return
            // Fertig verarbeitete Downloads: Rohdateien löschen und den Link-Eintrag entfernen
            const done = files.filter((entry) => entry.downloaded && run.results[entry.file.id]?.status === 'ok')
            if (done.length === 0) return
            const paths = new Set(done.map((entry) => entry.file.fullPath))
            await window.api.ytCleanup([...paths], workDirOf(settings.outputDir))
            set((state) => {
                const items = Object.fromEntries(Object.entries(state.items).filter(([, item]) => !(item.path && paths.has(item.path))))
                const urls = new Set(Object.values(items).map((item) => item.sourceUrl))
                return { items, sources: state.sources.filter((source) => urls.has(source.url)) }
            })
        }
    }
})
