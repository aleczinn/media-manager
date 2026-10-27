import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { ScanRequest } from '../shared/peak'
import type { ApplyJob, MediaFile, Settings } from '../shared/types'
import { getDiskSpace } from './disk-space'
import { checkFfmpeg, resolveBinaries } from './ffmpeg'
import { analyzeFile } from './metadata'
import { ScanService } from './scan-service'
import { Runner } from './runner'
import { findMediaFiles, listOutputNames } from './scanner'
import { loadSettings, saveSettings } from './settings-store'
import { getSeason, getSeasons, searchTv, testKey } from './tmdb'

// Die Analyse liest nur Kopfdaten (das komplette Lesen passiert im Hintergrund-Scan), daher mehr gleichzeitig
const ANALYZE_CONCURRENCY = 4

/** Registriert alle IPC-Handler und gibt Runner und Scan-Dienst zurück (zum Aufräumen beim Beenden). */
export function registerIpc(getWindow: () => BrowserWindow | null): { runner: Runner; scans: ScanService } {
    const send = (channel: string, payload: unknown) => {
        const window = getWindow()
        if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
    }

    const scans = new ScanService(
        loadSettings,
        (update) => send('peak:update', update),
        (update) => send('scan:counts', update),
        (update) => send('scan:status', update)
    )
    const runner = new Runner(scans)
    let latestAnalyzeRequest = 0

    ipcMain.handle('dialog:selectFolder', async (_event, defaultPath?: string) => {
        const window = getWindow()
        const options: Electron.OpenDialogOptions = {
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: defaultPath || undefined
        }
        const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
        return result.canceled ? null : (result.filePaths[0] ?? null)
    })

    ipcMain.handle('dialog:selectExecutable', async (_event, defaultPath?: string) => {
        const window = getWindow()
        const options: Electron.OpenDialogOptions = {
            properties: ['openFile'],
            defaultPath: defaultPath || undefined,
            filters: [
                { name: 'Programme', extensions: ['exe'] },
                { name: 'Alle Dateien', extensions: ['*'] }
            ]
        }
        const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
        return result.canceled ? null : (result.filePaths[0] ?? null)
    })

    ipcMain.handle('settings:get', () => loadSettings())
    ipcMain.handle('settings:save', (_event, settings: Settings) => saveSettings(settings))
    ipcMain.handle('ffmpeg:check', () => checkFfmpeg(loadSettings()))

    ipcMain.handle('files:scan', (_event, dir: string) => findMediaFiles(dir))

    ipcMain.handle('files:analyze', async (_event, requestId: number, files: MediaFile[]) => {
        latestAnalyzeRequest = requestId
        const { ffprobe } = resolveBinaries(loadSettings())
        const queue = [...files]

        // Ein neuer Scan macht ältere Analysen überflüssig
        const worker = async () => {
            for (let file = queue.shift(); file && latestAnalyzeRequest === requestId; file = queue.shift()) {
                try {
                    const analysis = await analyzeFile(file, ffprobe)
                    send('analysis:result', { requestId, fileId: file.id, analysis })
                } catch (error) {
                    send('analysis:result', { requestId, fileId: file.id, error: error instanceof Error ? error.message : String(error) })
                }
            }
        }
        await Promise.all(Array.from({ length: ANALYZE_CONCURRENCY }, worker))
    })

    ipcMain.handle('scan:prefetch', (_event, requests: ScanRequest[]) => scans.prefetch(requests))

    ipcMain.handle('output:list', (_event, dir: string) => listOutputNames(dir))
    ipcMain.handle('disk:space', (_event, dir: string) => getDiskSpace(dir))

    ipcMain.handle('apply:start', (_event, jobs: ApplyJob[], outputDir: string) =>
        runner.run(jobs, outputDir, loadSettings(), {
            progress: (progress) => send('apply:progress', progress),
            fileDone: (result) => send('apply:fileDone', result)
        })
    )
    ipcMain.handle('apply:cancel', () => runner.cancel())

    ipcMain.handle('shell:openPath', async (_event, target: string) => {
        await shell.openPath(target)
    })
    ipcMain.handle('shell:openExternal', async (_event, url: string) => {
        // Nur Webadressen im Standardbrowser öffnen
        if (/^https:\/\//i.test(url)) await shell.openExternal(url)
    })

    ipcMain.handle('tmdb:search', (_event, query: string, year: number | null) => searchTv(loadSettings().tmdbApiKey, query, year))
    ipcMain.handle('tmdb:seasons', (_event, showId: number) => getSeasons(loadSettings().tmdbApiKey, showId))
    ipcMain.handle('tmdb:season', (_event, showId: number, season: number) => getSeason(loadSettings().tmdbApiKey, showId, season))
    ipcMain.handle('tmdb:test', (_event, apiKey: string) => testKey(apiKey))

    return { runner, scans }
}
