import { describe, expect, it } from 'vitest'
import { buildEpisodeNfo, buildMovieNfo, chooseEpisodePlot, escapeXml } from '../src/shared/nfo'
import { isLocalImagePath, stillImageUrl } from '../src/shared/tmdb-match'

describe('buildEpisodeNfo', () => {
    const part2 = {
        showTitle: 'Big Time Rush',
        season: 2,
        episode: 9,
        title: 'Big Time - Weihnachten (Teil 2)',
        plot: 'Die Jungs wollen über die Feiertage nach Minnesota & müssen vorher eine EP aufnehmen.',
        aired: '2010-12-04',
        lock: true
    }

    it('schreibt Titel, Serie, Nummer, Inhalt und Datum mit sauberem Escaping', () => {
        const xml = buildEpisodeNfo(part2)
        expect(xml.startsWith('<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<episodedetails>')).toBe(true)
        expect(xml).toContain('  <title>Big Time - Weihnachten (Teil 2)</title>')
        expect(xml).toContain('  <showtitle>Big Time Rush</showtitle>')
        expect(xml).toContain('  <season>2</season>')
        expect(xml).toContain('  <episode>9</episode>')
        expect(xml).toContain('Minnesota &amp; müssen')
        expect(xml).toContain('  <aired>2010-12-04</aired>')
        expect(xml).toContain('  <lockdata>true</lockdata>')
        expect(xml.trimEnd().endsWith('</episodedetails>')).toBe(true)
    })

    it('sperrt nur bei Abweichung von TMDB und lässt leere Felder weg', () => {
        const xml = buildEpisodeNfo({ ...part2, lock: false, plot: '', aired: null })
        expect(xml).not.toContain('lockdata')
        expect(xml).not.toContain('<plot>')
        expect(xml).not.toContain('<aired>')
    })
})

describe('buildMovieNfo', () => {
    it('schreibt Genres und die TMDB-ID, Originaltitel nur wenn abweichend', () => {
        const xml = buildMovieNfo({
            title: 'Dune: Part Two',
            originalTitle: 'Dune: Part Two',
            year: 2024,
            plot: 'Paul <Atreides>',
            genres: ['Science Fiction', 'Abenteuer'],
            tmdbId: 693134
        })
        expect(xml).toContain('<movie>')
        expect(xml).not.toContain('originaltitle')
        expect(xml).toContain('  <year>2024</year>')
        expect(xml).toContain('  <plot>Paul &lt;Atreides&gt;</plot>')
        expect(xml).toContain('  <genre>Science Fiction</genre>\n  <genre>Abenteuer</genre>')
        expect(xml).toContain('  <uniqueid type="tmdb" default="true">693134</uniqueid>')
        expect(xml).toContain('  <tmdbid>693134</tmdbid>')
    })

    it('escapt Anführungszeichen', () => {
        expect(escapeXml(`"Big Time" 'Rush'`)).toBe('&quot;Big Time&quot; &apos;Rush&apos;')
    })
})

describe('stillImageUrl', () => {
    it('unterscheidet TMDB-Pfade von lokalen Standbildern', () => {
        expect(isLocalImagePath('/abc.jpg')).toBe(false)
        expect(isLocalImagePath('C:\\Temp\\frame-33.jpg')).toBe(true)
        expect(isLocalImagePath('\\\\nas\\frames\\frame.jpg')).toBe(true)
        expect(stillImageUrl('/abc.jpg', 'w300')).toBe('https://image.tmdb.org/t/p/w300/abc.jpg')
        expect(stillImageUrl('C:\\Temp\\frame-33.jpg')).toBe('local-image://image/C%3A%5CTemp%5Cframe-33.jpg')
    })
})

describe('chooseEpisodePlot', () => {
    const fileTags = { description: 'Big Time Rush und die Palm-Woods-Kids verbringen den Tag in Griffins Strandhaus.' }

    const normal = { isPart: false, useFile: true }
    // So wie bei „Strand-Party“: TMDB hat nur eine englische Beschreibung
    const englishOnly = { overview: '', overviewEn: 'Big Time Rush and the Palm Woods kids get to hang out at the beach house.' }

    it('nimmt die deutsche von TMDB, sonst die aus der Datei', () => {
        expect(chooseEpisodePlot({ overview: 'Deutsch von TMDB' }, fileTags, normal)).toEqual({ text: 'Deutsch von TMDB', source: 'tmdb' })
        expect(chooseEpisodePlot(englishOnly, fileTags, normal)).toEqual({ text: fileTags.description, source: 'file' })
        expect(chooseEpisodePlot({ overview: '  ' }, { synopsis: 'Synopsis' }, normal)).toEqual({ text: 'Synopsis', source: 'file' })
    })

    it('nimmt die englische nur als letzten Ersatz', () => {
        // Datei ohne Beschreibung
        expect(chooseEpisodePlot(englishOnly, { comment: 'Encoded by XY' }, normal)).toEqual({ text: englishOnly.overviewEn, source: 'tmdb-en' })
        // Beschreibung aus der Datei abgeschaltet
        expect(chooseEpisodePlot(englishOnly, fileTags, { isPart: false, useFile: false }).source).toBe('tmdb-en')
    })

    it('bevorzugt bei einem Teil die Datei, weil TMDB die ganze Doppelfolge beschreibt', () => {
        expect(chooseEpisodePlot({ overview: 'Ganze Folge' }, fileTags, { isPart: true, useFile: true }).source).toBe('file')
        expect(chooseEpisodePlot({ overview: 'Ganze Folge' }, undefined, { isPart: true, useFile: true })).toEqual({
            text: 'Ganze Folge',
            source: 'tmdb'
        })
        expect(chooseEpisodePlot({ overview: 'Ganze Folge' }, fileTags, { isPart: true, useFile: false }).source).toBe('tmdb')
    })

    it('meldet, wenn es gar keine Beschreibung gibt', () => {
        expect(chooseEpisodePlot({ overview: '' }, { comment: 'Encoded by XY' }, normal)).toEqual({ text: '', source: null })
    })
})
