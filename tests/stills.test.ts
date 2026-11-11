import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { chooseDefaultStill, isHd, needsFrames, readJpegSize, sortByResolution, stillSize } from '../src/shared/stills'

const small = { path: '/small.jpg', width: 666, height: 375 }
const tiny = { path: '/tiny.jpg', width: 400, height: 300 }
const tmdbHd = { path: '/hd.jpg', width: 1920, height: 1080 }
const frame = { position: 1 / 3, path: 'C:\frames\frame-33.jpg', width: 1280, height: 720 }
const sdFrame = { ...frame, width: 720, height: 576 }

describe('isHd', () => {
    it('reicht 1280 breit oder 720 hoch', () => {
        expect(isHd({ width: 1280, height: 720 })).toBe(true)
        expect(isHd({ width: 1920, height: 800 })).toBe(true)
        expect(isHd({ width: 960, height: 720 })).toBe(true)
        expect(isHd({ width: 666, height: 375 })).toBe(false)
    })
})

describe('chooseDefaultStill', () => {
    it('behält ein TMDB-Standardbild in HD', () => {
        expect(chooseDefaultStill('/hd.jpg', [tmdbHd, small], [frame])).toEqual({ path: '/hd.jpg', replacedLowRes: null })
    })

    it('ersetzt ein zu kleines TMDB-Bild durch das Standbild aus dem Video und merkt sich die alte Größe', () => {
        expect(chooseDefaultStill('/small.jpg', [small, tmdbHd], [frame])).toEqual({
            path: frame.path,
            replacedLowRes: { width: 666, height: 375 }
        })
    })

    it('nimmt ohne HD-Standbild ein anderes HD-Bild von TMDB', () => {
        expect(chooseDefaultStill('/small.jpg', [small, tmdbHd], [sdFrame]).path).toBe('/hd.jpg')
        expect(chooseDefaultStill('/small.jpg', [small, tmdbHd], null).path).toBe('/hd.jpg')
    })

    it('behält das kleine Bild, wenn es nichts in HD gibt oder die Bildliste noch fehlt', () => {
        expect(chooseDefaultStill('/small.jpg', [small, tiny], [sdFrame])).toEqual({ path: '/small.jpg', replacedLowRes: null })
        expect(chooseDefaultStill('/small.jpg', null, [frame])).toEqual({ path: '/small.jpg', replacedLowRes: null })
    })

    it('ohne TMDB-Bild (z. B. Teil 2) das Standbild bei einem Drittel', () => {
        expect(chooseDefaultStill(null, [], [frame, sdFrame])).toEqual({ path: frame.path, replacedLowRes: null })
        expect(chooseDefaultStill(null, null, null).path).toBeNull()
    })
})

describe('needsFrames / stillSize / sortByResolution', () => {
    it('braucht Standbilder ohne TMDB-Bild oder bei zu kleinem', () => {
        expect(needsFrames(null, null)).toBe(true)
        expect(needsFrames('/small.jpg', null)).toBe(false)
        expect(needsFrames('/small.jpg', [small])).toBe(true)
        expect(needsFrames('/hd.jpg', [tmdbHd])).toBe(false)
    })

    it('kennt die Größe aus Bildliste oder Standbild', () => {
        expect(stillSize('/small.jpg', [small], null)).toEqual({ width: 666, height: 375 })
        expect(stillSize(frame.path, [], [frame])).toEqual({ width: 1280, height: 720 })
        expect(stillSize('/unknown.jpg', [small], null)).toBeNull()
    })

    it('stellt kleine Bilder ans Ende, sonst bleibt die Reihenfolge', () => {
        expect(sortByResolution([small, tmdbHd, tiny, frame]).map((image) => image.path)).toEqual([
            '/hd.jpg',
            frame.path,
            '/small.jpg',
            '/tiny.jpg'
        ])
    })
})

describe('readJpegSize', () => {
    it('liest die Größe aus einem echten JPG und lehnt anderes ab', () => {
        const dir = new URL('../resources/overlays/', import.meta.url)
        const jpg = fs.readdirSync(dir).find((name) => /\.jpe?g$/i.test(name))
        if (jpg) expect(readJpegSize(fs.readFileSync(new URL(jpg, dir)))).toMatchObject({ width: expect.any(Number) })
        // Minimal-JPG: SOI, APP0 (Länge 4), SOF0 mit 720×1280
        const data = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03])
        expect(readJpegSize(data)).toEqual({ width: 1280, height: 720 })
        expect(readJpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    })
})
