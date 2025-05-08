import { dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })

    if (result.canceled || result.filePaths.length === 0) return null;

    const folderPath = result.filePaths[0];
    const files = fs.readdirSync(folderPath)
        .filter(name => /\.(mkv|mp4|avi)$/i.test(name))
        .map(name => ({
            name,
            fullPath: path.join(folderPath, name)
        }))

    return { folderPath, files }
})
