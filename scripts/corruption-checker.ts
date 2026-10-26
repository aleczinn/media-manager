#!/usr/bin/env node

/**
 * corruption-checker.ts
 *
 * Prüft eine einzelne Mediendatei oder rekursiv ein komplettes Verzeichnis
 * auf Container- und Streamfehler.
 *
 * Beispiele:
 *
 * Quick Check (Standard):
 *   pnpm run check -- "P:\Filme"
 *
 * Einzelne Datei:
 *   pnpm run check -- "P:\Filme\Krimi\Legend (2015)\Legend (2015).mkv"
 *
 * Vollständiger Decode-Test:
 *   pnpm run check -- "P:\Filme" --full
 *
 * Vollständiger Decode-Test mit Hardwarebeschleunigung:
 *   pnpm run check -- "P:\Filme" --full --gpu=cuda
 *
 * Modi:
 *
 *   Quick:
 *     Liest Container und Streams vollständig, decodiert Video/Audio
 *     jedoch nicht. Dadurch wesentlich schneller.
 *
 *   Full:
 *     Decodiert alle Video- und Audiospuren vollständig.
 *     Erkennt dadurch zusätzlich Decoderfehler in H.264, HEVC, AV1,
 *     TrueHD, DTS usw.
 *
 * Exit Codes:
 *
 *   0 = alle Dateien OK
 *   1 = mindestens eine fehlerhafte Datei
 *   2 = Script-/FFmpeg-Problem
 */

import { spawn } from 'node:child_process'
import {
    existsSync,
    readdirSync,
    statSync
} from 'node:fs'
import {
    extname,
    resolve
} from 'node:path'

import { BLUE, PURPLE, RESET } from './ansi'

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set([
    '.mkv',
    '.mp4',
    '.m4v',
    '.avi',
    '.mov',
    '.webm',
    '.ts',
    '.m2ts',
    '.mpg',
    '.mpeg',
    '.wmv'
])

/**
 * Bekannte Meldungen, die wir nicht als Beschädigung werten.
 *
 * Die Liste kann später erweitert werden, falls bei deiner Sammlung
 * harmlose FFmpeg-Warnungen auftauchen.
 */
const IGNORED_PATTERNS: RegExp[] = [
    /non monotonically increasing dts/i,
    /Application provided invalid.*timestamp/i
]

type Gpu =
    | 'none'
    | 'cuda'
    | 'qsv'
    | 'd3d11va';

interface Options {
    input: string;
    full: boolean;
    gpu: Gpu;
}

interface CheckResult {
    ok: boolean;
    errorLines: string[];
}

