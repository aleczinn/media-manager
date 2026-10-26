import { describe, expect, it } from 'vitest'
import { buildTargetStem, detectEdition, detectSource, parseEpisode, validateStem } from '../src/shared/rename'

const file = (name: string, dir = 'C:\\in') => ({ name, fullPath: `${dir}\\${name}.mkv` })

describe('parseEpisode', () => {
    it('erkennt SxxEyy und den Seriennamen', () => {
        expect(parseEpisode('the.mandalorian.S02E05.1080p.WEB')).toEqual({ season: 2, episode: 5, series: 'The Mandalorian' })
    })

    it('erkennt 1x02', () => {
        expect(parseEpisode('Show_1x02_German')).toMatchObject({ season: 1, episode: 2 })
    })

    it('erkennt ein alleinstehendes E01 ohne Staffel', () => {
        expect(parseEpisode('Anime - E07 - 720p')).toMatchObject({ season: null, episode: 7 })
    })

    it('liefert null ohne Episodenangabe', () => {
        expect(parseEpisode('Ein Film 2023 1080p')).toBeNull()
    })
})

describe('detectEdition / detectSource', () => {
    it('kombiniert Extended und Upscale', () => {
        expect(detectEdition('Movie.Extended.UPSUHD')).toBe('Extended-Upscale')
        expect(detectEdition('Movie.Directors.Cut')).toBe("Director's Cut")
    })

    it('erkennt Disney+ über dsnp im Pfad (alter Tippfehler dspn behoben)', () => {
        expect(detectSource('Show.S01E01', 'D:\\DSNP\\Show.S01E01.mkv', 'Web')).toBe('Disney+')
    })

    it('erkennt Amazon über den Ordnernamen', () => {
        expect(detectSource('Show.S01E01', 'D:\\Amazon\\Show.S01E01.mkv', 'Web')).toBe('Amazon')
    })

    it('UHD-Upscale wird als BluRay-Quelle gewertet', () => {
        expect(detectSource('Show.S01E01.UHD.Upscale', 'x', 'Web')).toBe('BluRay')
        expect(detectSource('Show.S01E01.UHD', 'x', 'Web')).toBe('UHD')
    })

    it('fällt auf die Standard-Quelle zurück', () => {
        expect(detectSource('Show.S01E01.x264', 'C:\\in\\Show.S01E01.x264.mkv', 'TV')).toBe('TV')
    })
})

describe('buildTargetStem', () => {
    it('baut das Schema mit Padding und ohne Titel', () => {
        expect(buildTargetStem(file('Show.S1E2.1080p.WEB-DL'), 'Web')).toBe('S01E02 {source-Web}')
    })

    it('fügt einen Titel ein', () => {
        expect(buildTargetStem(file('Show.S01E02.Extended.BluRay'), 'Web', 'Pilot')).toBe(
            'S01E02 - Pilot {edition-Extended} {source-BluRay}'
        )
    })

    it('nutzt Staffel 1, wenn keine angegeben ist', () => {
        expect(buildTargetStem(file('Anime E07'), 'Web')).toBe('S01E07 {source-Web}')
    })

    it('lässt bereits formatierte und nicht erkannte Namen unverändert', () => {
        expect(buildTargetStem(file('S01E02 - Pilot {source-Web}'), 'Web')).toBe('S01E02 - Pilot {source-Web}')
        expect(buildTargetStem(file('Ein Film 2023'), 'Web')).toBe('Ein Film 2023')
    })
})

describe('validateStem', () => {
    it('lehnt ungültige Windows-Dateinamen ab', () => {
        expect(validateStem('a:b')).not.toBeNull()
        expect(validateStem('  ')).not.toBeNull()
        expect(validateStem('name.')).not.toBeNull()
        expect(validateStem("S01E01 - Director's Cut")).toBeNull()
    })
})
