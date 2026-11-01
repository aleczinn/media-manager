import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs } from '../src/shared/build-args'
import { planTracks } from '../src/shared/pipeline'
import { sourceFolders } from '../src/shared/rename'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { decideLayout, detect3D, formatFromVideo, stereoWarning, with3DTag, withResolution } from '../src/shared/stereo3d'
import { movieQueryFromFile } from '../src/shared/tmdb-match'
import type { FileAnalysis, VideoTrackInfo } from '../src/shared/types'

const FOLDER = 'Avengers.Endgame.3D.HOU.2019.German.DL.1080p.BluRay.x264-COiNCiDENCE'
const file = {
    name: 'coincidence-endgame-3dhou',
    fullPath: `C:\\in\\${FOLDER}\\coincidence-endgame-3dhou.mkv`,
    relativePath: `${FOLDER}\\coincidence-endgame-3dhou.mkv`
}

describe('detect3D', () => {
    it('erkennt HOU im Beispiel als HTAB (Datei- und Ordnername)', () => {
        expect(detect3D(file.name)).toEqual({ is3D: true, format: 'HTAB' })
        expect(detect3D('film', sourceFolders(file))).toEqual({ is3D: true, format: 'HTAB' })
    })

    it('erkennt die üblichen Schreibweisen', () => {
        expect(detect3D('Avatar.2009.3D.HSBS.1080p').format).toBe('HSBS')
        expect(detect3D('Avatar.2009.3D.Half-SBS.1080p').format).toBe('HSBS')
        expect(detect3D('Avatar.2009.3D.H-OU.1080p').format).toBe('HTAB')
        expect(detect3D('Avatar 2009 3D SBS').format).toBe('HSBS')
        expect(detect3D('Avatar.2009.3D.Full-SBS').format).toBe('FSBS')
        expect(detect3D('Avatar.2009.3D.FTAB').format).toBe('FTAB')
        expect(detect3D('Avatar.2009.3D.MVC.BluRay').format).toBe('MVC')
        expect(detect3D('Avatar (2009) {source-BluRay} 3D.HTAB').format).toBe('HTAB')
    })

    it('meldet 3D ohne Format und ignoriert Wörter wie 3Days', () => {
        expect(detect3D('Avatar.2009.3D.German.1080p.BluRay')).toEqual({ is3D: true, format: null })
        expect(detect3D('3Days.to.Kill.2014.German.1080p')).toEqual({ is3D: false, format: null })
        expect(detect3D('Movie.2020.1080p.x264-3DGroup')).toEqual({ is3D: false, format: null })
    })

    it('nimmt das Format aus dem Ordner, wenn die Datei nur 3D nennt', () => {
        expect(detect3D('film.3d', ['Film.3D.HSBS.2020'])).toEqual({ is3D: true, format: 'HSBS' })
    })
})

describe('with3DTag', () => {
    it('hängt die Kennung ans Ende und verdoppelt sie nicht', () => {
        expect(with3DTag('Avengers Endgame (2019) {source-BluRay}', 'HTAB')).toBe('Avengers Endgame (2019) {source-BluRay} 3D.HTAB')
        expect(with3DTag('Avengers Endgame (2019) {source-BluRay} 3D.HTAB', 'HTAB')).toBe('Avengers Endgame (2019) {source-BluRay} 3D.HTAB')
    })

    it('ersetzt bzw. entfernt eine vorhandene Kennung', () => {
        expect(with3DTag('Avatar (2009) {source-BluRay} 3D.HTAB', 'HSBS')).toBe('Avatar (2009) {source-BluRay} 3D.HSBS')
        expect(with3DTag('Avatar (2009) {source-BluRay} 3D.HTAB', null)).toBe('Avatar (2009) {source-BluRay}')
        expect(with3DTag('Avatar (2009) {source-BluRay}', null)).toBe('Avatar (2009) {source-BluRay}')
    })
})