interface FileResult extends CheckResult {
    file: string;
    durationSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Options {
    const args = argv.slice(2)

    // pnpm/ts-node-dev kann "--" an das Script weiterreichen.
    // Das ignorieren wir einfach.
    const input = args.find(
        (arg) =>
            arg !== '--' &&
            !arg.startsWith('--')
    )

    const full = args.includes('--full')

    const gpuArg = args.find(
        (arg) => arg.startsWith('--gpu=')
    )

    const gpu =
        (gpuArg?.split('=')[1] as Gpu) ??
        'none'

    const validGpus: Gpu[] = [
        'none',
        'cuda',
        'qsv',
        'd3d11va'
    ]

    if (!input) {
        console.error('')
        console.error(
            'Nutzung:'
        )
        console.error(
            '  pnpm run check -- "<Datei oder Verzeichnis>" [--full] [--gpu=cuda|qsv|d3d11va]'
        )
        console.error('')

        process.exit(2)
    }

    if (!validGpus.includes(gpu)) {
        console.error(
            `Ungültige GPU: ${gpu}`
        )

        console.error(
            'Erlaubt: cuda, qsv, d3d11va'
        )

        process.exit(2)
    }

    if (!full && gpu !== 'none') {
        console.error(
            '--gpu kann nur zusammen mit --full verwendet werden.'
        )

        process.exit(2)
    }

    const resolved = resolve(input)

    if (!existsSync(resolved)) {
        console.error(
            `Pfad nicht gefunden: ${resolved}`
        )

        process.exit(2)
    }

    return {
        input: resolved,
        full,
        gpu
    }
}

// ---------------------------------------------------------------------------
// Dateien rekursiv suchen
// ---------------------------------------------------------------------------

function findVideoFiles(
    input: string
): string[] {
    const stat = statSync(input)

    // Einzelne Datei
    if (stat.isFile()) {
        const extension =
            extname(input).toLowerCase()

        return VIDEO_EXTENSIONS.has(extension)
            ? [input]
            : []
    }

    if (!stat.isDirectory()) {
        return []
    }

    const result: string[] = []

    function walk(directory: string): void {
        const entries = readdirSync(
            directory,
            {
                withFileTypes: true
            }
        )

        for (const entry of entries) {
            const fullPath = resolve(
                directory,
                entry.name
            )

            if (entry.isDirectory()) {
                walk(fullPath)
                continue
            }

            if (!entry.isFile()) {
                continue
            }

            const extension =
                extname(entry.name)
                    .toLowerCase()

            if (
                VIDEO_EXTENSIONS.has(
                    extension
                )
            ) {
                result.push(fullPath)
            }
        }
    }

    walk(input)

    // Reproduzierbare alphabetische Reihenfolge
    result.sort((a, b) =>
        a.localeCompare(
            b,
            undefined,
            {
                numeric: true,
                sensitivity: 'base'
            }
        )
    )

    return result
}

// ---------------------------------------------------------------------------
// ffprobe
// ---------------------------------------------------------------------------

function getDurationSeconds(
    file: string
): Promise<number | null> {
    return new Promise(
        (resolvePromise) => {
            const proc = spawn(
                'ffprobe',
                [
                    '-v',
                    'error',

                    '-show_entries',
                    'format=duration',

                    '-of',
                    'default=noprint_wrappers=1:nokey=1',

                    file
                ],
                {
                    windowsHide: true
                }
            )

            let output = ''

            proc.stdout.on(
                'data',
                (chunk) => {
                    output +=
                        chunk.toString()
                }
            )

            proc.on(
                'close',
                () => {
                    const seconds =
                        parseFloat(
                            output.trim()
                        )

                    resolvePromise(
                        Number.isFinite(
                            seconds
                        )
                            ? seconds
                            : null
                    )
                }
            )

            proc.on(
                'error',
                () => {
                    resolvePromise(null)
                }
            )
        }
    )
}

// ---------------------------------------------------------------------------
// Zeitformatierung
// ---------------------------------------------------------------------------

function formatTime(
    seconds: number
): string {
    const safeSeconds =
        Math.max(0, seconds)

    const h = Math.floor(
        safeSeconds / 3600
    )

    const m = Math.floor(
        (safeSeconds % 3600) / 60
    )

    const s = Math.floor(
        safeSeconds % 60
    )

    return [h, m, s]
        .map((value) =>
            String(value).padStart(
                2,
                '0'
            )
        )
        .join(':')
}

// ---------------------------------------------------------------------------
// Fortschrittsanzeige
// ---------------------------------------------------------------------------

function renderProgress(
    currentSeconds: number,
    totalSeconds: number | null
): void {
    if (
        totalSeconds === null ||
        totalSeconds <= 0
    ) {
        process.stdout.write(
            `\rGeprüft: ${formatTime(
                currentSeconds
            )}   `
        )

        return
    }

    const pct = Math.min(
        100,
        Math.max(
            0,
            (currentSeconds /
                totalSeconds) *
            100
        )
    )

    const barWidth = 30

    const filled = Math.min(
        barWidth,
        Math.round(
            (pct / 100) *
            barWidth
        )
    )

    const bar =
        '█'.repeat(filled) +
        '░'.repeat(
            barWidth - filled
        )

    process.stdout.write(
        `\r[${bar}] ` +
        `${pct.toFixed(1)}%  ` +
        `(${formatTime(
            currentSeconds
        )} / ` +
        `${formatTime(
            totalSeconds
        )})   `
    )
}

// ---------------------------------------------------------------------------
// FFmpeg Argumente
// ---------------------------------------------------------------------------

function buildFfmpegArgs(
    file: string,
    opts: Options
): string[] {
    const args: string[] = [
        '-hide_banner',

        // Nur tatsächliche Fehler auf stderr
        '-v',
        'repeat+error',

        // Timestamps notfalls generieren
        '-fflags',
        '+genpts'
    ]

    // Hardware-Decoding nur beim Full Check
    if (
        opts.full &&
        opts.gpu !== 'none'
    ) {
        args.push(
            '-hwaccel',
            opts.gpu
        )
    }

    args.push(
        '-i',
        file
    )

    if (opts.full) {
        /*
         * FULL CHECK
         *
         * Video- und Audiospuren werden vollständig
         * decodiert.
         *
         * Das ? bedeutet:
         * Fehlt Video oder Audio, ist das kein Fehler
         * des FFmpeg-Kommandos.
         */
        args.push(
            '-map',
            '0:v?',

            '-map',
            '0:a?'
        )
    } else {
        /*
         * QUICK CHECK
         *
         * Alle Streams werden gelesen, aber nicht
         * decodiert.
         */
        args.push(
            '-map',
            '0',

            '-c',
            'copy'
        )
    }

    /*
     * Fortschritt auf stdout.
     *
     * Wichtig:
     * -progress steht vor dem Output.
     */
    args.push(
        '-progress',
        'pipe:1',

        '-nostats',

        '-f',
        'null',

        '-'
    )

    return args
}

// ---------------------------------------------------------------------------
// FFmpeg Fehlerzeile verarbeiten
// ---------------------------------------------------------------------------

function processErrorLine(
    line: string,
    errorLines: string[]
): void {
    const trimmed =
        line.trim()

    if (!trimmed) {
        return
    }

    const ignored =
        IGNORED_PATTERNS.some(
            (pattern) =>
                pattern.test(trimmed)
        )

    if (ignored) {
        return
    }

    errorLines.push(trimmed)
}

// ---------------------------------------------------------------------------
// FFmpeg Progress-Zeile verarbeiten
// ---------------------------------------------------------------------------

function processProgressLine(
    line: string,
    totalSeconds: number | null
): void {
    /*
     * Wir verwenden bevorzugt:
     *
     * out_time=00:42:15.123456
     *
     * Das ist wesentlich verständlicher als
     * out_time_us/out_time_ms.
     */

    const match = line.match(
        /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)$/
    )

