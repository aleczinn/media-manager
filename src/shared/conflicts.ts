import { validateStem } from './rename'

export type ConflictReason = 'invalid' | 'exists' | 'duplicate'

export interface Conflict {
    reason: ConflictReason
    message: string
}

/**
 * Findet Zielnamen, die nicht verwendet werden können: ungültige Zeichen,
 * Datei existiert schon im Output oder derselbe Name kommt im Batch mehrfach vor.
 * Windows-Dateinamen sind case-insensitive, deshalb wird kleingeschrieben verglichen.
 */
export function findConflicts(items: { id: string; stem: string }[], existingNames: string[]): Map<string, Conflict> {
    const conflicts = new Map<string, Conflict>()
    const existing = new Set(existingNames.map((name) => name.toLowerCase()))
    const counts = new Map<string, number>()

    for (const { stem } of items) {
        const key = `${stem}.mkv`.toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    for (const { id, stem } of items) {
        const invalid = validateStem(stem)
        const key = `${stem}.mkv`.toLowerCase()

        if (invalid) {
            conflicts.set(id, { reason: 'invalid', message: invalid })
        } else if (existing.has(key)) {
            conflicts.set(id, { reason: 'exists', message: 'Datei existiert bereits im Output-Ordner' })
        } else if ((counts.get(key) ?? 0) > 1) {
            conflicts.set(id, { reason: 'duplicate', message: 'Name wird mehrfach verwendet' })
        }
    }

    return conflicts
}
