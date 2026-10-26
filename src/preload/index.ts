import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MediaManagerApi } from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
    const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
}

const api: MediaManagerApi = {
    selectFolder: (defaultPath) => ipcRenderer.invoke('dialog:selectFolder', defaultPath),
    selectExecutable: (defaultPath) => ipcRenderer.invoke('dialog:selectExecutable', defaultPath),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
    checkFfmpeg: () => ipcRenderer.invoke('ffmpeg:check'),
    scan: (dir) => ipcRenderer.invoke('files:scan', dir),
    analyze: (requestId, files) => ipcRenderer.invoke('files:analyze', requestId, files),
    prefetchPeaks: (requests) => ipcRenderer.invoke('peaks:prefetch', requests),
    tmdbSearch: (query, year) => ipcRenderer.invoke('tmdb:search', query, year),
    tmdbSeasons: (showId) => ipcRenderer.invoke('tmdb:seasons', showId),
    tmdbSeason: (showId, season) => ipcRenderer.invoke('tmdb:season', showId, season),
    tmdbTest: (apiKey) => ipcRenderer.invoke('tmdb:test', apiKey),
    listOutput: (dir) => ipcRenderer.invoke('output:list', dir),
    diskSpace: (dir) => ipcRenderer.invoke('disk:space', dir),
    apply: (jobs, outputDir) => ipcRenderer.invoke('apply:start', jobs, outputDir),
    cancelApply: () => ipcRenderer.invoke('apply:cancel'),
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    onAnalysis: (listener) => subscribe('analysis:result', listener),
    onApplyProgress: (listener) => subscribe('apply:progress', listener),
    onApplyFileDone: (listener) => subscribe('apply:fileDone', listener),
    onPeakUpdate: (listener) => subscribe('peak:update', listener)
}

contextBridge.exposeInMainWorld('api', api)
