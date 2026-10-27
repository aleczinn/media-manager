import { describe, expect, it } from 'vitest'
import { planTracks } from '../src/shared/pipeline'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { AudioTrackInfo, FileAnalysis } from '../src/shared/types'
import { cleanYoutubeName, matchSidecars } from '../src/shared/youtube'

const TITLE = 'The Blood of Dawnwalker • #01 🧛 Ein Lied von Blut, Pest und Psychosen'

describe('cleanYoutubeName', () => {
    it('entfernt alle Qualitätsangaben von JDownloader', () => {
        for (const quality of [
            '1152p_30fps_VP9-128kbit_AAC',
            '1080p_30fps_H264-128kbit_AAC',
            '1080p_60fps_H264-128kbit_AAC',
            '1080p_60fps_H264-128kbit_AAC-Deutsch',
            '1440p_60fps_VP9-128kbit_AAC',
            '1440p_60fps_AV1-128kbit_AAC',
            '1440p_60fps_AV1-128kbit_AAC-Deutsch',
            '2160p_60fps_AV1-128kbit_AAC',
            '2160p_60fps_AV1-128kbit_AAC-Deutsch',
            '2160p_60fps_VP9-128kbit_AAC',
            '720p_30fps_H264-192kbit_AAC'
        ]) {
            expect(cleanYoutubeName(`${TITLE} (${quality})`)).toBe(TITLE)
        }
    })

    it('entfernt (Beschreibung) und (BQ), Emojis und Sonderzeichen bleiben', () => {
        expect(cleanYoutubeName(`${TITLE} (Beschreibung)`)).toBe(TITLE)
        expect(cleanYoutubeName(`${TITLE} (BQ)`)).toBe(TITLE)
        expect(cleanYoutubeName(TITLE)).toBe(TITLE)
    })

    it('lässt andere Klammern im Titel stehen', () => {
        expect(cleanYoutubeName('Folge 3 (Teil 2) (1080p_60fps_H264-128kbit_AAC)')).toBe('Folge 3 (Teil 2)')
    })
})

describe('matchSidecars', () => {
    const files = [
        `${TITLE} (2160p_60fps_AV1-128kbit_AAC).mp4`,
        `${TITLE} (Beschreibung).txt`,
        `${TITLE} (BQ).jpg`,
        'Anderes Video (Beschreibung).txt',
        'Anderes Video (BQ).jpg'
    ]

    it('findet Beschreibung und Bild über den bereinigten Namen', () => {
        expect(matchSidecars(`${TITLE} (2160p_60fps_AV1-128kbit_AAC)`, files)).toEqual({
            description: `${TITLE} (Beschreibung).txt`,
            image: `${TITLE} (BQ).jpg`
        })
    })

    it('findet auch exakt gleich benannte Dateien, unabhängig von der Schreibweise', () => {
        expect(matchSidecars('Film', ['Film.mkv', 'film.TXT', 'Film.jpeg'])).toEqual({ description: 'film.TXT', image: 'Film.jpeg' })
    })

    it('ordnet fremde Dateien nicht zu', () => {
        expect(matchSidecars('Drittes Video (1080p_60fps_H264-128kbit_AAC)', files)).toEqual({ description: null, image: null })
    })
})

describe('Tonspur im YouTube-Modus', () => {
    const track = (index: number, language: string): AudioTrackInfo => ({
        index,
        title: '',
        language,
        codecId: 'aac',
        format: 'AAC',
        formatCommercial: '',
        additionalFeatures: '',
        channels: 2,
        default: false
    })
    const analysis: FileAnalysis = { durationSec: 600, video: [], audio: [track(0, 'eng'), track(1, 'und')], subtitle: [] }

    it('setzt jede Tonspur auf Deutsch, auch die normalisierte', () => {
        const plan = planTracks(analysis, { ...DEFAULT_SETTINGS, mode: 'youtube' })
        expect(plan.audio.map((t) => t.language)).toEqual(['de', 'de'])
        expect(plan.normalize?.language).toBe('de')
    })

    it('lässt die Sprache im normalen Modus wie getaggt (und fällt beim Sprachfilter raus)', () => {
        const plan = planTracks(analysis, DEFAULT_SETTINGS)
        expect(plan.audio.map((t) => t.language)).toEqual(['en'])
    })
})
