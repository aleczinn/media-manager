import { describe, expect, it } from 'vitest'
import { getAudioTrackName, getAudioType } from '../src/shared/audio-names'
import { normalizeLanguage } from '../src/shared/languages'
import { planTracks } from '../src/shared/pipeline'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { AudioTrackInfo, FileAnalysis, SubtitleTrackInfo } from '../src/shared/types'

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
    index,
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
