import { describe, expect, it } from 'vitest'
import { buildTargetStem, detectEdition, detectSource, parseEpisode, sourceFolders, validateStem } from '../src/shared/rename'

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

describe('Quellerkennung über Ordnernamen', () => {
    // Echte Struktur: Input\Staffelordner\Folgenordner\rsg-...mkv
    const the100 = {
        name: 'rsg-the-100-s02e01-1080p',
        fullPath:
            'C:\\Loki\\INPUT\\The 100 S02 German DL 1080p BluRay x264-RSG - serienfans org\\The.100.S02E01.Die.48.German.DL.1080p.BluRay.x264-RSG\\rsg-the-100-s02e01-1080p.mkv',
        relativePath:
            'The 100 S02 German DL 1080p BluRay x264-RSG - serienfans org\\The.100.S02E01.Die.48.German.DL.1080p.BluRay.x264-RSG\\rsg-the-100-s02e01-1080p.mkv'
    }

    it('liefert die Ordner von innen nach außen inkl. Input-Ordner', () => {
        expect(sourceFolders(the100)).toEqual([
            'The.100.S02E01.Die.48.German.DL.1080p.BluRay.x264-RSG',
            'The 100 S02 German DL 1080p BluRay x264-RSG - serienfans org',
            'INPUT'
        ])
    })

    it('erkennt BluRay aus dem Ordner, wenn der Dateiname keine Quelle enthält', () => {
        expect(buildTargetStem(the100, 'Web')).toBe('S02e01 - Unknown {source-BluRay}')
    })

    it('der Dateiname hat Vorrang vor dem Ordner, der innerste Ordner vor äußeren', () => {
        expect(detectSource('Show.S01E01.WEB', 'x', 'TV', ['Show.S01.BluRay'])).toBe('Web')
        expect(detectSource('Show.S01E01', 'x', 'TV', ['Show.S01E01.WEB-DL', 'Show.S01.BluRay'])).toBe('Web')
        expect(detectSource('Show.S01E01', 'x', 'TV', ['Show.S01.UHD.Upscale'])).toBe('BluRay')
    })

    it('ignoriert Ordner oberhalb des Input-Ordners', () => {
        const file = { name: 'Show.S01E01', fullPath: 'C:\\WebstormProjects\\in\\Show.S01E01.mkv', relativePath: 'Show.S01E01.mkv' }
        expect(sourceFolders(file)).toEqual(['in'])
        expect(buildTargetStem(file, 'TV')).toBe('S01e01 - Unknown {source-TV}')
    })
})

describe('buildTargetStem', () => {
    it('baut das Schema wie das CLI mit kleinem e und Unknown als Platzhalter', () => {
        expect(buildTargetStem(file('The.Expanse.2015.S02E01.German.DL.EAC3.2160p.DV.HDR.AMZN.WEB.H265-ZeroTwo'), 'Web')).toBe(
            'S02e01 - Unknown {source-Web}'
        )
    })

    it('füllt Staffel und Folge zweistellig auf', () => {
        expect(buildTargetStem(file('Show.S1E2.1080p.WEB-DL'), 'Web')).toBe('S01e02 - Unknown {source-Web}')
    })

    it('fügt einen Titel ein', () => {
        expect(buildTargetStem(file('Show.S01E02.Extended.BluRay'), 'Web', 'Pilot')).toBe(
            'S01e02 - Pilot {edition-Extended} {source-BluRay}'
        )
    })

    it('nutzt Staffel 1, wenn keine angegeben ist', () => {
        expect(buildTargetStem(file('Anime E07'), 'Web')).toBe('S01e07 - Unknown {source-Web}')
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
