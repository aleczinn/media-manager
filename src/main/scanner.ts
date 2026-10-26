import fs from 'node:fs/promises'
import path from 'node:path'
import type { MediaFile } from '../shared/types'

const EXTENSIONS = ['.mkv', '.mp4', '.avi']

/** Durchsucht den Ordner rekursiv nach Mediendateien; Dateien mit "sample" im Namen werden ignoriert. */
export async function findMediaFiles(rootDir: string): Promise<MediaFile[]> {
    const files: MediaFile[] = []

    async function scanDirectory(currentDir: string): Promise<void> {
        let items
        try {
            items = await fs.readdir(currentDir, { withFileTypes: true })
        } catch (error) {
            console.error(`Fehler beim Scannen von ${currentDir}:`, error)
            return
        }

        for (const item of items) {
            const fullPath = path.join(currentDir, item.name)

            if (item.isDirectory()) {
                await scanDirectory(fullPath)
            } else if (item.isFile()) {
                const extension = path.extname(item.name).toLowerCase()
                if (!EXTENSIONS.includes(extension) || item.name.toLowerCase().includes('sample')) continue

                const { size } = await fs.stat(fullPath)
                files.push({
                    id: fullPath,
                    name: path.basename(item.name, path.extname(item.name)),
                    extension,
                    fullPath,
                    dir: currentDir,
                    relativePath: path.relative(rootDir, fullPath),
                    size
                })
            }
        }
    }

    await scanDirectory(rootDir)
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }))
}

/** Dateinamen im Output-Ordner (nicht rekursiv), für die Konfliktprüfung. */
export async function listOutputNames(dir: string): Promise<string[]> {
    try {
        const items = await fs.readdir(dir, { withFileTypes: true })
        return items.filter((item) => item.isFile()).map((item) => item.name)
    } catch {
        return []
    }
}
