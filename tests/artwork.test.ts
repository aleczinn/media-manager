import { describe, expect, it } from 'vitest'
import {
    artworkFileName,
    buildArtworkJobs,
    landscapeCandidates,
    seasonSlot,
    sortCandidates,
    type ArtworkPlanInput
} from '../src/shared/artwork'
import { overlayFiles, overlaysFromNames, toggleOverlay } from '../src/shared/overlays'
import { buildTargetStem } from '../src/shared/rename'
import { movieQueryFromFile } from '../src/shared/tmdb-match'
import type { ArtworkCandidate, ArtworkCandidates } from '../src/shared/types'

const candidate = (url: string, lang: string | null, score = 0, source: ArtworkCandidate['source'] = 'tmdb'): ArtworkCandidate => ({
    source,
    url,
    previewUrl: url,
    lang,
    score
})

describe('Overlays', () => {
    it('Extended und Director’s Cut schließen sich aus', () => {
        expect(toggleOverlay(['upscale', 'extended'], 'directors-cut')).toEqual(['upscale', 'directors-cut'])
        expect(toggleOverlay(['extended'], 'upscale')).toEqual(['upscale', 'extended'])
        expect(toggleOverlay(['upscale', 'extended'], 'extended')).toEqual(['upscale'])
    })

    it('IMAX und Regrade ergeben die kombinierte Grafik', () => {
        expect(overlayFiles(['imax'])).toEqual(['overlay-imax.png'])
        expect(overlayFiles(['regrade', 'imax', '4k'])).toEqual(['overlay-4k.png', 'overlay-regrade-imax.png'])
        expect(overlayFiles(['extended', 'upscale'])).toEqual(['overlay-upscale.png', 'overlay-extended.png'])
    })

    it('belegt aus den Namen vor', () => {
        expect(overlaysFromNames(['Movie.2010.Extended.German.DL.2160p.UpsUHD.x265'])).toEqual(['upscale', 'extended'])
        expect(overlaysFromNames(['Dune.Part.Two.2024.IMAX.German.DL.2160p.UHD.BluRay'])).toEqual(['4k', 'imax'])
        expect(overlaysFromNames(['Film.Directors.Cut.REGRADE.1080p'])).toEqual(['directors-cut', 'regrade'])
        expect(overlaysFromNames(['rsg-the-100-s02e01-1080p'])).toEqual([])
    })
})

