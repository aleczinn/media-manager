import { describe, expect, it } from 'vitest'
import { isSubtitleFile, matchSubtitlesToVideo, subtitleHintsFromFilename } from '../src/shared/external-subs'

describe('subtitleHintsFromFilename', () => {
    const video = 'rsg-the-100-s02e01-1080p'

    it('liest Sprache und Forced aus Release-Namen', () => {
        expect(subtitleHintsFromFilename('rsg-the-100-s02e01-1080p-eng.idx', video)).toEqual({ language: 'en', forced: false, sdh: false })
        expect(subtitleHintsFromFilename('rsg-the-100-s02e01-1080p-forced.idx', video)).toEqual({
            language: null,
            forced: true,
            sdh: false
        })
        expect(subtitleHintsFromFilename('rsg-the-100-s02e01-1080p.idx', video)).toEqual({ language: null, forced: false, sdh: false })
    })

    it('erkennt gängige Muster neben dem Video', () => {
        expect(subtitleHintsFromFilename('Folge.de.forced.srt', 'Folge')).toEqual({ language: 'de', forced: true, sdh: false })
        expect(subtitleHintsFromFilename('Folge.English.SDH.srt', 'Folge')).toEqual({ language: 'en', forced: false, sdh: true })
        expect(subtitleHintsFromFilename('Folge.fre.ass', 'Folge')).toMatchObject({ language: 'fr' })
    })

    it('wertet "hi" als SDH und nicht als Hindi', () => {
        expect(subtitleHintsFromFilename('Folge.en.hi.srt', 'Folge')).toEqual({ language: 'en', forced: false, sdh: true })
    })

    it('erkennt Untertitelformate', () => {
        expect(isSubtitleFile('a.IDX')).toBe(true)
        expect(isSubtitleFile('a.sup')).toBe(true)
        expect(isSubtitleFile('a.sub')).toBe(false)
        expect(isSubtitleFile('a.sfv')).toBe(false)
    })
})

describe('matchSubtitlesToVideo', () => {
    const subs = ['show-s01e01-eng.idx', 'show-s01e02-eng.idx', 'S01E02.forced.srt']

    it('nimmt im Subs-Ordner alles, wenn nur ein Video im Ordner liegt', () => {
        expect(matchSubtitlesToVideo('irgendwas', 1, subs, true)).toEqual(subs)
    })

    it('ordnet bei mehreren Videos über Namen oder Staffel/Folge zu', () => {
        expect(matchSubtitlesToVideo('show-s01e02', 2, subs, true)).toEqual(['show-s01e02-eng.idx', 'S01E02.forced.srt'])
    })

    it('nimmt lose Dateien nur, wenn sie mit dem Videonamen beginnen', () => {
        expect(matchSubtitlesToVideo('Folge', 1, ['Folge.de.srt', 'Andere.de.srt'], false)).toEqual(['Folge.de.srt'])
    })
})
