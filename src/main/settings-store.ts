import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { mergeSettings } from '../shared/settings'
import type { Settings } from '../shared/types'

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

let current: Settings | null = null

export function loadSettings(): Settings {
    if (current) return current
    try {
        current = mergeSettings(JSON.parse(fs.readFileSync(settingsFile(), 'utf8')))
    } catch {
        current = mergeSettings(null)
    }
    return current
}

export function saveSettings(settings: Settings): Settings {
    current = mergeSettings(settings)
    const file = settingsFile()
    const tmp = `${file}.tmp`
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // Erst in eine Temp-Datei schreiben, damit bei einem Absturz keine halbe Datei übrig bleibt
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return current
}