    if (!match) {
        return
    }

    const hours =
        Number(match[1])

    const minutes =
        Number(match[2])

    const seconds =
        Number(match[3])

    const currentSeconds =
        hours * 3600 +
        minutes * 60 +
        seconds

    renderProgress(
        currentSeconds,
        totalSeconds
    )
}

// ---------------------------------------------------------------------------
// Einzelne Datei prüfen
// ---------------------------------------------------------------------------

function runCheck(
    file: string,
    opts: Options,
    totalSeconds: number | null
): Promise<CheckResult> {
    return new Promise(
        (resolvePromise) => {
            const args =
                buildFfmpegArgs(
                    file,
                    opts
                )

            const proc = spawn(
                'ffmpeg',
                args,
                {
                    windowsHide: true
                }
            )

            const errorLines: string[] =
                []

            let stderrBuffer = ''
            let stdoutBuffer = ''

            let settled = false

            // ---------------------------------------------------------------
            // FFmpeg Fehler
            // ---------------------------------------------------------------

            proc.stderr.on(
                'data',
                (chunk) => {
                    stderrBuffer +=
                        chunk.toString()

                    const lines =
                        stderrBuffer.split(
                            /\r?\n/
                        )

                    stderrBuffer =
                        lines.pop() ?? ''

                    for (
                        const line of lines
                        ) {
                        processErrorLine(
                            line,
                            errorLines
                        )
                    }
                }
            )

            // ---------------------------------------------------------------
            // FFmpeg Progress
            // ---------------------------------------------------------------

            proc.stdout.on(
                'data',
                (chunk) => {
                    stdoutBuffer +=
                        chunk.toString()

                    const lines =
                        stdoutBuffer.split(
                            /\r?\n/
                        )

                    stdoutBuffer =
                        lines.pop() ?? ''

                    for (
                        const line of lines
                        ) {
                        processProgressLine(
                            line,
                            totalSeconds
                        )
                    }
                }
            )

            // ---------------------------------------------------------------
            // FFmpeg beendet
            // ---------------------------------------------------------------

            proc.on(
                'close',
                (code) => {
                    if (settled) {
                        return
                    }

                    settled = true

                    /*
                     * Eventuell blieb die letzte
                     * stderr-Zeile ohne Newline übrig.
                     */
                    if (
                        stderrBuffer.trim()
                    ) {
                        processErrorLine(
                            stderrBuffer,
                            errorLines
                        )
                    }

                    /*
                     * Progress-Zeile ebenfalls
                     * noch verarbeiten.
                     */
                    if (
                        stdoutBuffer.trim()
                    ) {
                        processProgressLine(
                            stdoutBuffer,
                            totalSeconds
                        )
                    }

                    /*
                     * Wenn FFmpeg nicht sauber beendet
                     * wurde, aber keine eigentliche
                     * Fehlermeldung vorliegt.
                     */
                    if (
                        code !== 0 &&
                        code !== null &&
                        errorLines.length === 0
                    ) {
                        errorLines.push(
                            `ffmpeg beendete sich mit Exit Code ${code}`
                        )
                    }

                    resolvePromise({
                        ok:
                            errorLines.length ===
                            0,

                        errorLines
                    })
                }
            )

            // ---------------------------------------------------------------
            // FFmpeg konnte gar nicht gestartet werden
            // ---------------------------------------------------------------

            proc.on(
                'error',
                (err) => {
                    if (settled) {
                        return
                    }

                    settled = true

                    resolvePromise({
                        ok: false,

                        errorLines: [
                            `Konnte ffmpeg nicht starten: ${err.message}`
                        ]
                    })
                }
            )
        }
    )
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const opts =
        parseArgs(process.argv)

    const files =
        findVideoFiles(
            opts.input
        )

    if (files.length === 0) {
        console.error(
            'Keine unterstützten Videodateien gefunden.'
        )

        process.exit(2)
    }

    const isDirectory =
        statSync(
            opts.input
        ).isDirectory()

    console.log('')

    console.log(
        isDirectory
            ? `Verzeichnis: ${opts.input}`
            : `Datei: ${opts.input}`
    )

    console.log(
        `Modus: ${
            opts.full
                ? `${PURPLE}Voller Decode Test${RESET}`
                : `${BLUE}Stream Copy (schnell)${RESET}`
        }${
            opts.full &&
            opts.gpu !== 'none'
                ? ` mit GPU (${opts.gpu})`
                : ''
        }`
    )

    console.log(
        `Gefundene Videodateien: ${files.length}`
    )

    console.log('')

    const results: FileResult[] =
        []

    const startedAt =
        Date.now()

    // -----------------------------------------------------------------------
    // Dateien nacheinander prüfen
    // -----------------------------------------------------------------------

    for (
        let index = 0;
        index < files.length;
        index++
    ) {
        const file =
            files[index]

        console.log(
            '============================================================'
        )

        console.log(
            `[${index + 1}/${files.length}] ${file}`
        )

        console.log(
            '============================================================'
        )

        /*
         * Erst Dauer bestimmen.
         */
        const durationSeconds =
            await getDurationSeconds(
                file
            )

        /*
         * WICHTIG:
         *
         * Progress-Bar SOFORT anzeigen.
         * Dadurch sieht das Programm nicht eingefroren
         * aus, während FFmpeg startet.
         */
        renderProgress(
            0,
            durationSeconds
        )

        /*
         * Eigentliche Prüfung.
         */
        const result =
            await runCheck(
                file,
                opts,
                durationSeconds
            )

        /*
         * Die aktuelle Progress-Zeile beenden.
         */
        process.stdout.write(
            '\n'
        )

        results.push({
            file,
            durationSeconds,
            ...result
        })

        if (result.ok) {
            console.log(
                '\n✅ OK — keine Fehler gefunden.'
            )
        } else {
            console.log(
                `\n❌ FEHLER — ${result.errorLines.length} Fehlermeldung(en) gefunden.`
            )

            console.log('')

            console.log('Erste Fehlerzeilen:')

            for (
                const line of
                result.errorLines.slice(
                    0,
                    5
                )
                ) {
                console.log(
                    `  ${line}`
                )
            }

            if (
                result.errorLines.length >
                5
            ) {
                console.log(
                    `  ... und ${
                        result.errorLines.length -
                        5
                    } weitere.`
                )
            }
        }

        console.log('')
    }

    // -----------------------------------------------------------------------
    // Gesamtauswertung
    // -----------------------------------------------------------------------

    const elapsedSeconds =
        (Date.now() -
            startedAt) /
        1000

    const failed =
        results.filter(
            (result) =>
                !result.ok
        )

    const successful =
        results.filter(
            (result) =>
                result.ok
        )

    console.log('')
    console.log(
        '============================================================'
    )

    console.log(
        'GESAMTAUSWERTUNG'
    )

    console.log(
        '============================================================'
    )

    console.log(
        `Geprüfte Dateien: ${results.length}`
    )

    console.log(
        `Erfolgreich:      ${successful.length}`
    )

    console.log(
        `Mit Fehlern:      ${failed.length}`
    )

    console.log(
        `Laufzeit:         ${formatTime(
            elapsedSeconds
        )}`
    )

    console.log('')

    // -----------------------------------------------------------------------
    // Alles OK
    // -----------------------------------------------------------------------

    if (failed.length === 0) {
        console.log(
            '✅ ALLES OK — keine fehlerhaften Dateien gefunden.'
        )

        process.exit(0)
    }

    // -----------------------------------------------------------------------
    // Fehlerhafte Dateien nochmals gesammelt anzeigen
    // -----------------------------------------------------------------------

    console.log(
        `❌ DATEIEN MIT PROBLEMEN (${failed.length}):`
    )

    console.log('')

    for (
        const result of failed
        ) {
        console.log(
            `• ${result.file}`
        )

        for (
            const error of
            result.errorLines.slice(
                0,
                3
            )
            ) {
            console.log(
                `    ${error}`
            )
        }

        if (
            result.errorLines.length >
            3
        ) {
            console.log(
                `    ... +${
                    result.errorLines.length -
                    3
                } weitere Fehler`
            )
        }

        console.log('')
    }

    process.exit(1)
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

main().catch(
    (error) => {
        console.error('')
        console.error(
            'Unerwarteter Fehler:'
        )

        console.error(error)

        process.exit(2)
    }
)