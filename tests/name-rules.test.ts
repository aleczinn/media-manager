import { describe, expect, it } from 'vitest'
import { applyNameRules, ruleFolder, stepError, youtubeStem, type NameStep } from '../src/shared/name-rules'
import { mergeSettings } from '../src/shared/settings'

const STEPS: NameStep[] = [
    { id: '1', type: 'removeBefore', marker: '#', includeMarker: false },
    { id: '2', type: 'removeAfter', marker: '★', includeMarker: true },
    { id: '3', type: 'pattern', pattern: '{titel} 🈲 OUTLAST 2 [{nr}]', target: '#{nr} - {titel}' }
]

describe('applyNameRules', () => {
    it('bringt die unterschiedlichen Let’s-Play-Namen ins gleiche Format', () => {
        expect(applyNameRules("OUTLAST [HD+] #018 - Treibt die Nägel rein! ★ Let's Play Outlast", STEPS)).toBe(
            '#018 - Treibt die Nägel rein!'
        )
        expect(applyNameRules("OUTLAST; WHISTEBLOWER [HD+] #002 - Peter von Frosta ★ Let's Play Outlast; Whistleblower", STEPS)).toBe(
            '#002 - Peter von Frosta'
        )
        expect(applyNameRules('500g ZUNGE bitte! 🈲 OUTLAST 2 [011]', STEPS)).toBe('#011 - 500g ZUNGE bitte!')
    })

    it('lässt Namen unverändert, auf die kein Schritt passt', () => {
        expect(applyNameRules('Anderes  Video', STEPS)).toBe('Anderes  Video')
        expect(applyNameRules('Video', [])).toBe('Video')
    })

    it('entfernt die Markierung auf Wunsch mit', () => {
        const name = 'Vorspann | Titel | Abspann'
        expect(applyNameRules(name, [{ id: '1', type: 'removeBefore', marker: '|', includeMarker: true }])).toBe('Titel | Abspann')
        expect(applyNameRules(name, [{ id: '1', type: 'removeAfter', marker: '|', includeMarker: false }])).toBe('Vorspann |')
    })

    it('ersetzt überall, auch ohne Rücksicht auf die Schreibweise', () => {
        const step: NameStep = { id: '1', type: 'replace', find: 'outlast', replacement: 'X', regex: false }
        expect(applyNameRules('OUTLAST und Outlast', [step])).toBe('X und X')
    })

    it('entfernt mitten im Namen und räumt die Leerzeichen auf', () => {
        const step: NameStep = { id: '1', type: 'replace', find: '[HD+]', replacement: '', regex: false }
        expect(applyNameRules('OUTLAST [HD+] #018', [step])).toBe('OUTLAST #018')
    })

    it('behält $ ohne Regex wörtlich und kennt Gruppen mit Regex', () => {
        expect(applyNameRules('Preis', [{ id: '1', type: 'replace', find: 'Preis', replacement: '$1 Euro', regex: false }])).toBe('$1 Euro')
        expect(applyNameRules('Folge 12', [{ id: '1', type: 'replace', find: 'Folge (\\d+)', replacement: '#$1', regex: true }])).toBe(
            '#12'
        )
    })

    it('schneidet vorne und hinten ab, ohne Emojis zu zerbrechen', () => {
        expect(applyNameRules('🈲🈲 Titel 🈲', [{ id: '1', type: 'trim', start: 2, end: 1 }])).toBe('Titel')
    })

    it('überspringt fehlerhafte und leere Schritte', () => {
        const broken: NameStep = { id: '1', type: 'replace', find: '(', replacement: '', regex: true }
        expect(stepError(broken)).toBe('Ungültiger regulärer Ausdruck')
        expect(applyNameRules('Titel', [broken])).toBe('Titel')
        expect(applyNameRules('Titel', [{ id: '2', type: 'removeBefore', marker: '', includeMarker: false }])).toBe('Titel')
    })

    it('fällt bei leerem Ergebnis auf den ursprünglichen Namen zurück', () => {
        expect(applyNameRules('Titel', [{ id: '1', type: 'trim', start: 10, end: 10 }])).toBe('Titel')
    })
})

describe('stepError beim Muster', () => {
    const pattern = (value: string, target = '{a}'): NameStep => ({ id: '1', type: 'pattern', pattern: value, target })

    it('meldet fehlende, doppelte und unbekannte Platzhalter', () => {
        expect(stepError(pattern('ohne'))).toContain('mindestens einen')
        expect(stepError(pattern('{a} {a}'))).toContain('nur einmal')
        expect(stepError(pattern('{a}', '{b}'))).toContain('{b}')
        expect(stepError(pattern('{a} - {b}', '{b}'))).toBeNull()
        expect(stepError(pattern(''))).toBeNull()
    })
})

describe('Regelsatz je Ordner', () => {
    const file = {
        name: 'OUTLAST [HD+] #018 - Titel ★ Lets Play (1080p_30fps_H264-128kbit_AAC)',
        fullPath: 'C:\\in\\Gronkh - Outlast\\datei.mkv',
        relativePath: 'Gronkh - Outlast\\datei.mkv'
    }
    const nameRuleSets = [{ id: 'a', name: 'Outlast', steps: STEPS }]

    it('nimmt den innersten Ordner, bei Dateien direkt im Input dessen Namen', () => {
        expect(ruleFolder(file)).toBe('Gronkh - Outlast')
        expect(ruleFolder({ fullPath: 'C:\\in\\datei.mkv', relativePath: 'datei.mkv' })).toBe('in')
    })

    it('wendet nur den zugewiesenen Regelsatz an', () => {
        expect(youtubeStem(file, { nameRuleSets, folderRuleSets: { 'Gronkh - Outlast': 'a' } })).toBe('#018 - Titel')
        expect(youtubeStem(file, { nameRuleSets, folderRuleSets: {} })).toBe('OUTLAST [HD+] #018 - Titel ★ Lets Play')
        // Zuordnung zu einem gelöschten Regelsatz
        expect(youtubeStem(file, { nameRuleSets: [], folderRuleSets: { 'Gronkh - Outlast': 'a' } })).toBe(
            'OUTLAST [HD+] #018 - Titel ★ Lets Play'
        )
    })

    it('ergänzt bestehende Einstellungen um leere Regeln', () => {
        const settings = mergeSettings({ inputDir: 'C:\\in' })
        expect(settings.nameRuleSets).toEqual([])
        expect(settings.folderRuleSets).toEqual({})
    })
})
