import { useEffect, useRef, useState } from 'react'

/** Zeitraum, über den die aktuelle Geschwindigkeit gemessen wird */
const RATE_WINDOW_MS = 30_000
/** So weit darf der Balken einer ausbleibenden Meldung vorauslaufen */
const MAX_LEAD_MS = 4_000
/** Zeitkonstante, mit der sich der Balken seinem Ziel nähert */
const EASE_MS = 300
/** Vorher ist die Geschwindigkeit zu ungenau für eine Restzeit */
const ETA_MIN_ELAPSED_MS = 5_000

interface Sample {
    t: number
    v: number
}

export interface SmoothProgress {
    /** Angezeigter Fortschritt (0–1), steigt nie */
    value: number
    /** Geschätzte Restzeit in Sekunden */
    etaSec: number | null
}

/**
 * Glättet einen sprunghaften Fortschritt (0–1): Zwischen zwei Meldungen läuft der Wert mit der
 * gemessenen Geschwindigkeit weiter, aber höchstens {@link MAX_LEAD_MS} über die letzte Meldung hinaus.
 * Die Restzeit beruht auf der Geschwindigkeit der letzten {@link RATE_WINDOW_MS}, nicht auf dem Schnitt seit dem Start.
 */
export function useSmoothProgress(target: number, startedAt: number): SmoothProgress {
    const samples = useRef<Sample[]>([])
    const shown = useRef(0)
    const eta = useRef<{ value: number; at: number } | null>(null)
    const [state, setState] = useState<SmoothProgress>({ value: 0, etaSec: null })

    // Neuer Lauf: Startpunkt setzen
    useEffect(() => {
        samples.current = [{ t: startedAt, v: 0 }]
        shown.current = 0
        eta.current = null
        setState({ value: 0, etaSec: null })
    }, [startedAt])

    useEffect(() => {
        const list = samples.current
        const last = list[list.length - 1]
        if (last && target <= last.v) return
        const now = Date.now()
        list.push({ t: now, v: target })
        // Ein Messpunkt vor dem Fenster bleibt als Anfang erhalten
        while (list.length > 2 && now - list[1].t > RATE_WINDOW_MS) list.shift()
    }, [target])

    useEffect(() => {
        let frame = 0
        let lastFrame = performance.now()

        const tick = (frameTime: number) => {
            const dt = frameTime - lastFrame
            lastFrame = frameTime
            const now = Date.now()
            const list = samples.current
            const first = list[0]
            const last = list[list.length - 1]

            // Bis jetzt gemessen: bleiben Meldungen aus, sinkt die Geschwindigkeit von selbst
            const rate = first && last && now > first.t ? (last.v - first.v) / (now - first.t) : 0
            const lead = last ? rate * Math.min(now - last.t, MAX_LEAD_MS) : 0
            // Ohne echte Meldung über 100 % nie ganz voll anzeigen
            const goal = last ? Math.min(last.v >= 1 ? 1 : 0.999, last.v + lead) : 0
            const next = shown.current + (goal - shown.current) * (1 - Math.exp(-dt / EASE_MS))
            shown.current = Math.max(shown.current, next)

            let etaSec: number | null = null
            if (rate > 0 && now - startedAt >= ETA_MIN_ELAPSED_MS) {
                const raw = (1 - shown.current) / rate / 1000
                const previous = eta.current
                if (!previous) {
                    eta.current = { value: raw, at: now }
                } else if (now - previous.at >= 1000) {
                    // Einmal pro Sekunde: weiterzählen und an die neue Schätzung angleichen, bei großer Abweichung schneller
                    const counted = Math.max(0, previous.value - (now - previous.at) / 1000)
                    const weight = Math.min(1, 0.2 + Math.abs(raw - counted) / Math.max(raw, counted, 1))
                    eta.current = { value: counted + (raw - counted) * weight, at: now }
                }
                etaSec = eta.current?.value ?? null
            }

            setState((prev) =>
                Math.abs(prev.value - shown.current) < 0.0002 && prev.etaSec === etaSec ? prev : { value: shown.current, etaSec }
            )
            frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [startedAt])

    return state
}
