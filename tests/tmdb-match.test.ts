import { describe, expect, it } from 'vitest'
import { buildTargetStem } from '../src/shared/rename'
import {
    episodeRefFromName,
    findEpisode,
    isPlaceholderTitle,
    sanitizeTitle,
    seriesQueryFromFile,
    splitYear
} from '../src/shared/tmdb-match'
import type { TmdbEpisode } from '../src/shared/types'

describe('seriesQueryFromFile', () => {
    it('trennt das Jahr vom Seriennamen', () => {
        const file = {
            name: 'The.Expanse.2015.S02E01.German.DL.EAC3.2160p.DV.HDR.AMZN.WEB.H265-ZeroTwo',
            fullPath: 'C:\\in\\The.Expanse.2015.S02E01.German.DL.EAC3.2160p.DV.HDR.AMZN.WEB.H265-ZeroTwo.mkv',
            relativePath: 'The.Expanse.2015.S02E01.German.DL.EAC3.2160p.DV.HDR.AMZN.WEB.H265-ZeroTwo.mkv'
        }
        expect(seriesQueryFromFile(file)).toEqual({ query: 'The Expanse', year: 2015 })
    })

    it('nimmt den Release-Ordner statt des gekürzten Dateinamens', () => {
        const file = {
            name: 'rsg-the-100-s02e01-1080p',
            fullPath:
                'C:\\INPUT\\The 100 S02 German DL 1080p BluRay x264-RSG - serienfans org\\The.100.S02E01.Die.48.German.DL.1080p.BluRay.x264-RSG\\rsg-the-100-s02e01-1080p.mkv',
            relativePath:
                'The 100 S02 German DL 1080p BluRay x264-RSG - serienfans org\\The.100.S02E01.Die.48.German.DL.1080p.BluRay.x264-RSG\\rsg-the-100-s02e01-1080p.mkv'
        }
        expect(seriesQueryFromFile(file)).toEqual({ query: 'The 100', year: null })
    })

    it('liefert null ohne Episodenangabe', () => {
        expect(
            seriesQueryFromFile({ name: 'Ein Film 2023', fullPath: 'C:\\in\\Ein Film 2023.mkv', relativePath: 'Ein Film 2023.mkv' })
        ).toBeNull()
    })

    it('lässt Zahlen stehen, die kein plausibles Jahr sind', () => {
        expect(splitYear('Blade Runner 2049', 2030)).toEqual({ query: 'Blade Runner 2049', year: null })
        expect(splitYear('Andor 2022', 2030)).toEqual({ query: 'Andor', year: 2022 })
    })
})

describe('Episoden-Zuordnung', () => {
    const episodes: TmdbEpisode[] = [
        { season: 1, episode: 1, title: 'Kassa', stillPath: '/a.jpg' },
        { season: 1, episode: 2, title: 'Das wird regnen', stillPath: null }
    ]

    it('findet die Episode per SxxEyy, ohne Staffel gilt Staffel 1', () => {
        expect(findEpisode(episodes, episodeRefFromName('Andor.S01E02.German'))?.title).toBe('Das wird regnen')
        expect(findEpisode(episodes, episodeRefFromName('Andor E01'))?.title).toBe('Kassa')
        expect(findEpisode(episodes, episodeRefFromName('Andor.S02E01'))).toBeNull()
        expect(findEpisode(episodes, null)).toBeNull()
    })

    it('erkennt TMDB-Platzhaltertitel ohne Übersetzung', () => {
        expect(isPlaceholderTitle('Episode 5')).toBe(true)
        expect(isPlaceholderTitle('Folge 12')).toBe(true)
        expect(isPlaceholderTitle('')).toBe(true)
        expect(isPlaceholderTitle('Kassa')).toBe(false)
        expect(isPlaceholderTitle('Episode 5: Die Rückkehr')).toBe(false)
    })

    it('macht Titel dateinamentauglich', () => {
        expect(sanitizeTitle('Teil 1: Kassa')).toBe('Teil 1 - Kassa')
        expect(sanitizeTitle('Wer? Was? Wo?')).toBe('Wer Was Wo')
        expect(sanitizeTitle('AC/DC "Live"')).toBe('AC-DC Live')
        expect(sanitizeTitle('Ende...')).toBe('Ende')
    })

    it('setzt den Titel in den Zielnamen ein', () => {
        const file = { name: 'Andor.S01E01.German.DL.2160p.WEB', fullPath: 'C:\\in\\x.mkv', relativePath: 'x.mkv' }
        expect(buildTargetStem(file, 'Web', sanitizeTitle('Kassa'))).toBe('S01e01 - Kassa {source-Web}')
    })
})
