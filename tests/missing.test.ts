import { describe, expect, it } from 'vitest'
import { findEpisodeGaps, interleaveMissing, missingEpisodeStem } from '../src/shared/missing'
import type { TmdbEpisode } from '../src/shared/types'

const episode = (season: number, number: number): TmdbEpisode => ({
    season,
    episode: number,
    title: `Folge ${number}`,
    stillPath: null,
    airDate: null
})
const ref = (season: number, number: number) => ({ season, episode: number })
const file = (season: number, number: number, excluded = false) => ({ ref: ref(season, number), excluded })

const show = [1, 2, 3, 4, 5]
    .map((n) => episode(1, n))
    .concat(
        [1, 2, 3].map((n) => episode(2, n)),
        [episode(0, 1)]
    )

describe('findEpisodeGaps', () => {
    it('findet fehlende Folgen nur in den Staffeln der Dateien', () => {
        const { missing } = findEpisodeGaps(show, [file(2, 1), file(2, 3)])
        expect(missing.map((e) => [e.season, e.episode])).toEqual([[2, 2]])
    })

    it('zählt abgewählte Dateien als vorhanden', () => {
        const { missing } = findEpisodeGaps(show, [file(2, 1), file(2, 2, true), file(2, 3)])
        expect(missing).toEqual([])
    })

    it('meldet Doppelte nur bei angehakten Dateien', () => {
        expect(findEpisodeGaps(show, [file(2, 1), file(2, 1)]).duplicates).toEqual([ref(2, 1)])
        expect(findEpisodeGaps(show, [file(2, 1), file(2, 1, true)]).duplicates).toEqual([])
    })

    it('ignoriert Dateien ohne Zuordnung', () => {
        expect(findEpisodeGaps(show, [{ ref: null, excluded: false }])).toEqual({ missing: [], duplicates: [] })
    })
})

describe('interleaveMissing', () => {
    it('setzt fehlende Folgen an ihre Stelle, am Anfang, in der Mitte und am Ende', () => {
        const files = [ref(1, 2), ref(1, 4), null]
        const missing = [ref(1, 1), ref(1, 3), ref(1, 5)]
        expect(interleaveMissing(files, missing)).toEqual([
            { type: 'missing', index: 0 },
            { type: 'file', index: 0 },
            { type: 'missing', index: 1 },
            { type: 'file', index: 1 },
            { type: 'missing', index: 2 },
            { type: 'file', index: 2 }
        ])
    })

    it('lässt die Dateireihenfolge unverändert', () => {
        const order = interleaveMissing([ref(2, 3), ref(2, 1)], [ref(2, 2)])
        expect(order).toEqual([
            { type: 'file', index: 0 },
            { type: 'file', index: 1 },
            { type: 'missing', index: 0 }
        ])
    })
})

describe('missingEpisodeStem', () => {
    it('übernimmt Edition und Quelle der Nachbardatei', () => {
        const neighbour = { name: 'Show.S02E06.Extended.German.1080p.BluRay', fullPath: 'C:\\in\\Show.S02E06.mkv' }
        expect(missingEpisodeStem(ref(2, 7), 'Titel', neighbour, 'Web')).toBe('S02e07 - Titel {edition-Extended} {source-BluRay}')
    })

    it('nimmt ohne Nachbarn die Standardquelle', () => {
        expect(missingEpisodeStem(ref(1, 3), '', null, 'Web')).toBe('S01e03 - Unknown {source-Web}')
    })
})