describe('3D bei der Filmsuche und in ffmpeg', () => {
    it('lässt die 3D-Angabe aus dem Suchbegriff weg', () => {
        expect(movieQueryFromFile(file)).toEqual({ query: 'Avengers Endgame', year: 2019 })
    })

    const analysis: FileAnalysis = {
        durationSec: 60,
        video: [{ index: 0, title: '', language: 'en', codec: 'h264' }],
        audio: [],
        subtitle: []
    }
    const args = (stereo3d?: 'HTAB' | 'HSBS' | 'MVC') =>
        buildFfmpegArgs({
            inputPath: 'in.mkv',
            outputPath: 'out.mkv',
            plan: planTracks(analysis, DEFAULT_SETTINGS),
            settings: DEFAULT_SETTINGS,
            gainDb: null,
            description: null,
            stereo3d
        }).join(' ')

    it('schreibt stereo_mode in die Videospur, nicht bei MVC', () => {
        expect(args('HTAB')).toContain('-metadata:s:v:0 stereo_mode=top_bottom')
        expect(args('HSBS')).toContain('-metadata:s:v:0 stereo_mode=left_right')
        expect(args('MVC')).not.toContain('stereo_mode')
        expect(args()).not.toContain('stereo_mode')
    })
})

describe('3D aus Datei, Auflösung und Bildinhalt', () => {
    const video = (patch: Partial<VideoTrackInfo>): VideoTrackInfo => ({ index: 0, title: '', language: '', codec: 'h264', ...patch })

    it('kennt die Kurzformen HTB und FTB', () => {
        expect(detect3D('Film.2020.3D.HTB.1080p').format).toBe('HTAB')
        expect(detect3D('Film.2020.3D.FTB.1080p').format).toBe('FTAB')
    })

    it('wählt Half oder Full nach der Bildgröße', () => {
        expect(withResolution('sbs', { width: 1920, height: 1080 })).toBe('HSBS')
        expect(withResolution('sbs', { width: 3840, height: 1080 })).toBe('FSBS')
        expect(withResolution('tab', { width: 1920, height: 1080 })).toBe('HTAB')
        expect(withResolution('tab', { width: 1920, height: 2160 })).toBe('FTAB')
        expect(withResolution('sbs', undefined)).toBe('HSBS')
    })

    it('liest stereo_mode und MVC aus der Datei', () => {
        expect(formatFromVideo(video({ width: 1920, height: 800, stereoMode: 'left_right' }))).toBe('HSBS')
        expect(formatFromVideo(video({ width: 1920, height: 2160, stereoMode: 'top_bottom' }))).toBe('FTAB')
        expect(formatFromVideo(video({ mvc: true }))).toBe('MVC')
        expect(formatFromVideo(video({ stereoMode: 'mono' }))).toBeNull()
    })

    it('entscheidet am Abstand der SSIM-Werte (gemessen an echten Dateien)', () => {
        // Avengers Endgame 3D HOU: oben/unten durchgehend ähnlicher
        const hou = { sbs: [0.799, 0.782, 0.788, 0.837, 0.831, 0.77], tab: [0.951, 0.899, 0.896, 0.911, 0.905, 0.922] }
        // Independence Day 3D (SBS): links/rechts durchgehend ähnlicher
        const sbs = { sbs: [0.809, 0.957, 0.919, 0.872, 0.965, 0.851], tab: [0.663, 0.898, 0.813, 0.705, 0.918, 0.741] }
        // 2D-Zeichentrick und 2D-Aufnahme: kaum Abstand bzw. wechselnde Richtung
        const cartoon = { sbs: [0.338, 0.696, 0.638, 0.576, 0.479, 0.741], tab: [0.325, 0.675, 0.634, 0.49, 0.495, 0.694] }
        const flat = { sbs: [0.738, 0.736, 0.739, 0.74, 0.743, 0.763], tab: [0.746, 0.744, 0.747, 0.747, 0.751, 0.774] }
        expect(decideLayout(hou.sbs, hou.tab)).toBe('tab')
        expect(decideLayout(sbs.sbs, sbs.tab)).toBe('sbs')
        expect(decideLayout(cartoon.sbs, cartoon.tab)).toBeNull()
        expect(decideLayout(flat.sbs, flat.tab)).toBeNull()
        expect(decideLayout([], [])).toBeNull()
    })

    it('warnt, wenn das Format nicht zur Datei passt', () => {
        expect(stereoWarning('HSBS', video({ width: 3840, height: 1080 }))).toBe('Auflösung 3840×1080 passt eher zu FSBS')
        expect(stereoWarning('FTAB', video({ width: 1920, height: 1080 }))).toBe('Auflösung 1920×1080 passt eher zu HTAB')
        expect(stereoWarning('HTAB', video({ width: 1920, height: 1080 }))).toBeNull()
        expect(stereoWarning('MVC', video({}))).toBe('Keine MVC-Spur in der Datei gefunden')
        expect(stereoWarning('HSBS', video({ mvc: true }))).toContain('MVC')
        expect(stereoWarning(null, video({ width: 3840, height: 1080 }))).toBeNull()
    })
})
