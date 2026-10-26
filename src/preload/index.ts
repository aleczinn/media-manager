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
    listOutput: (dir) => ipcRenderer.invoke('output:list', dir),
    diskSpace: (dir) => ipcRenderer.invoke('disk:space', dir),
    apply: (jobs, outputDir) => ipcRenderer.invoke('apply:start', jobs, outputDir),
    cancelApply: () => ipcRenderer.invoke('apply:cancel'),
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    onAnalysis: (listener) => subscribe('analysis:result', listener),
    onApplyProgress: (listener) => subscribe('apply:progress', listener),
    onApplyFileDone: (listener) => subscribe('apply:fileDone', listener)
}

contextBridge.exposeInMainWorld('api', api)
