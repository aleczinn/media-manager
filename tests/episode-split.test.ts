import { describe, expect, it } from 'vitest'
import { applyEpisodeGroup, splitEpisodes } from '../src/shared/episode-order'
import type { TmdbEpisode, TmdbSeasonSummary } from '../src/shared/types'

const ep = (season: number, episode: number, title: string): TmdbEpisode => ({
    season,
    episode,
    title,
    overview: `Inhalt ${title}`,
    stillPath: `/s${season}e${episode}.jpg`,
    airDate: '2010-12-04'
})

// Big Time Rush laut TMDB: „Weihnachten“ ist eine lange Folge 2x8, danach Guru
const episodes = [
    ep(2, 7, 'Big Time - Streiche'),
    ep(2, 8, 'Big Time - Weihnachten'),
    ep(2, 9, 'Big Time - Guru'),
    ep(2, 10, 'Big Time - Doppel-Date'),
    ep(3, 1, 'Big Time - Reunion'),
    ep(0, 1, 'Special')
]
const seasons: TmdbSeasonSummary[] = [
    { season: 0, name: 'Specials', episodeCount: 1 },
    { season: 2, name: 'Staffel 2', episodeCount: 10 },
    { season: 3, name: 'Staffel 3', episodeCount: 1 }
]
const short = (list: TmdbEpisode[]) => list.map((e) => `${e.season}x${e.episode} ${e.title}`)

describe('splitEpisodes', () => {
    it('ändert ohne Teilung nichts', () => {
        expect(splitEpisodes(episodes, seasons, {})).toEqual({ seasons, episodes })
        expect(splitEpisodes(episodes, seasons, { '2x8': 1 })).toEqual({ seasons, episodes })
    })

    it('teilt eine Folge und lässt nur die späteren derselben Staffel nachrücken', () => {
        const result = splitEpisodes(episodes, seasons, { '2x8': 2 })
        expect(short(result.episodes)).toEqual([
            '2x7 Big Time - Streiche',
            '2x8 Big Time - Weihnachten (Teil 1)',
            '2x9 Big Time - Weihnachten (Teil 2)',
            '2x10 Big Time - Guru',
            '2x11 Big Time - Doppel-Date',
            '3x1 Big Time - Reunion',
            '0x1 Special'
        ])
        expect(result.seasons.find((s) => s.season === 2)?.episodeCount).toBe(11)
    })

    it('Teil 2 hat kein TMDB-Bild, alle verschobenen Folgen kennen ihre TMDB-Nummer', () => {
        const [, part1, part2, guru] = splitEpisodes(episodes, seasons, { '2x8': 2 }).episodes
        expect(part1).toMatchObject({ stillPath: '/s2e8.jpg', part: { index: 1, count: 2 }, aired: { season: 2, episode: 8 } })
        expect(part2).toMatchObject({ stillPath: null, part: { index: 2, count: 2 }, aired: { season: 2, episode: 8 } })
        expect(part2.overview).toBe('Inhalt Big Time - Weihnachten')
        expect(guru).toMatchObject({ episode: 10, stillPath: '/s2e9.jpg', aired: { season: 2, episode: 9 } })
        expect(guru.part).toBeUndefined()
    })

    it('mehrere Teilungen in einer Staffel addieren sich', () => {
        const result = splitEpisodes(episodes, seasons, { '2x7': 2, '2x9': 3 })
        expect(short(result.episodes).slice(0, 7)).toEqual([
            '2x7 Big Time - Streiche (Teil 1)',
            '2x8 Big Time - Streiche (Teil 2)',
            '2x9 Big Time - Weihnachten',
            '2x10 Big Time - Guru (Teil 1)',
            '2x11 Big Time - Guru (Teil 2)',
            '2x12 Big Time - Guru (Teil 3)',
            '2x13 Big Time - Doppel-Date'
        ])
    })

    it('gilt über die Nummer der Ausstrahlung auch in einer anderen Reihenfolge', () => {
        const dvd = applyEpisodeGroup(
            {
                groups: [
                    {
                        name: 'Season 1',
                        order: 1,
                        episodes: [
                            { order: 0, season: 2, episode: 8, title: '', overview: '', stillPath: null, airDate: null },
                            { order: 1, season: 2, episode: 9, title: '', overview: '', stillPath: null, airDate: null }
                        ]
                    }
                ]
            },
            episodes
        )
        expect(short(splitEpisodes(dvd.episodes, dvd.seasons, { '2x8': 2 }).episodes)).toEqual([
            '1x1 Big Time - Weihnachten (Teil 1)',
            '1x2 Big Time - Weihnachten (Teil 2)',
            '1x3 Big Time - Guru'
        ])
    })
})
