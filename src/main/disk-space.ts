import fs from 'node:fs/promises'
import path from 'node:path'
import type { DiskSpace } from '../shared/types'

/** Freier Platz auf dem Laufwerk des Ordners. Existiert der Ordner noch nicht, wird der nächste vorhandene Elternordner genutzt. */
export async function getDiskSpace(dir: string): Promise<DiskSpace | null> {
    let current = path.resolve(dir)
    for (;;) {
        try {
            const stats = await fs.statfs(current)
            return { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize }
        } catch {
            const parent = path.dirname(current)
            if (parent === current) return null
            current = parent
        }
    }
}
