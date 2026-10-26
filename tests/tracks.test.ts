import { describe, expect, it } from 'vitest'
import { getAudioTrackName, getAudioType } from '../src/shared/audio-names'
import { normalizeLanguage } from '../src/shared/languages'
import { autoSubtitleState, autoSubtitleType, planTracks, resolveSubtitleType, subtitleState } from '../src/shared/pipeline'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { AudioTrackInfo, FileAnalysis, SubtitleOverride, SubtitleTrackInfo } from '../src/shared/types'

const audio = (index: number, patch: Partial<AudioTrackInfo>): AudioTrackInfo => ({
    index,
    title: '',
    language: 'de',
    codecId: 'A_AC3',
    format: 'AC-3',
    formatCommercial: '',
    additionalFeatures: '',
    channels: 6,
    default: false,
    ...patch
})

const subtitle = (index: number, patch: Partial<SubtitleTrackInfo>): SubtitleTrackInfo => ({
    inputIndex: 0,
    index,
    eventCount: null,
    title: '',
    language: 'de',
    codecId: 'S_TEXT/UTF8',
    default: false,
    forced: false,
    hearingImpaired: false,
    visualImpaired: false,
    original: false,
    dub: false,
    commentary: false,
    lyrics: false,
    karaoke: false,
    ...patch
})

describe('normalizeLanguage', () => {
    it('mappt ISO 639-2 auf 639-1 (alter Bug: Mapping wurde überschrieben)', () => {
        expect(normalizeLanguage('ger', 'de')).toBe('de')
        expect(normalizeLanguage('deu', 'de')).toBe('de')
        expect(normalizeLanguage('ENG', 'de')).toBe('en')
        expect(normalizeLanguage('de-DE', 'de')).toBe('de')
    })

    it('nutzt die Fallback-Sprache bei fehlendem Tag', () => {
        expect(normalizeLanguage('', 'de')).toBe('de')
        expect(normalizeLanguage(undefined, 'en')).toBe('en')
    })
})

describe('getAudioType / getAudioTrackName', () => {
    it('erkennt Atmos, DTS-HD MA und DTS:X', () => {
        expect(getAudioType(audio(0, { codecId: 'A_EAC3', additionalFeatures: 'JOC' }))).toBe('eac3_atmos_5')
        expect(getAudioType(audio(0, { codecId: 'A_TRUEHD', channels: 8, title: 'TrueHD Atmos' }))).toBe('truehd_atmos_7')
        expect(getAudioType(audio(0, { codecId: 'A_DTS', formatCommercial: 'DTS-HD Master Audio' }))).toBe('dts_hd_ma_5')
        expect(getAudioType(audio(0, { codecId: 'A_DTS', additionalFeatures: 'XLL X' }))).toBe('dts_x_5')
    })

    it('funktioniert mit ffprobe-Fallback-Werten', () => {
        expect(getAudioType(audio(0, { codecId: 'dts DTS-HD MA', format: 'dts', formatCommercial: 'DTS-HD MA' }))).toBe('dts_hd_ma_5')
        expect(
            getAudioType(
                audio(0, { codecId: 'eac3 Dolby Digital Plus + Dolby Atmos', formatCommercial: 'Dolby Digital Plus + Dolby Atmos' })
            )
        ).toBe('eac3_atmos_5')
    })

    it('liefert Namen bzw. null für unbekannte Typen', () => {
        expect(getAudioTrackName('ac3_5')).toBe('Dolby Digital 5.1')
        expect(getAudioTrackName('flac_2')).toBeNull()
    })
})

