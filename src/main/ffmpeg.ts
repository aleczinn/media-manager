import { spawn, type ChildProcess } from 'node:child_process'
import type { FfmpegStatus, Settings } from '../shared/types'

export function resolveBinaries(settings: Settings): { ffmpeg: string; ffprobe: string } {
    return {
        ffmpeg: settings.ffmpegPath.trim() || 'ffmpeg',
        ffprobe: settings.ffprobePath.trim() || 'ffprobe'
    }
}

export interface RunOptions {
    onStdoutLine?: (line: string) => void
    onStderrLine?: (line: string) => void
    /** Wird mit dem gestarteten Prozess aufgerufen (z. B. zum Abbrechen) */
    onSpawn?: (child: ChildProcess) => void
}

export interface RunResult {
    code: number | null
    stdout: string
    stderrTail: string[]
}

function splitLines(onLine: (line: string) => void): (chunk: Buffer) => void {
    let buffer = ''
    return (chunk) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split(/\r?\n|\r/)
        buffer = lines.pop() ?? ''
        lines.forEach(onLine)
    }
}

export function runProcess(bin: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { windowsHide: true })
        options.onSpawn?.(child)

        let stdout = ''
        const stderrTail: string[] = []

        child.stdout.on(
            'data',
            splitLines((line) => {
                stdout += line + '\n'
                options.onStdoutLine?.(line)
            })
        )
        child.stderr.on(
            'data',
            splitLines((line) => {
                stderrTail.push(line)
                if (stderrTail.length > 30) stderrTail.shift()
                options.onStderrLine?.(line)
            })
        )

        child.on('error', reject)
        child.on('close', (code) => resolve({ code, stdout, stderrTail }))
    })
}

/** Liest `out_time_us` aus der `-progress pipe:1`-Ausgabe von ffmpeg. */
export function parseProgressLine(line: string): { outTimeSec?: number; speed?: number } {
    const [key, value] = line.split('=')
    if (key === 'out_time_us' || key === 'out_time_ms') {
        // Beide Felder sind trotz des Namens Mikrosekunden
        const micros = Number(value)
        if (Number.isFinite(micros) && micros >= 0) return { outTimeSec: micros / 1_000_000 }
    }
    if (key === 'speed') {
        const speed = parseFloat(value)
        if (Number.isFinite(speed) && speed > 0) return { speed }
    }
    return {}
}

async function readVersion(bin: string): Promise<string | null> {
    try {
        const { code, stdout } = await runProcess(bin, ['-version'])
        if (code !== 0) return null
        const firstLine = stdout.split('\n')[0] ?? ''
        return firstLine.match(/version\s+(\S+)/)?.[1] ?? firstLine
    } catch {
        return null
    }
}

export async function checkFfmpeg(settings: Settings): Promise<FfmpegStatus> {
    const { ffmpeg, ffprobe } = resolveBinaries(settings)
    const [ffmpegVersion, ffprobeVersion] = await Promise.all([readVersion(ffmpeg), readVersion(ffprobe)])
    return { ffmpeg: ffmpegVersion, ffprobe: ffprobeVersion }
}
