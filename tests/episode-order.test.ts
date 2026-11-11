import { describe, expect, it } from 'vitest'
import { applyEpisodeGroup } from '../src/shared/episode-order'
import type { TmdbEpisode, TmdbEpisodeGroupDetails } from '../src/shared/types'

const aired = (season: number, episode: number, title: string): TmdbEpisode => ({
    season,
    episode,
    title,
    stillPath: `/s${season}e${episode}.jpg`,
    airDate: '2002-09-20'
})

const entry = (order: number, season: number, episode: number, title = 'English') => ({
    order,
    season,
    episode,
    title,
    stillPath: null,
    airDate: null
})

describe('applyEpisodeGroup', () => {
    const airedEpisodes = [aired(1, 1, 'Die Reise'), aired(1, 2, 'Der Zug'), aired(1, 3, 'Bushwhacked'), aired(0, 1, 'Pilot')]

    it('nummeriert nach der Reihenfolge der Gruppe und übernimmt deutsche Titel und Bilder', () => {
        const details: TmdbEpisodeGroupDetails = {
            groups: [{ name: 'Season 1', order: 1, episodes: [entry(1, 1, 2), entry(0, 0, 1), entry(2, 1, 1)] }]
        }
        const { seasons, episodes } = applyEpisodeGroup(details, airedEpisodes)

        expect(seasons).toEqual([{ season: 1, name: 'Season 1', episodeCount: 3 }])
        expect(episodes.map(({ season, episode, title, aired }) => ({ season, episode, title, aired }))).toEqual([
            { season: 1, episode: 1, title: 'Pilot', aired: { season: 0, episode: 1 } },
            { season: 1, episode: 2, title: 'Der Zug', aired: { season: 1, episode: 2 } },
            { season: 1, episode: 3, title: 'Die Reise', aired: { season: 1, episode: 1 } }
        ])
        expect(episodes[0].stillPath).toBe('/s0e1.jpg')
    })

    it('macht Specials zu Staffel 0 und zählt die übrigen Gruppen fortlaufend ab 1', () => {
        const details: TmdbEpisodeGroupDetails = {
            groups: [
                { name: 'Volume 2', order: 2, episodes: [entry(0, 1, 3)] },
                { name: 'Specials', order: 0, episodes: [entry(0, 0, 1)] },
                { name: 'Volume 1', order: 1, episodes: [entry(0, 1, 1), entry(1, 1, 2)] }
            ]
        }
        const { seasons, episodes } = applyEpisodeGroup(details, airedEpisodes)

        expect(seasons.map((s) => [s.season, s.name])).toEqual([
            [0, 'Specials'],
            [1, 'Volume 1'],
            [2, 'Volume 2']
        ])
        // Specials stehen wie bei der Ausstrahlung am Ende
        expect(episodes.map((e) => `${e.season}x${e.episode}`)).toEqual(['1x1', '1x2', '2x1', '0x1'])
    })

    it('nimmt den Titel der Gruppe, wenn die Episode in der Ausstrahlung fehlt', () => {
        const details: TmdbEpisodeGroupDetails = { groups: [{ name: 'Absolute', order: 0, episodes: [entry(0, 5, 9, 'Unknown')] }] }
        const { episodes } = applyEpisodeGroup(details, airedEpisodes)
        expect(episodes[0]).toMatchObject({ season: 1, episode: 1, title: 'Unknown', stillPath: null })
    })
})
