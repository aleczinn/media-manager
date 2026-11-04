import { sourceFolders } from './rename'
import { cleanYoutubeName } from './youtube'

/** Ein Schritt der Umbenennung; Text wird ohne Rücksicht auf Groß- und Kleinschreibung gesucht */
export type NameStep = { id: string } & (
    | { type: 'replace'; find: string; replacement: string; regex: boolean }
    | { type: 'removeBefore'; marker: string; includeMarker: boolean }
    | { type: 'removeAfter'; marker: string; includeMarker: boolean }
    | { type: 'trim'; start: number; end: number }
    | { type: 'pattern'; pattern: string; target: string }
)

export type NameStepType = NameStep['type']

export interface NameRuleSet {
    id: string
    name: string
    steps: NameStep[]
}

export interface NameRules {
    nameRuleSets: NameRuleSet[]
    /** Innerster Quellordner → ID des Regelsatzes */
    folderRuleSets: Record<string, string>
}

export const NAME_STEP_LABELS: Record<NameStepType, string> = {
    removeBefore: 'Alles davor entfernen',
    removeAfter: 'Alles danach entfernen',
    replace: 'Ersetzen',
    trim: 'Zeichen abschneiden',
    pattern: 'Muster umbauen'
}

const PLACEHOLDER_REGEX = /\{([^{}]+)\}/g

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

function placeholders(text: string): string[] {
    return Array.from(text.matchAll(PLACEHOLDER_REGEX), (match) => match[1])
}

/** Macht aus `{titel} 🈲 OUTLAST 2 [{nr}]` eine Regex über den ganzen Namen; jeder Platzhalter wird eine Gruppe */
function patternRegex(pattern: string): RegExp {
    const source = pattern.split(PLACEHOLDER_REGEX).map((part, index) => (index % 2 === 1 ? '(.+?)' : escapeRegex(part)))
    return new RegExp(`^${source.join('')}$`, 'iu')
}

/** Fehlermeldung für einen falsch ausgefüllten Schritt; leere Felder sind kein Fehler, der Schritt tut dann nur nichts */
export function stepError(step: NameStep): string | null {
    if (step.type === 'replace' && step.regex && step.find) {
        try {
            new RegExp(step.find, 'giu')
        } catch {
            return 'Ungültiger regulärer Ausdruck'
        }
    }
    if (step.type === 'pattern' && step.pattern) {
        const names = placeholders(step.pattern)
        if (names.length === 0) return 'Das Muster braucht mindestens einen Platzhalter, z. B. {titel}'
        if (new Set(names).size < names.length) return 'Jeder Platzhalter darf im Muster nur einmal vorkommen'
        const unknown = placeholders(step.target).find((name) => !names.includes(name))
        if (unknown) return `Platzhalter {${unknown}} kommt im Muster nicht vor`
    }
    return null
}

function applyStep(name: string, step: NameStep): string {
    if (stepError(step)) return name
    switch (step.type) {
        case 'replace': {
            if (!step.find) return name
            if (step.regex) return name.replace(new RegExp(step.find, 'giu'), step.replacement)
            // Als Funktion übergeben, damit `$` im Ersatz wörtlich bleibt
            return name.replace(new RegExp(escapeRegex(step.find), 'giu'), () => step.replacement)
        }
        case 'removeBefore':
        case 'removeAfter': {
            if (!step.marker) return name
            const match = new RegExp(escapeRegex(step.marker), 'iu').exec(name)
            if (!match) return name
            const end = match.index + match[0].length
            if (step.type === 'removeBefore') return name.slice(step.includeMarker ? end : match.index)
            return name.slice(0, step.includeMarker ? match.index : end)
        }
        case 'trim': {
            // Nach Unicode-Zeichen zählen, damit Emojis nicht zerbrechen
            const chars = Array.from(name)
            const count = (value: number) => Math.max(0, Math.floor(value) || 0)
            return chars.slice(count(step.start), Math.max(count(step.start), chars.length - count(step.end))).join('')
        }
        case 'pattern': {
            if (!step.pattern || !step.target) return name
            const match = patternRegex(step.pattern).exec(name)
            if (!match) return name
            const names = placeholders(step.pattern)
            // Als Funktion übergeben, damit `$` im Titel wörtlich bleibt
            return step.target.replace(PLACEHOLDER_REGEX, (_, placeholder: string) => match[names.indexOf(placeholder) + 1])
        }
    }
}

/**
 * Führt die Schritte der Reihe nach aus. Ein Schritt, der nicht passt, ändert nichts.
 * Bleibt am Ende nichts übrig, gilt der ursprüngliche Name, damit nie ein leerer Dateiname entsteht.
 */
export function applyNameRules(name: string, steps: NameStep[]): string {
    const result = steps.reduce(applyStep, name)
    if (result === name) return name
    return result.replace(/\s+/g, ' ').trim() || name
}

/** Ordner, dem eine Datei zugeordnet wird: der innerste Quellordner */
export function ruleFolder(file: { fullPath: string; relativePath: string }): string {
    return sourceFolders(file)[0] ?? ''
}

export function ruleSetOfFolder(rules: NameRules, folder: string): NameRuleSet | null {
    const id = rules.folderRuleSets[folder]
    return rules.nameRuleSets.find((set) => set.id === id) ?? null
}

/** Zielname im YouTube-Modus: Name ohne JDownloader-Zusätze, danach die Regeln des Ordners */
export function youtubeStem(file: { name: string; fullPath: string; relativePath: string }, rules: NameRules): string {
    return applyNameRules(cleanYoutubeName(file.name), ruleSetOfFolder(rules, ruleFolder(file))?.steps ?? [])
}