describe('planTracks', () => {
    const analysis: FileAnalysis = {
        durationSec: 2700,
        video: [{ index: 0, title: 'Encoded by X', language: 'en', codec: 'h264' }],
        audio: [
            audio(0, { language: 'eng', codecId: 'A_EAC3', channels: 6, title: 'English' }),
            audio(1, { language: 'jpn', codecId: 'A_AAC-2', format: 'AAC', channels: 2 }),
            audio(2, { language: 'ger', codecId: 'A_AC3', channels: 2, title: 'Deutsch Stereo' }),
            audio(3, { language: 'ger', codecId: 'A_EAC3', channels: 6, title: 'Deutsch' })
        ],
        subtitle: [
            subtitle(0, { language: 'eng', title: 'English SDH', hearingImpaired: true }),
            subtitle(1, { language: 'ger', codecId: 'S_HDMV/PGS', title: 'Deutsch' }),
            subtitle(2, { language: 'ger', title: 'Deutsch' }),
            subtitle(3, { language: 'ger', title: 'Forced', forced: true })
        ]
    }

    it('filtert, sortiert und benennt Spuren wie das alte Projekt', () => {
        const plan = planTracks(analysis, DEFAULT_SETTINGS)

        expect(plan.audio.map((t) => [t.source.index, t.language, t.title])).toEqual([
            [3, 'de', 'Dolby Digital Plus 5.1'],
            [2, 'de', 'Dolby Stereo'],
            [0, 'en', 'Dolby Digital Plus 5.1']
        ])

        // Forced zuerst, dann normal (SRT vor PGS, PGS-Duplikat entfernt), dann englisch SDH
        expect(plan.subtitle.map((t) => [t.source.index, t.title, t.dispositions.join('+')])).toEqual([
            [3, 'Deutsch Erzwungen', 'forced'],
            [2, 'Deutsch', ''],
            [0, 'English SDH', 'hearing_impaired']
        ])

        expect(plan.video[0].title).toBe('')
    })

    it('wählt die erste Tonspur für die Normalisierung und hängt das Branding an', () => {
        const plan = planTracks(analysis, { ...DEFAULT_SETTINGS, audioBranding: '[Mein Mix]' })
        expect(plan.normalize).toMatchObject({ title: 'Dolby Digital 5.1 [Mein Mix]', language: 'de', bitrate: '640k' })
        expect(plan.normalize?.source.index).toBe(3)
    })

    it('normalisiert nicht bei nicht unterstützten Formaten', () => {
        const plan = planTracks({ ...analysis, audio: [audio(0, { codecId: 'A_TRUEHD', channels: 8 })] }, DEFAULT_SETTINGS)
        expect(plan.normalize).toBeNull()
        expect(plan.normalizeSkipReason).toContain('Dolby TrueHD 7.1')
    })

    it('lässt alles unverändert, wenn die Schritte abgeschaltet sind', () => {
        const plan = planTracks(analysis, {
            ...DEFAULT_SETTINGS,
            pipeline: {
                filterLanguages: false,
                sortTracks: false,
                renameTracks: false,
                dedupeSubtitles: false,
                mergeSubtitles: false,
                normalize: false,
                renameFile: false,
                cleanMetadata: false,
                encodeVideo: false
            }
        })
        expect(plan.audio.map((t) => [t.source.index, t.title])).toEqual([
            [0, 'English'],
            [1, ''],
            [2, 'Deutsch Stereo'],
            [3, 'Deutsch']
        ])
        expect(plan.subtitle).toHaveLength(4)
        expect(plan.normalize).toBeNull()
        expect(plan.normalizeSkipReason).toBeNull()
        expect(plan.video[0].title).toBe('Encoded by X')
    })
})

