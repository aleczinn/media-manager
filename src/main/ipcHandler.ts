import { dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import ffmpeg from 'fluent-ffmpeg'

// const AUDIO_PRIORITY = ['truehd', 'dts-hd ma', 'dts-hd hr', 'dts', 'eac3', 'ac3', 'aac'];

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('analyze-folder', async (_, folderPath) => {
    const files = fs.readdirSync(folderPath).filter(f =>
        /\.(mp4|mkv|avi)$/i.test(f)
    )

    return await Promise.all(files.map(file => {
        const fullPath = path.join(folderPath, file)

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(fullPath, (err, metadata) => {
                if (err) return reject(err)

                resolve({
                    name: file,
                    path: fullPath,
                    data: metadata
                })
            })
        })
    }))
})
