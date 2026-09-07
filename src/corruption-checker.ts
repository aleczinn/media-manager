#!/usr/bin/env node
/**
 * check-file.ts
 *
 * Prüft eine einzelne Video Datei auf Container und Stream Fehler.
 * Nutzung:
 *   npx tsx check-file.ts "P:\Filme\Animation\Sing (2016)\Sing (2016).mkv"
 *   npx tsx check-file.ts "Film.mkv" --full            (voller Decode Test)
 *   npx tsx check-file.ts "Film.mkv" --full --gpu=cuda (mit Hardwarebeschleunigung)
 *
 * Ausgabe:
 *   ✅ OK   -> Datei ist unauffällig
 *   ❌ FEHLER -> Datei hat echte Fehler, sollte ersetzt werden
 *
 * Exit Code: 0 = OK, 1 = Fehler gefunden, 2 = Script/ffmpeg Problem
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

// Bekannte, harmlose Meldungen, die NICHT als echter Fehler gewertet werden.
// Hier bei Bedarf weitere Muster ergänzen, wenn ihr Fehlalarme findet.
const IGNORED_PATTERNS: RegExp[] = [
    /non monotonically increasing dts/i,
    /Application provided invalid.*timestamp/i,
];

interface Options {
    file: string;
    full: boolean; // voller Decode Test statt nur Stream Copy
    gpu: "none" | "cuda" | "qsv" | "d3d11va";
}

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Options {
    const args = argv.slice(2);
    const file = args.find((a) => !a.startsWith("--"));
    const full = args.includes("--full");
    const gpuArg = args.find((a) => a.startsWith("--gpu="));
    const gpu = (gpuArg?.split("=")[1] as Options["gpu"]) ?? "none";

    if (!file) {
        console.error("Nutzung: check-file <Pfad zur Datei> [--full] [--gpu=cuda|qsv|d3d11va]");
        process.exit(2);
    }

    const resolved = resolve(file);
    if (!existsSync(resolved)) {
        console.error(`Datei nicht gefunden: ${resolved}`);
        process.exit(2);
    }

    return { file: resolved, full, gpu };
}

// ---------------------------------------------------------------------------
// ffprobe: Dauer ermitteln (für Fortschrittsanzeige)
// ---------------------------------------------------------------------------

function getDurationSeconds(file: string): Promise<number | null> {
    return new Promise((resolvePromise) => {
        const proc = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file,
        ]);

        let output = "";
        proc.stdout.on("data", (chunk) => (output += chunk.toString()));
        proc.on("close", () => {
            const seconds = parseFloat(output.trim());
            resolvePromise(Number.isFinite(seconds) ? seconds : null);
        });
        proc.on("error", () => resolvePromise(null));
    });
}

// ---------------------------------------------------------------------------
// Fortschrittsanzeige in der Konsole
// ---------------------------------------------------------------------------

function renderProgress(currentSeconds: number, totalSeconds: number | null): void {
    if (!totalSeconds) {
        process.stdout.write(`\rGeprüft: ${formatTime(currentSeconds)}   `);
        return;
    }
    const pct = Math.min(100, (currentSeconds / totalSeconds) * 100);
    const barWidth = 30;
    const filled = Math.round((pct / 100) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    process.stdout.write(
        `\r[${bar}] ${pct.toFixed(1)}%  (${formatTime(currentSeconds)} / ${formatTime(totalSeconds)})   `
    );
}

function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

// ---------------------------------------------------------------------------
// Hauptprüfung
// ---------------------------------------------------------------------------

interface CheckResult {
    ok: boolean;
    errorLines: string[];
}

function buildFfmpegArgs(opts: Options): string[] {
    const args: string[] = ["-v", "error", "-fflags", "+genpts"];

    if (opts.full && opts.gpu !== "none") {
        args.push("-hwaccel", opts.gpu);
    }

    args.push("-i", opts.file, "-map", "0");

    if (opts.full) {
        // Volles Decoding: nur Video und Audio, Untertitel/Anhänge ignorieren,
        // die keinen sinnvollen Decoder für den null Muxer haben.
        args[args.indexOf("-map") + 1] = undefined as unknown as string; // Platzhalter entfernen
        args.splice(args.indexOf("-map"), 2, "-map", "0:v", "-map", "0:a");
    } else {
        args.push("-c", "copy");
    }

    args.push("-f", "null", "-", "-progress", "pipe:1");
    return args;
}

function runCheck(opts: Options, totalSeconds: number | null): Promise<CheckResult> {
    return new Promise((resolvePromise) => {
        const args = buildFfmpegArgs(opts);
        const proc = spawn("ffmpeg", args);

        const errorLines: string[] = [];
        let stderrBuffer = "";

        proc.stderr.on("data", (chunk) => {
            stderrBuffer += chunk.toString();
            const lines = stderrBuffer.split("\n");
            stderrBuffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.trim()) continue;
                const isIgnored = IGNORED_PATTERNS.some((pattern) => pattern.test(line));
                if (!isIgnored) {
                    errorLines.push(line.trim());
                }
            }
        });

        // -progress pipe:1 schreibt strukturierte key=value Zeilen nach stdout
        let stdoutBuffer = "";
        proc.stdout.on("data", (chunk) => {
            stdoutBuffer += chunk.toString();
            const lines = stdoutBuffer.split("\n");
            stdoutBuffer = lines.pop() ?? "";

            for (const line of lines) {
                const match = line.match(/^out_time_ms=(\d+)/);
                if (match) {
                    const currentSeconds = Number(match[1]) / 1_000_000;
                    renderProgress(currentSeconds, totalSeconds);
                }
            }
        });

        proc.on("close", (code) => {
            process.stdout.write("\n");
            if (code !== 0 && code !== null && errorLines.length === 0) {
                // ffmpeg selbst ist abgestürzt/fehlgeschlagen, ohne dass wir Fehlerzeilen gesammelt haben
                errorLines.push(`ffmpeg beendete sich mit Exit Code ${code}`);
            }
            resolvePromise({ ok: errorLines.length === 0, errorLines });
        });

        proc.on("error", (err) => {
            errorLines.push(`Konnte ffmpeg nicht starten: ${err.message}`);
            resolvePromise({ ok: false, errorLines });
        });
    });
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

async function main() {
    const opts = parseArgs(process.argv);

    console.log(`Prüfe: ${opts.file}`);
    console.log(`Modus: ${opts.full ? "Voller Decode Test" : "Stream Copy (schnell)"}${opts.full && opts.gpu !== "none" ? ` mit GPU (${opts.gpu})` : ""}`);
    console.log("");

    const totalSeconds = await getDurationSeconds(opts.file);
    const result = await runCheck(opts, totalSeconds);

    console.log("");
    if (result.ok) {
        console.log("✅ OK — keine Fehler gefunden.");
        process.exit(0);
    } else {
        console.log(`❌ FEHLER — ${result.errorLines.length} Fehlermeldung(en) gefunden.`);
        console.log("");
        console.log("Erste Fehlerzeilen:");
        for (const line of result.errorLines.slice(0, 5)) {
            console.log(`  ${line}`);
        }
        if (result.errorLines.length > 5) {
            console.log(`  ... und ${result.errorLines.length - 5} weitere.`);
        }
        process.exit(1);
    }
}

main();