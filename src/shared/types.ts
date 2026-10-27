import type { OverlayId } from './overlays'
import type { PeakUpdate, ScanRequest, ScanStatusUpdate, SubtitleCountsUpdate } from './peak'

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
    /** Letzte Änderung (ms seit 1970), erkennt ersetzte Dateien gleicher Größe */
    modifiedMs: number
    /** Zugehörige externe Untertiteldateien (Subs-Ordner oder gleichnamige Dateien daneben) */
    externalSubtitles: ExternalSubtitleFile[]
    /** Beschreibung aus einer .txt daneben (gleicher Name, auch mit JDownloader-Zusätzen) */
    description: DescriptionFile | null
    /** Vorschaubild (.jpg) daneben, gleicher Name wie bei der Beschreibung */
    image: string | null
}

export interface DescriptionFile {
    path: string
    /** Anfang des Texts für die Vorschau */
    preview: string
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

/** Manuelle Wahl in der Oberfläche: ein Typ (Spur wird sicher übernommen) oder `removed` (Spur fliegt raus) */
export type SubtitleOverride = SubtitleType | 'removed'

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
    /** Manuelle Wahl aus der Oberfläche; schlägt Sprachfilter und Duplikat-Entfernung */
    typeOverride?: SubtitleOverride
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
    /** Episodenbild von TMDB als `<Zielname>-thumb.jpg` speichern (nur mit zugeordneter Serie) */
    saveThumbnails: boolean
    /** Cover, Staffelposter, Logo, Backdrop und Landscape aus dem Bilder-Tab in den Output-Ordner schreiben */
    saveArtwork: boolean
}

/** `media`: Filme und Serien, `youtube`: Downloads von JDownloader */
export type AppMode = 'media' | 'youtube'

export interface Settings {
    mode: AppMode
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
    /** TMDB API-Key (v3) oder Read Access Token; leer = keine TMDB-Anbindung */
    tmdbApiKey: string
    /** Persönlicher Fanart.tv-API-Key; leer = nur TMDB als Bildquelle */
    fanartApiKey: string
    /** Fehlende Folgen der erkannten Staffeln in der Dateiliste zeigen (und deren s/w-Bild exportieren können) */
    showMissingEpisodes: boolean
    pipeline: PipelineOptions
}

export interface TmdbShow {
    id: number
    name: string
    originalName: string
    year: number | null
    overview: string
    posterPath: string | null
}

/** Film bei TMDB, gleiche Felder wie eine Serie (Titel, Originaltitel, Jahr aus dem Kinostart) */
export type TmdbMovie = TmdbShow

export interface TmdbEpisode {
    season: number
    episode: number
    title: string
    stillPath: string | null
    /** Erstausstrahlung laut TMDB (YYYY-MM-DD) */
    airDate: string | null
}

export interface TmdbSeasonSummary {
    season: number
    name: string
    episodeCount: number
}

/** Ein Bild (Still) einer Episode bei TMDB */
export interface TmdbImage {
    path: string
    width: number
    height: number
}

export type ArtworkKind = 'poster' | 'logo' | 'backdrop' | 'landscape'

/** Ein Bildvorschlag von TMDB oder Fanart.tv */
export interface ArtworkCandidate {
    source: 'tmdb' | 'fanart'
    /** Bild in voller Größe (für den Export) */
    url: string
    /** Kleinere Fassung für Vorschau und Auswahl */
    previewUrl: string
    /** Sprache des Bildtexts, `null` = ohne Text */
    lang: string | null
    width?: number
    height?: number
    /** Bewertung (TMDB) bzw. Likes (Fanart.tv) */
    score: number
    /** Backdrop, das zusätzlich als Landscape angeboten wird */
    fromBackdrop?: boolean
}

export interface ArtworkCandidates {
    poster: ArtworkCandidate[]
    logo: ArtworkCandidate[]
    backdrop: ArtworkCandidate[]
    landscape: ArtworkCandidate[]
    /** Staffelposter je Staffelnummer (nur Serien) */
    seasons: Record<number, ArtworkCandidate[]>
}

