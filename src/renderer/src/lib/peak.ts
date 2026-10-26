import { decideGain, type PeakState } from '@shared/peak'
import type { Settings } from '@shared/types'

export interface PeakInfo {
    text: string
    /** pending = Analyse steht aus/läuft, gain = wird verstärkt, none = keine Verstärkung nötig, error = fehlgeschlagen */
    tone: 'pending' | 'gain' | 'none' | 'error'
}

const db = (value: number) => `${value.toFixed(1).replace('.', ',')} dB`

/** Beschreibt den Stand der Peak-Analyse für Tooltip und Spurdetails. */
export function describePeak(state: PeakState | undefined, settings: Settings): PeakInfo {
    if (!state || state.status === 'queued') return { text: 'Peak-Analyse wartet', tone: 'pending' }
    if (state.status === 'running') return { text: 'Peak-Analyse läuft …', tone: 'pending' }
    if (state.status === 'error') return { text: `Peak-Analyse fehlgeschlagen: ${state.error}`, tone: 'error' }

    const gainNeeded = -state.maxVolume
    const gain = decideGain({ maxVolume: state.maxVolume, gainNeeded }, settings.normalizeMinGain, settings.normalizeMaxGain)
    if (gain === null) return { text: `Peak ${db(state.maxVolume)}, keine Normalisierung nötig`, tone: 'none' }
    return { text: `Peak ${db(state.maxVolume)} → +${db(gain)}${gain < gainNeeded ? ' (begrenzt)' : ''}`, tone: 'gain' }
}
