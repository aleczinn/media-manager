import type { TrackPlan } from './pipeline'

export const GB = 1024 ** 3

export interface SpaceItem {
    size: number
    durationSec: number
    plan: TrackPlan | null
}

/**
 * Schätzt den Platzbedarf im Output: Originalgröße (alle Spuren werden kopiert)
 * plus die neue AC3-Spur (Bitrate × Dauer), falls normalisiert wird.
 * Beim Video-Re-Encode wird pauschal die Originalgröße angesetzt.
 */
export function estimateRequiredBytes(items: SpaceItem[]): number {
    return items.reduce((sum, { size, durationSec, plan }) => {
        let bytes = size
        if (plan?.normalize) {
            const bitsPerSecond = plan.normalize.bitrate === '384k' ? 384_000 : 640_000
            bytes += (bitsPerSecond * durationSec) / 8
        }
        return sum + bytes
    }, 0)
}

export type SpaceLevel = 'ok' | 'low' | 'insufficient'

export function getSpaceLevel(required: number, free: number, warningGb: number): SpaceLevel {
    if (required > free) return 'insufficient'
    if (free - required < warningGb * GB) return 'low'
    return 'ok'
}

export function formatBytes(bytes: number): string {
    if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
}
