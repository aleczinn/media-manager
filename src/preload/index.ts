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
    prefetchScans: (requests) => ipcRenderer.invoke('scan:prefetch', requests),
    tmdbSearch: (query, year) => ipcRenderer.invoke('tmdb:search', query, year),
    tmdbSearchMovie: (query, year) => ipcRenderer.invoke('tmdb:searchMovie', query, year),
    tmdbSeasons: (showId) => ipcRenderer.invoke('tmdb:seasons', showId),
    tmdbSeason: (showId, season) => ipcRenderer.invoke('tmdb:season', showId, season),
    tmdbEpisodeImages: (showId, season, episode) => ipcRenderer.invoke('tmdb:episodeImages', showId, season, episode),
    extractFrames: (file) => ipcRenderer.invoke('frames:extract', file),
    tmdbEpisodeGroups: (showId) => ipcRenderer.invoke('tmdb:episodeGroups', showId),
    tmdbEpisodeGroup: (groupId) => ipcRenderer.invoke('tmdb:episodeGroup', groupId),
    tmdbDetails: (kind, id) => ipcRenderer.invoke('tmdb:details', kind, id),
    tmdbTest: (apiKey) => ipcRenderer.invoke('tmdb:test', apiKey),
    detectStereo: (file) => ipcRenderer.invoke('stereo:detect', file),
    fanartTest: (apiKey) => ipcRenderer.invoke('fanart:test', apiKey),
    artworkCandidates: (request) => ipcRenderer.invoke('artwork:candidates', request),
    exportArtwork: (jobs, outputDir) => ipcRenderer.invoke('artwork:export', jobs, outputDir),
    listOutput: (dir) => ipcRenderer.invoke('output:list', dir),
    diskSpace: (dir) => ipcRenderer.invoke('disk:space', dir),
    apply: (jobs, outputDir, artwork) => ipcRenderer.invoke('apply:start', jobs, outputDir, artwork),
    cancelApply: () => ipcRenderer.invoke('apply:cancel'),
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    onAnalysis: (listener) => subscribe('analysis:result', listener),
    onApplyProgress: (listener) => subscribe('apply:progress', listener),
    onApplyFileDone: (listener) => subscribe('apply:fileDone', listener),
    onPeakUpdate: (listener) => subscribe('peak:update', listener),
    onSubtitleCounts: (listener) => subscribe('scan:counts', listener),
    onScanStatus: (listener) => subscribe('scan:status', listener),
    ytStatus: () => ipcRenderer.invoke('yt:status'),
    ytUpdate: () => ipcRenderer.invoke('yt:update'),
    ytAnalyze: (url) => ipcRenderer.invoke('yt:analyze', url),
    ytVideo: (id, url) => ipcRenderer.invoke('yt:video', id, url),
    ytDownload: (jobs) => ipcRenderer.invoke('yt:download', jobs),
    ytDropDetails: (ids) => ipcRenderer.invoke('yt:dropDetails', ids),
    ytCancel: (id) => ipcRenderer.invoke('yt:cancel', id),
    ytCleanup: (files, workDir) => ipcRenderer.invoke('yt:cleanup', files, workDir),
    ytDeliver: (files, outputDir) => ipcRenderer.invoke('yt:deliver', files, outputDir),
    onYtStatus: (listener) => subscribe('yt:status', listener),
    onYtProgress: (listener) => subscribe('yt:progress', listener),
    onYtItemDone: (listener) => subscribe('yt:itemDone', listener)
}

contextBridge.exposeInMainWorld('api', api)