describe('Bilder-Export', () => {
    it('benennt die Dateien wie Jellyfin und Kodi', () => {
        expect(artworkFileName('poster')).toBe('cover.jpg')
        expect(artworkFileName('logo')).toBe('logo.png')
        expect(artworkFileName('landscape')).toBe('landscape.jpg')
        expect(artworkFileName(seasonSlot(2))).toBe('season02-poster.jpg')
        expect(artworkFileName(seasonSlot(0))).toBe('season-specials-poster.jpg')
    })

    it('sortiert TMDB vor Fanart.tv, dann Deutsch vor Englisch, Backdrops ohne Text zuerst', () => {
        const list = [
            candidate('fanart-de', 'de', 50, 'fanart'),
            candidate('en', 'en', 9),
            candidate('none', null, 5),
            candidate('de-low', 'de', 1),
            candidate('de-high', 'de', 3)
        ]
        expect(sortCandidates(list, 'poster').map((c) => c.url)).toEqual(['de-high', 'de-low', 'en', 'none', 'fanart-de'])
        expect(sortCandidates(list, 'backdrop').map((c) => c.url)).toEqual(['none', 'de-high', 'de-low', 'en', 'fanart-de'])
    })

    it('hängt bei Landscape die Backdrops an, die mit Text zuerst', () => {
        const landscape = [candidate('thumb', 'en', 1, 'fanart')]
        const backdrops = [candidate('bd-none', null, 9), candidate('bd-fanart', null, 9, 'fanart'), candidate('bd-en', 'en', 1)]
        const result = landscapeCandidates(landscape, backdrops)
        expect(result.map((c) => c.url)).toEqual(['thumb', 'bd-en', 'bd-none', 'bd-fanart'])
        expect(result.map((c) => !!c.fromBackdrop)).toEqual([false, true, true, true])
    })

    it('baut Jobs aus Auswahl, Standardbildern und Overlays', () => {
        const candidates: ArtworkCandidates = {
            poster: [candidate('poster-1', 'de'), candidate('poster-2', 'en')],
            logo: [candidate('logo-1', 'de')],
            backdrop: [],
            landscape: [candidate('landscape-1', 'en')],
            seasons: { 1: [candidate('s1', 'de')], 2: [candidate('s2', 'de')], 3: [candidate('s3', 'de')] }
        }
        const input: ArtworkPlanInput = {
            candidates,
            selection: { poster: 'poster-2' },
            enabled: { landscape: false, 'season:3': true },
            seasons: [3, 2, 1],
            fileSeasons: [2],
            coverOverlays: ['extended', 'upscale'],
            seasonOverlays: { 3: ['4k'] }
        }
        // Staffel 1 ist nicht in den Dateien und nicht angehakt, Staffel 3 manuell angehakt; Staffelposter ohne eigene Wahl ohne Overlays
        expect(buildArtworkJobs(input)).toEqual([
            { fileName: 'cover.jpg', url: 'poster-2', kind: 'poster', overlays: ['extended', 'upscale'] },
            { fileName: 'logo.png', url: 'logo-1', kind: 'logo', overlays: [] },
            { fileName: 'season02-poster.jpg', url: 's2', kind: 'poster', overlays: [] },
            { fileName: 'season03-poster.jpg', url: 's3', kind: 'poster', overlays: ['4k'] }
        ])
    })
})

describe('Filme', () => {
    const file = (name: string, folder = '') => ({
        name,
        fullPath: `C:\\in\\${folder ? `${folder}\\` : ''}${name}.mkv`,
        relativePath: `${folder ? `${folder}\\` : ''}${name}.mkv`
    })

    it('liest Titel und Jahr aus dem Namen', () => {
        expect(movieQueryFromFile(file('Dune.Part.Two.2024.IMAX.German.DL.2160p.UHD.BluRay.x265-GROUP'))).toEqual({
            query: 'Dune Part Two',
            year: 2024
        })
        expect(movieQueryFromFile(file('Blade.Runner.2049.2017.German.DL.1080p'))).toEqual({ query: 'Blade Runner 2049', year: 2017 })
        expect(movieQueryFromFile(file('Wonder.Woman.1984.2020.German.1080p'))).toEqual({ query: 'Wonder Woman 1984', year: 2020 })
        expect(movieQueryFromFile(file('Charlottes.Web.2006.German.720p'))).toEqual({ query: 'Charlottes Web', year: 2006 })
    })

    it('nimmt den Ordner, wenn der Dateiname kein Jahr hat', () => {
        expect(movieQueryFromFile(file('rsg-dune2-2160p', 'Dune.Part.Two.2024.German.DL.2160p'))).toEqual({
            query: 'Dune Part Two',
            year: 2024
        })
    })

    it('benennt den Film mit Titel, Jahr, Edition und Quelle', () => {
        const dune = file('Dune.Part.Two.2024.IMAX.German.DL.2160p.UHD.BluRay.x265-GROUP')
        expect(buildTargetStem(dune, 'Web', '', { title: 'Dune - Part Two', year: 2024 })).toBe('Dune - Part Two (2024) {source-UHD}')
        const extended = file('Movie.2010.Extended.German.DL.1080p.BluRay')
        expect(buildTargetStem(extended, 'Web', '', { title: 'Movie', year: 2010 })).toBe('Movie (2010) {edition-Extended} {source-BluRay}')
        expect(buildTargetStem(extended, 'Web')).toBe(extended.name)
    })
})
