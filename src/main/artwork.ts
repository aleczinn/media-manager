import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import { landscapeCandidates, sortCandidates } from '../shared/artwork'
import { overlayFiles } from '../shared/overlays'
import type {
    ArtworkCandidate,
    ArtworkCandidates,
    ArtworkJob,
    ArtworkKind,
    ArtworkLoadResult,
    ArtworkRequest,
    ArtworkResult,
    Settings,
    TmdbResult
} from '../shared/types'
import { fanartMessage, getFanartArtwork, type FanartArtwork } from './fanart'
import { resolveBinaries, runProcess } from './ffmpeg'
import { downloadImage, getTmdbArtwork, getTmdbSeasonPosters, getTvdbId, TmdbError, wrap } from './tmdb'

const POSTER_SIZE = { width: 600, height: 900 }
const MAX_LANDSCAPE = { width: 1920, height: 1080 }

/** Ordner mit den Overlay-PNGs: im Build neben der App, beim Entwickeln im Repo */
function overlayDir(): string {
    return app.isPackaged ? path.join(process.resourcesPath, 'overlays') : path.join(app.getAppPath(), 'resources', 'overlays')
}

/** Sammelt die Vorschläge von TMDB und Fanart.tv; fällt eine Quelle aus, liefert die andere trotzdem */
export function loadArtworkCandidates(settings: Settings, request: ArtworkRequest): Promise<TmdbResult<ArtworkLoadResult>> {
    return wrap(async () => {
        const warnings: string[] = []
        const tmdbKey = settings.tmdbApiKey
        const fanartKey = settings.fanartApiKey.trim()

        const tmdb = getTmdbArtwork(tmdbKey, request.kind, request.tmdbId)
        const tmdbSeasons = Promise.all(
            request.kind === 'tv'
                ? request.seasons.map(async (season) => [season, await getTmdbSeasonPosters(tmdbKey, request.tmdbId, season)] as const)
                : []
        )

        const fanart = (async (): Promise<FanartArtwork | null> => {
            if (!fanartKey) return null
            try {
                const id = request.kind === 'tv' ? await getTvdbId(tmdbKey, request.tmdbId) : request.tmdbId
                if (!id) {
                    warnings.push('Fanart.tv: Für diese Serie ist keine TheTVDB-ID hinterlegt')
                    return null
                }
                return await getFanartArtwork(fanartKey, request.kind, id)
            } catch (error) {
                warnings.push(error instanceof TmdbError ? error.message : fanartMessage(error))
                return null
            }
        })()

        const [base, seasonPosters, extra] = await Promise.all([tmdb, tmdbSeasons, fanart])
        const merge = (kind: ArtworkKind, ...lists: (ArtworkCandidate[] | undefined)[]) =>
            sortCandidates(
                lists.flatMap((list) => list ?? []),
                kind
            )

        const candidates: ArtworkCandidates = {
            poster: merge('poster', base.poster, extra?.poster),
            logo: merge('logo', base.logo, extra?.logo),
            backdrop: merge('backdrop', base.backdrop, extra?.backdrop),
            landscape: landscapeCandidates(extra?.landscape ?? [], [...base.backdrop, ...(extra?.backdrop ?? [])]),
            seasons: Object.fromEntries(
                seasonPosters.map(([season, posters]) => [season, merge('poster', posters, extra?.seasons[season])])
            )
        }
        return { candidates, warnings }
    })
}

/** ffmpeg-Filter je Bildart: Poster gestreckt auf 600×900 plus Overlays, Querformate höchstens 1920×1080 */
function filterFor(kind: ArtworkKind, overlayCount: number): string {
    if (kind === 'poster') {
        let filter = `[0:v]scale=${POSTER_SIZE.width}:${POSTER_SIZE.height}:flags=lanczos,format=rgba[base0]`
        for (let index = 1; index <= overlayCount; index++) filter += `;[base${index - 1}][${index}:v]overlay=0:0[base${index}]`
        return `${filter};[base${overlayCount}]format=yuvj420p[out]`
    }
    const { width, height } = MAX_LANDSCAPE
    return (
        `[0:v]scale='min(${width},iw)':'min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,` +
        'format=yuvj420p[out]'
    )
}

/** Lädt ein Bild und schreibt es aufbereitet als JPG (bzw. Logo unverändert als PNG), erst als .partial */
export async function renderImage(
    settings: Settings,
    url: string,
    kind: ArtworkKind | 'thumb',
    targetPath: string,
    overlays: string[] = []
): Promise<void> {
    const tempPath = `${targetPath}.partial`
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-manager-image-'))
    try {
        const source = await downloadImage(url)
        if (kind === 'logo') {
            await fsp.writeFile(tempPath, source)
        } else {
            const inputPath = path.join(workDir, 'source')
            await fsp.writeFile(inputPath, source)
            const { ffmpeg } = resolveBinaries(settings)
            const overlayPaths = kind === 'poster' ? overlays.map((file) => path.join(overlayDir(), file)) : []
            const args = [
                '-v',
                'error',
                '-y',
                '-i',
                inputPath,
                ...overlayPaths.flatMap((overlay) => ['-i', overlay]),
                '-filter_complex',
                filterFor(kind === 'thumb' ? 'landscape' : kind, overlayPaths.length),
                '-map',
                '[out]',
                '-frames:v',
                '1',
                '-c:v',
                'mjpeg',
                '-q:v',
                '2',
                '-f',
                'image2',
                '-update',
                '1',
                tempPath
            ]
            const { code, stderrTail } = await runProcess(ffmpeg, args)
            if (code !== 0) throw new Error(stderrTail.slice(-3).join(' ') || `ffmpeg beendet mit Code ${code}`)
        }
        await fsp.rename(tempPath, targetPath)
    } finally {
        await fsp.rm(tempPath, { force: true }).catch(() => undefined)
        await fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
}

/** Schreibt Cover, Staffelposter, Logo, Backdrop und Landscape in den Output-Ordner (vorhandene werden ersetzt) */
export async function exportArtwork(jobs: ArtworkJob[], outputDir: string, settings: Settings): Promise<ArtworkResult[]> {
    await fsp.mkdir(outputDir, { recursive: true })
    const results: ArtworkResult[] = []
    const queue = [...jobs]
    const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
            try {
                await renderImage(settings, job.url, job.kind, path.join(outputDir, job.fileName), overlayFiles(job.overlays))
                results.push({ fileName: job.fileName, ok: true })
            } catch (error) {
                results.push({ fileName: job.fileName, ok: false, message: error instanceof Error ? error.message : String(error) })
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker))
    return jobs.map((job) => results.find((result) => result.fileName === job.fileName)!)
}
