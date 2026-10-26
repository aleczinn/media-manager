/** Vorgegebene Auswahlwerte für die Einstellungen */

export interface Option<T extends string | number = string> {
    value: T
    label: string
}

/** Audio-Typen (Schlüssel aus `getAudioType(track, false)`) */
export const AUDIO_FORMATS: Option[] = [
    { value: 'truehd_atmos', label: 'Dolby TrueHD Atmos' },
    { value: 'eac3_atmos', label: 'Dolby Digital Plus Atmos' },
    { value: 'dts_x', label: 'DTS:X' },
    { value: 'truehd', label: 'Dolby TrueHD' },
    { value: 'dts_hd_ma', label: 'DTS-HD MA' },
    { value: 'dts_hd_hr', label: 'DTS-HD HR' },
    { value: 'eac3', label: 'Dolby Digital Plus (E-AC3)' },
    { value: 'dts', label: 'DTS' },
    { value: 'ac3', label: 'Dolby Digital (AC3)' },
    { value: 'aac', label: 'AAC' },
    { value: 'opus', label: 'Opus' },
    { value: 'pcm', label: 'PCM' }
]

/** Die normalisierte Spur wird als AC3 geschrieben, das kann maximal 5.1 */
export const NORMALIZE_CHANNELS: Option<number>[] = [
    { value: 2, label: 'Stereo (2.0)' },
    { value: 6, label: '5.1' }
]

export const SUBTITLE_TYPES: Option[] = [
    { value: 'forced', label: 'Erzwungen (Forced)' },
    { value: 'normal', label: 'Normal' },
    { value: 'cc', label: 'CC' },
    { value: 'sdh', label: 'SDH' }
]

export const SUBTITLE_FORMATS: Option[] = [
    { value: 'srt', label: 'SRT' },
    { value: 'pgs', label: 'PGS' },
    { value: 'pgsdev', label: 'PGS (pgsdev)' },
    { value: 'ass', label: 'ASS/SSA' },
    { value: 'vobsub', label: 'VobSub' }
]

export const CONCURRENCY_OPTIONS: Option<number>[] = [
    { value: 1, label: '1 (für HDDs)' },
    { value: 2, label: '2 (Standard)' },
    { value: 3, label: '3' },
    { value: 4, label: '4' }
]

export const SOURCES: string[] = ['Web', 'Amazon', 'Netflix', 'Disney+', 'ATVP', 'RTL+', 'BluRay', 'UHD']

export const VIDEO_CODECS: Option[] = [
    { value: 'libx264', label: 'H.264 (libx264)' },
    { value: 'libx265', label: 'H.265 (libx265)' },
    { value: 'h264_nvenc', label: 'H.264 NVIDIA (h264_nvenc)' },
    { value: 'hevc_nvenc', label: 'H.265 NVIDIA (hevc_nvenc)' },
    { value: 'h264_qsv', label: 'H.264 Intel (h264_qsv)' },
    { value: 'hevc_qsv', label: 'H.265 Intel (hevc_qsv)' },
    { value: 'libsvtav1', label: 'AV1 (libsvtav1)' }
]

/**
 * Bringt eine gespeicherte Reihenfolge in die vollständige Liste:
 * gespeicherte Werte zuerst (in ihrer Reihenfolge), fehlende bekannte Werte hinten dran.
 */
export function completeOrder(stored: string[], options: Option[]): string[] {
    const known = options.map((option) => option.value)
    return [...stored.filter((value) => known.includes(value)), ...known.filter((value) => !stored.includes(value))]
}

export function labelOf(options: Option[], value: string): string {
    return options.find((option) => option.value === value)?.label ?? value
}
