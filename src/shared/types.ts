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

export interface SubtitleTrackInfo {
    /** Index innerhalb der Untertitelspuren (ffmpeg `0:s:N`) */
    index: number
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
    index: number
    total: number
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
    listOutput(dir: string): Promise<string[]>
    diskSpace(dir: string): Promise<DiskSpace | null>
    apply(jobs: ApplyJob[], outputDir: string): Promise<ApplySummary>
    cancelApply(): Promise<void>
    openPath(path: string): Promise<void>
    onAnalysis(listener: (event: AnalysisEvent) => void): () => void
    onApplyProgress(listener: (progress: ApplyProgress) => void): () => void
    onApplyFileDone(listener: (result: ApplyFileResult) => void): () => void
}