describe('Externe Untertitel und Forced-Erkennung (The 100 S02E01)', () => {
    // 42,5 Minuten; eingebettete SRT ohne Forced-Flag mit 7 Einträgen, dazu drei VobSubs aus dem Subs-Ordner
    const analysis: FileAnalysis = {
        durationSec: 2549.8,
        video: [{ index: 0, title: '', language: 'en', codec: 'h264' }],
        audio: [audio(0, { language: 'ger' })],
        subtitle: [
            subtitle(0, { language: 'ger', eventCount: 7, default: true }),
            subtitle(0, { inputIndex: 1, externalPath: 'Subs/x-eng.idx', language: 'en', codecId: 'dvd_subtitle', eventCount: 612 }),
            subtitle(0, {
                inputIndex: 2,
                externalPath: 'Subs/x-forced.idx',
                language: 'de',
                codecId: 'dvd_subtitle',
                eventCount: 7,
                filenameForced: true
            }),
            subtitle(0, { inputIndex: 3, externalPath: 'Subs/x.idx', language: 'de', codecId: 'dvd_subtitle', eventCount: 593 })
        ]
    }

    it('erkennt die eingebettete SRT als Forced und behält den vollständigen deutschen VobSub', () => {
        const plan = planTracks(analysis, DEFAULT_SETTINGS)
        expect(plan.subtitle.map((t) => [t.source.inputIndex, t.title, t.dispositions.join('+')])).toEqual([
            [0, 'Deutsch Erzwungen', 'forced'],
            [3, 'Deutsch', ''],
            [1, 'English', '']
        ])
        // Wenige Einträge und Dateiname gelten als "erkannt", normale Spuren als "laut Datei"
        expect(resolveSubtitleType(analysis.subtitle[0], analysis.durationSec)).toEqual({ type: 'forced', source: 'detected' })
        expect(resolveSubtitleType(analysis.subtitle[2], analysis.durationSec)).toEqual({ type: 'forced', source: 'detected' })
        expect(resolveSubtitleType(analysis.subtitle[3], analysis.durationSec)).toEqual({ type: 'normal', source: 'file' })
    })

    it('unterscheidet Markierungen aus der Datei von erkannten Typen', () => {
        expect(resolveSubtitleType(subtitle(0, { forced: true }), 2549.8)).toEqual({ type: 'forced', source: 'file' })
        expect(resolveSubtitleType(subtitle(0, { hearingImpaired: true }), 2549.8)).toEqual({ type: 'sdh', source: 'file' })
        expect(resolveSubtitleType(subtitle(0, { filenameSdh: true }), 2549.8)).toEqual({ type: 'sdh', source: 'detected' })
        expect(resolveSubtitleType(subtitle(0, { title: 'English CC' }), 2549.8)).toEqual({ type: 'cc', source: 'file' })
    })

    it('übernimmt einen manuell gewählten Typ', () => {
        const corrected = {
            ...analysis,
            subtitle: analysis.subtitle.map((t, i) => (i === 0 ? { ...t, typeOverride: 'normal' as const } : t))
        }
        const plan = planTracks(corrected, DEFAULT_SETTINGS)
        // Jetzt ist die SRT "Deutsch normal" und gewinnt per Format-Reihenfolge, der Forced-VobSub rückt nach
        expect(plan.subtitle.map((t) => [t.source.inputIndex, t.title])).toEqual([
            [2, 'Deutsch Erzwungen'],
            [0, 'Deutsch'],
            [1, 'English']
        ])
        expect(resolveSubtitleType(corrected.subtitle[0], analysis.durationSec).source).toBe('override')
        expect(autoSubtitleType(corrected.subtitle[0], analysis.durationSec).type).toBe('forced')
    })

    it('setzt Titel und Markierung passend zum gewählten SDH-Typ', () => {
        const corrected = {
            ...analysis,
            subtitle: analysis.subtitle.map((t, i) => (i === 1 ? { ...t, typeOverride: 'sdh' as const } : t))
        }
        const english = planTracks(corrected, DEFAULT_SETTINGS).subtitle.find((t) => t.language === 'en')
        expect(english).toMatchObject({ title: 'English SDH', dispositions: ['hearing_impaired'] })
    })

    it('lässt externe Untertitel weg, wenn das Einbinden abgeschaltet ist', () => {
        const plan = planTracks(analysis, { ...DEFAULT_SETTINGS, pipeline: { ...DEFAULT_SETTINGS.pipeline, mergeSubtitles: false } })
        expect(plan.subtitle.map((t) => t.source.inputIndex)).toEqual([0])
        expect(plan.removedSubtitles).toEqual({ '1:0': 'external', '2:0': 'external', '3:0': 'external' })
    })
})

describe('Entfernte Untertitel und manuelle Wahl', () => {
    const analysis: FileAnalysis = {
        durationSec: 2880,
        video: [],
        audio: [],
        subtitle: [
            subtitle(0, { language: 'ger', eventCount: 600 }),
            subtitle(1, { language: 'ara', eventCount: 630 }),
            subtitle(2, { language: 'ger', eventCount: 620, codecId: 'S_HDMV/PGS' })
        ]
    }
    const withOverride = (index: number, override: SubtitleOverride): FileAnalysis => ({
        ...analysis,
        subtitle: analysis.subtitle.map((t) => (t.index === index ? { ...t, typeOverride: override } : t))
    })

    it('nennt den Grund für entfernte Spuren', () => {
        const plan = planTracks(analysis, DEFAULT_SETTINGS)
        expect(plan.subtitle.map((t) => t.source.index)).toEqual([0])
        expect(plan.removedSubtitles).toEqual({ '0:1': 'language', '0:2': 'duplicate' })
        expect(subtitleState(plan, analysis.subtitle[1], 2880)).toBe('removed')
        expect(autoSubtitleState(analysis, analysis.subtitle[1], DEFAULT_SETTINGS)).toBe('removed')
    })

    it('übernimmt eine manuell gesetzte Spur trotz Sprachfilter und Duplikat', () => {
        const arabic = planTracks(withOverride(1, 'normal'), DEFAULT_SETTINGS)
        expect(arabic.subtitle.map((t) => [t.source.index, t.title])).toEqual([
            [0, 'Deutsch'],
            [1, 'Arabic']
        ])

        const pgs = planTracks(withOverride(2, 'normal'), DEFAULT_SETTINGS)
        expect(pgs.subtitle.map((t) => t.source.index)).toEqual([0, 2])
    })

    it('entfernt eine Spur manuell; die nächste gleicher Art rückt nach', () => {
        const plan = planTracks(withOverride(0, 'removed'), DEFAULT_SETTINGS)
        expect(plan.subtitle.map((t) => t.source.index)).toEqual([2])
        expect(plan.removedSubtitles['0:0']).toBe('manual')
        // Ohne die manuelle Wahl wäre die Spur normal übernommen worden
        expect(autoSubtitleState(withOverride(0, 'removed'), analysis.subtitle[0], DEFAULT_SETTINGS)).toBe('normal')
    })
})
