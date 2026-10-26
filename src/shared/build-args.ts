import type { TrackPlan } from './pipeline'
import type { Settings } from './types'

export interface BuildArgsInput {
    inputPath: string
    outputPath: string
    plan: TrackPlan
    settings: Settings
    /** Verstärkung für die normalisierte Spur; `null` = keine normalisierte Spur */
    gainDb: number | null
    /** Inhalt einer Sidecar-`.txt` neben der Quelldatei */
    description: string | null
}

/** Untertitelformate, die sich nicht direkt in MKV kopieren lassen. */
function subtitleCodec(codecId: string): string {
    const codec = codecId.toLowerCase()
    return codec.includes('tx3g') || codec.includes('mov_text') ? 'srt' : 'copy'
}

/** Formatiert den Gain wie volumedetect (max. eine Nachkommastelle reicht). */
export function formatGain(gainDb: number): string {
    return `${Math.round(gainDb * 10) / 10}dB`
}

/** Baut die ffmpeg-Argumentliste für eine Datei (Port von `buildScript` aus dem alten Projekt). */
export function buildFfmpegArgs({ inputPath, outputPath, plan, settings, gainDb, description }: BuildArgsInput): string[] {
    const { pipeline, unknownLanguage } = settings
    const args: string[] = ['-hide_banner', '-nostdin', '-y', '-fflags', '+genpts', '-i', inputPath]

    // Externe Untertiteldateien als weitere Eingaben (1…n), in der Reihenfolge ihrer ersten Verwendung
    const externalInputs = new Map<string, number>()
    for (const { source } of plan.subtitle) {
        if (source.externalPath && !externalInputs.has(source.externalPath)) {
            externalInputs.set(source.externalPath, externalInputs.size + 1)
            args.push('-i', source.externalPath)
        }
    }
    const inputOf = (externalPath?: string) => (externalPath ? externalInputs.get(externalPath)! : 0)

    if (pipeline.cleanMetadata) {
        args.push('-metadata', 'title=')
        if (description) {
            args.push(
                '-metadata',
                `description=${description}`,
                '-metadata',
                `comment=${description}`,
                '-metadata',
                `synopsis=${description}`
            )
        }
    }

    // Video
    plan.video.forEach((track, i) => {
        args.push('-map', `0:v:${track.source.index}`)
        if (pipeline.cleanMetadata) args.push(`-map_metadata:s:v:${i}`, '-1')

        if (pipeline.encodeVideo) {
            args.push(`-c:v:${i}`, settings.videoCodec, ...settings.videoEncodeArgs.split(/\s+/).filter(Boolean))
        } else {
            args.push(`-c:v:${i}`, 'copy')
        }
    })

    // Normalisierte Spur als erste Tonspur
    const normalized = plan.normalize && gainDb !== null ? plan.normalize : null
    if (normalized && gainDb !== null) {
        args.push(
            '-filter_complex',
            `[0:a:${normalized.source.index}]volume=${formatGain(gainDb)}[peak_normalized]`,
            '-map',
            '[peak_normalized]',
            '-c:a:0',
            'ac3',
            '-b:a:0',
            normalized.bitrate,
            '-metadata:s:a:0',
            `title=${normalized.title}`,
            '-metadata:s:a:0',
            `language=${normalized.language}`,
            '-disposition:a:0',
            '0'
        )
    }

    // Originale Tonspuren
    const offset = normalized ? 1 : 0
    plan.audio.forEach((track, index) => {
        const i = index + offset
        args.push(
            '-map',
            `0:a:${track.source.index}`,
            `-c:a:${i}`,
            'copy',
            `-metadata:s:a:${i}`,
            `title=${track.title}`,
            `-metadata:s:a:${i}`,
            `language=${track.language || unknownLanguage || 'und'}`,
            `-disposition:a:${i}`,
            '0'
        )
    })

    // Untertitel
    plan.subtitle.forEach((track, i) => {
        args.push(
            '-map',
            `${inputOf(track.source.externalPath)}:s:${track.source.index}`,
            `-c:s:${i}`,
            subtitleCodec(track.source.codecId),
            `-metadata:s:s:${i}`,
            `title=${track.title}`,
            `-metadata:s:s:${i}`,
            `language=${track.language || unknownLanguage || 'und'}`,
            `-disposition:s:${i}`,
            track.dispositions.length > 0 ? track.dispositions.join('+') : '0'
        )
    })

    // Anhänge (z. B. Schriften für ASS-Untertitel) mitnehmen, falls vorhanden
    args.push('-map', '0:t?', '-c:t', 'copy')

    args.push('-max_interleave_delta', '0')
    if (pipeline.encodeVideo) args.push('-fps_mode', 'cfr')

    args.push('-progress', 'pipe:1', '-nostats', '-f', 'matroska', outputPath)
    return args
}
