import type { PeakRequest, PeakUpdate } from './peak'

export interface MediaFile {
    id: string
    /** Dateiname ohne Endung */
    name: string
    /** Endung inkl. Punkt, kleingeschrieben */
    extension: string
    fullPath: string
    dir: string
    /** Pfad relativ zum Input-Ordner */
    relativePath: string
    size: number
    /** Zugehörige externe Untertiteldateien (Subs-Ordner oder gleichnamige Dateien daneben) */
    externalSubtitles: ExternalSubtitleFile[]
}

export interface ExternalSubtitleFile {
    path: string
    /** Größe inkl. zugehöriger .sub bei VobSub */
    size: number
}

export interface VideoTrackInfo {
    /** Index innerhalb der Videospuren (ffmpeg `0:v:N`) */
    index: number
    title: string
    language: string
    codec: string
}

export interface AudioTrackInfo {
    /** Index innerhalb der Audiospuren (ffmpeg `0:a:N`) */
    index: number
    title: string
    language: string
    codecId: string
    format: string
    formatCommercial: string
    additionalFeatures: string
    channels: number
    default: boolean
}

export type SubtitleType = 'normal' | 'forced' | 'sdh' | 'cc'

export interface SubtitleTrackInfo {
    /** Eingabe für ffmpeg: 0 = Videodatei, 1…n = externe Untertiteldatei */
    inputIndex: number
    /** Index innerhalb der Untertitelspuren dieser Eingabe (ffmpeg `N:s:index`) */
    index: number
    /** Pfad der externen Datei, nur bei `inputIndex` > 0 */
    externalPath?: string
    /** Anzahl der Einträge, `null` wenn unbekannt */
    eventCount: number | null
    /** Hinweise aus dem Dateinamen externer Untertitel (z. B. `-forced`, `.sdh`) */
    filenameForced?: boolean
    filenameSdh?: boolean
    /** Manuell gewählter Typ aus der Oberfläche */
    typeOverride?: SubtitleType
    title: string
    language: string
    codecId: string
    default: boolean
    forced: boolean
    hearingImpaired: boolean
    visualImpaired: boolean
    original: boolean
    dub: boolean
    commentary: boolean
    lyrics: boolean
    karaoke: boolean
}

export interface FileAnalysis {
    durationSec: number
    video: VideoTrackInfo[]
    audio: AudioTrackInfo[]
    subtitle: SubtitleTrackInfo[]
}

export interface PipelineOptions {
    /** Audio- und Untertitelspuren entfernen, deren Sprache nicht in der Liste steht */
    filterLanguages: boolean
    /** Spuren nach Sprache/Kanälen/Format sortieren */
    sortTracks: boolean
    /** Spurtitel vereinheitlichen (z. B. "Dolby Digital 5.1", "Deutsch Erzwungen") */
    renameTracks: boolean
    /** Pro Sprache und Untertiteltyp nur die beste Spur behalten */
    dedupeSubtitles: boolean
    /** Externe Untertitel (Subs-Ordner, gleichnamige Dateien) mit einbinden */
    mergeSubtitles: boolean
    /** Erste Tonspur peak-normalisiert als zusätzliche AC3-Spur einfügen */
    normalize: boolean
    /** Datei nach Schema umbenennen */
    renameFile: boolean
    /** Containertitel und Video-Metadaten leeren, Beschreibung aus .txt übernehmen */
    cleanMetadata: boolean
    /** Video neu encodieren statt kopieren */
    encodeVideo: boolean
}

export interface Settings {
    inputDir: string
    outputDir: string
    /** Text, der an den Titel der normalisierten Tonspur angehängt wird */
    audioBranding: string
    languages: string[]
    /** Sprache für Spuren ohne Sprach-Tag */
    unknownLanguage: string
    audioOrder: string[]
    subtitlePriority: string[]
    subtitleOrder: string[]
    normalizeMinGain: number
    normalizeMaxGain: number
    normalizeFormats: string[]
    normalizeChannels: number[]
    defaultSource: string
    videoCodec: string
    videoEncodeArgs: string
    /** Leer = aus dem PATH */
    ffmpegPath: string
    /** Leer = aus dem PATH */
    ffprobePath: string
    /** Warnung, wenn nach dem Export weniger als so viele GB frei wären */
    spaceWarningGb: number
    /** Wie viele Dateien gleichzeitig analysiert bzw. geschrieben werden (1–4) */
    concurrency: number
    pipeline: PipelineOptions
}

export interface FfmpegStatus {
    ffmpeg: string | null
    ffprobe: string | null
}

export interface DiskSpace {
    free: number
    total: number
}

export type AnalysisEvent =
    { requestId: number; fileId: string; analysis: FileAnalysis } | { requestId: number; fileId: string; error: string }

export interface ApplyJob {
    fileId: string
    inputPath: string
    /** Dateigröße, Teil des Schlüssels für zwischengespeicherte Peak-Analysen */
    size: number
    /** Zielname inkl. .mkv */
    targetName: string
    analysis: FileAnalysis
}

export type ApplyPhase = 'analyze' | 'build'

export interface ApplyProgress {
    fileId: string
    phase: ApplyPhase
    percent: number
    etaSec: number | null
}

export type ApplyStatus = 'ok' | 'skipped' | 'error' | 'cancelled'

export interface ApplyFileResult {
    fileId: string
    status: ApplyStatus
    message?: string
}

export interface ApplySummary {
    ok: number
    skipped: number
    error: number
    cancelled: number
}

export interface MediaManagerApi {
    selectFolder(defaultPath?: string): Promise<string | null>
    selectExecutable(defaultPath?: string): Promise<string | null>
    getSettings(): Promise<Settings>
    saveSettings(settings: Settings): Promise<Settings>
    checkFfmpeg(): Promise<FfmpegStatus>
    scan(dir: string): Promise<MediaFile[]>
    analyze(requestId: number, files: MediaFile[]): Promise<void>
    prefetchPeaks(requests: PeakRequest[]): Promise<void>
    listOutput(dir: string): Promise<string[]>
    diskSpace(dir: string): Promise<DiskSpace | null>
    apply(jobs: ApplyJob[], outputDir: string): Promise<ApplySummary>
    cancelApply(): Promise<void>
    openPath(path: string): Promise<void>
    onAnalysis(listener: (event: AnalysisEvent) => void): () => void
    onApplyProgress(listener: (progress: ApplyProgress) => void): () => void
    onApplyFileDone(listener: (result: ApplyFileResult) => void): () => void
    onPeakUpdate(listener: (update: PeakUpdate) => void): () => void
}
