import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
    inputDir: '',
    outputDir: '',
    audioBranding: '[Sky Mix]',
    languages: ['de', 'en'],
    unknownLanguage: 'de',
    audioOrder: ['truehd_atmos', 'eac3_atmos', 'dts_x', 'truehd', 'dts_hd_ma', 'dts_hd_hr', 'eac3', 'dts', 'ac3', 'aac', 'pcm'],
    subtitlePriority: ['forced', 'normal', 'cc', 'sdh'],
    subtitleOrder: ['srt', 'pgs', 'pgsdev', 'ass', 'vobsub'],
    normalizeMinGain: 1.0,
    normalizeMaxGain: 20,
    normalizeFormats: ['dts', 'eac3', 'ac3', 'opus', 'aac', 'pcm'],
    normalizeChannels: [2, 6],
    defaultSource: 'Web',
    videoCodec: 'libx264',
    videoEncodeArgs: '-crf 18 -preset slow -x264-params ref=5:bframes=5',
    ffmpegPath: '',
    ffprobePath: '',
    spaceWarningGb: 10,
    concurrency: 2,
    tmdbApiKey: '',
    fanartApiKey: '',
    pipeline: {
        filterLanguages: true,
        sortTracks: true,
        renameTracks: true,
        dedupeSubtitles: true,
        mergeSubtitles: true,
        normalize: true,
        renameFile: true,
        cleanMetadata: true,
        encodeVideo: false,
        saveThumbnails: true,
        saveArtwork: true
    }
}

/** Ergänzt fehlende Felder (z. B. nach einem Update) mit den Standardwerten. */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...stored,
        pipeline: { ...DEFAULT_SETTINGS.pipeline, ...stored?.pipeline }
    }
}