export interface ArtworkRequest {
    kind: 'tv' | 'movie'
    tmdbId: number
    /** Staffeln, für die Poster geladen werden */
    seasons: number[]
}

/** Antwort auf `artworkCandidates`; Fehler einer Quelle landen in `warnings`, die andere liefert trotzdem */
export interface ArtworkLoadResult {
    candidates: ArtworkCandidates
    warnings: string[]
}

/** Ein Bild, das in den Output-Ordner geschrieben wird */
export interface ArtworkJob {
    fileName: string
    url: string
    /** `missing`: Episodenbild einer fehlenden Folge, schwarz-weiß mit Vignette */
    kind: ArtworkKind | 'missing'
    /** Nur bei Postern: Overlays, die darübergelegt werden */
    overlays: OverlayId[]
}

export interface ArtworkResult {
    fileName: string
    ok: boolean
    message?: string
}

/** Antwort der TMDB-Aufrufe: Daten oder eine verständliche Fehlermeldung */
export type TmdbResult<T> = { ok: true; data: T } | { ok: false; error: string }

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
    /** Episodenbild, das als `<Zielname>-thumb.jpg` gespeichert wird */
    thumbUrl?: string
    /** Beschreibung (.txt), landet bei „Metadaten bereinigen“ im Container */
    descriptionPath?: string
    /** Vorschaubild (.jpg), wird im YouTube-Modus als `<Zielname>.jpg` kopiert */
    imagePath?: string
    /** YouTube-Modus: Beschreibung und Bild gleichnamig neben die MKV kopieren */
    copySidecars?: boolean
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
    /** Ergebnis der Bilder (Cover, Staffelposter …), falls welche mitgeschrieben wurden */
    artwork?: ArtworkResult[]
}

export interface MediaManagerApi {
    selectFolder(defaultPath?: string): Promise<string | null>
    selectExecutable(defaultPath?: string): Promise<string | null>
    getSettings(): Promise<Settings>
    saveSettings(settings: Settings): Promise<Settings>
    checkFfmpeg(): Promise<FfmpegStatus>
    scan(dir: string): Promise<MediaFile[]>
    analyze(requestId: number, files: MediaFile[]): Promise<void>
    prefetchScans(requests: ScanRequest[]): Promise<void>
    tmdbSearch(query: string, year: number | null): Promise<TmdbResult<TmdbShow[]>>
    tmdbSearchMovie(query: string, year: number | null): Promise<TmdbResult<TmdbMovie[]>>
    tmdbSeasons(showId: number): Promise<TmdbResult<TmdbSeasonSummary[]>>
    tmdbSeason(showId: number, season: number): Promise<TmdbResult<TmdbEpisode[]>>
    tmdbEpisodeImages(showId: number, season: number, episode: number): Promise<TmdbResult<TmdbImage[]>>
    tmdbGenres(kind: 'tv' | 'movie', id: number): Promise<TmdbResult<string[]>>
    tmdbTest(apiKey: string): Promise<TmdbResult<true>>
    fanartTest(apiKey: string): Promise<TmdbResult<true>>
    artworkCandidates(request: ArtworkRequest): Promise<TmdbResult<ArtworkLoadResult>>
    exportArtwork(jobs: ArtworkJob[], outputDir: string): Promise<ArtworkResult[]>
    listOutput(dir: string): Promise<string[]>
    diskSpace(dir: string): Promise<DiskSpace | null>
    apply(jobs: ApplyJob[], outputDir: string, artwork: ArtworkJob[]): Promise<ApplySummary>
    cancelApply(): Promise<void>
    openPath(path: string): Promise<void>
    openExternal(url: string): Promise<void>
    onAnalysis(listener: (event: AnalysisEvent) => void): () => void
    onApplyProgress(listener: (progress: ApplyProgress) => void): () => void
    onApplyFileDone(listener: (result: ApplyFileResult) => void): () => void
    onPeakUpdate(listener: (update: PeakUpdate) => void): () => void
    onSubtitleCounts(listener: (update: SubtitleCountsUpdate) => void): () => void
    onScanStatus(listener: (update: ScanStatusUpdate) => void): () => void
}
