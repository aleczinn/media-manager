import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { registerIpc } from './ipc'
import type { PeakService } from './peak-service'
import type { Runner } from './runner'
import { loadSettings, saveSettings } from './settings-store'

// Fester Settings-Ordner, damit Dev-Start und gepackte .exe (anderer App-Name) dieselben Einstellungen nutzen
if (!app.commandLine.hasSwitch('user-data-dir')) {
    app.setPath('userData', path.join(app.getPath('appData'), 'media-manager-v2'))
}

let mainWindow: BrowserWindow | null = null
let services: { runner: Runner; peaks: PeakService } | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 640,
        title: 'Media Manager',
        backgroundColor: '#0b0d12',
        autoHideMenuBar: true,
        show: false,
        // Gepackt kommt das Icon aus der .exe
        icon: app.isPackaged ? undefined : path.join(__dirname, '../../build/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true
        }
    })

    mainWindow.once('ready-to-show', () => mainWindow?.show())
    mainWindow.on('closed', () => {
        mainWindow = null
    })
    // Links nie in einem neuen App-Fenster öffnen, sondern (nur https) im Standardbrowser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//i.test(url)) void shell.openExternal(url)
        return { action: 'deny' }
    })

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }
}

app.whenReady().then(() => {
    services = registerIpc(() => mainWindow)
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('before-quit', () => {
    // Laufende ffmpeg-Prozesse beenden, die halben .partial-Dateien räumt der Runner weg
    if (services?.runner.isRunning) services.runner.cancel()
    services?.peaks.killAll()

    // Einstellungen werden bei jeder Änderung gespeichert; hier nur zur Sicherheit noch einmal
    try {
        saveSettings(loadSettings())
    } catch (error) {
        console.error('Einstellungen konnten nicht gespeichert werden:', error)
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
