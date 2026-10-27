import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isSubtitleFile, matchSubtitlesToVideo, SUBS_FOLDER } from '../shared/external-subs'
import type { ExternalSubtitleFile, MediaFile } from '../shared/types'

const EXTENSIONS = ['.mkv', '.mp4', '.avi']

async function fileStat(filePath: string): Promise<{ size: number; modifiedMs: number }> {
    try {
        const stat = await fs.stat(filePath)
        return { size: stat.size, modifiedMs: stat.mtimeMs }
    } catch {
        return { size: 0, modifiedMs: 0 }
    }
}

const fileSize = async (filePath: string) => (await fileStat(filePath)).size

/** Untertiteldateien eines Ordners; eine .idx zählt nur, wenn die zugehörige .sub daneben liegt */
function subtitleCandidates(items: Dirent[]): string[] {
    const names = items.filter((item) => item.isFile()).map((item) => item.name)
    const lowerNames = new Set(names.map((name) => name.toLowerCase()))
    return names.filter((name) => {
        if (!isSubtitleFile(name)) return false
        if (!name.toLowerCase().endsWith('.idx')) return true
        return lowerNames.has(name.toLowerCase().replace(/\.idx$/, '.sub'))
    })
}

async function toExternal(dir: string, name: string): Promise<ExternalSubtitleFile> {
    const filePath = path.join(dir, name)
    let size = await fileSize(filePath)
    if (name.toLowerCase().endsWith('.idx')) size += await fileSize(filePath.replace(/\.idx$/i, '.sub'))
    return { path: filePath, size }
}

/**
 * Durchsucht den Ordner rekursiv nach Mediendateien; Dateien mit "sample" im Namen werden ignoriert.
 * Zu jedem Video werden externe Untertitel aus einem `Subs`-Ordner und gleichnamige Dateien daneben gesammelt.
 */
export async function findMediaFiles(rootDir: string): Promise<MediaFile[]> {
    const files: MediaFile[] = []

    async function scanDirectory(currentDir: string): Promise<void> {
        let items: Dirent[]
        try {
            items = await fs.readdir(currentDir, { withFileTypes: true })
        } catch (error) {
            console.error(`Fehler beim Scannen von ${currentDir}:`, error)
            return
        }

        const videos = items.filter((item) => {
            const extension = path.extname(item.name).toLowerCase()
            return item.isFile() && EXTENSIONS.includes(extension) && !item.name.toLowerCase().includes('sample')
        })

        if (videos.length > 0) {
            const looseSubtitles = subtitleCandidates(items)
            const subsFolder = items.find((item) => item.isDirectory() && item.name.toLowerCase() === SUBS_FOLDER)
            const subsDir = subsFolder ? path.join(currentDir, subsFolder.name) : null
            const subsFolderSubtitles = subsDir
                ? subtitleCandidates(await fs.readdir(subsDir, { withFileTypes: true }).catch(() => []))
                : []

            for (const item of videos) {
                const fullPath = path.join(currentDir, item.name)
                const name = path.basename(item.name, path.extname(item.name))
                const externalSubtitles = await Promise.all([
                    ...matchSubtitlesToVideo(name, videos.length, looseSubtitles, false).map((sub) => toExternal(currentDir, sub)),
                    ...matchSubtitlesToVideo(name, videos.length, subsFolderSubtitles, true).map((sub) => toExternal(subsDir!, sub))
                ])

                files.push({
                    id: fullPath,
                    name,
                    extension: path.extname(item.name).toLowerCase(),
                    fullPath,
                    dir: currentDir,
                    relativePath: path.relative(rootDir, fullPath),
                    ...(await fileStat(fullPath)),
                    externalSubtitles: externalSubtitles.sort((a, b) => a.path.localeCompare(b.path))
                })
            }
        }

        for (const item of items) {
            if (item.isDirectory()) await scanDirectory(path.join(currentDir, item.name))
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
