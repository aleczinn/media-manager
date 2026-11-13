import { describe, expect, it } from 'vitest'
import {
    fullSizeThumbnails,
    linkForMode,
    downloadStem,
    parseFormat,
    parseProgressLine,
    parseSource,
    phaseOfLine,
    resolveManual,
    resolveSelection,
    sanitizeFileName,
    summarizeFormats,
    translateError,
    type YtFormat
} from '../src/shared/youtube-dl'

/** Gekürzte Formatliste wie von `yt-dlp -J` (Felder wie im Original) */
const RAW_FORMATS = [
    { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none', format_note: 'storyboard' },
    { format_id: '249-drc', ext: 'webm', vcodec: 'none', acodec: 'opus', tbr: 50, filesize: 1000, format_note: 'low, DRC' },
    { format_id: '139', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.5', tbr: 49, filesize: 900 },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', tbr: 129, filesize: 3000 },
    { format_id: '251', ext: 'webm', vcodec: 'none', acodec: 'opus', tbr: 135, filesize: 3100 },
    { format_id: '18', ext: 'mp4', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', height: 360, tbr: 500 },
    { format_id: '137', ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', height: 1080, fps: 30, tbr: 4000, filesize: 90000 },
    { format_id: '248', ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 1080, fps: 30, tbr: 2500, filesize: 60000 },
    { format_id: '313', ext: 'webm', vcodec: 'vp9', acodec: 'none', height: 2160, fps: 30, tbr: 17000, filesize: 400000 },
    { format_id: '399', ext: 'mp4', vcodec: 'av01.0.08M.08', acodec: 'none', height: 1080, fps: 30, tbr: 2000, filesize: 50000 },
    { format_id: '337', ext: 'webm', vcodec: 'vp09.02.51.10', acodec: 'none', height: 2160, fps: 60, tbr: 30000, dynamic_range: 'HDR10' }
]
const formats: YtFormat[] = RAW_FORMATS.map(parseFormat)

describe('summarizeFormats', () => {
    it('erkennt Codecs mit ihrer höchsten Auflösung und ignoriert Storyboards und DRC', () => {
        const summary = summarizeFormats(formats)
        expect(summary.video).toEqual([
            { codec: 'av1', maxHeight: 1080, maxFps: 30 },
            { codec: 'vp9', maxHeight: 2160, maxFps: 60 },
            { codec: 'h264', maxHeight: 1080, maxFps: 30 }
        ])
        expect(summary.audio.map((audio) => audio.codec).sort()).toEqual(['aac', 'opus'])
    })
})

describe('resolveSelection', () => {
    it('nimmt die höchste Auflösung und fällt dafür auf VP9 zurück (SDR vor HDR)', () => {
        const resolved = resolveSelection({ type: 'video', videoCodec: 'av1', maxHeight: null, audioCodec: 'opus' }, formats, 100)!
        expect(resolved.formatSpec).toBe('313+251')
        expect(resolved.ext).toBe('mkv')
        expect(resolved.label).toBe('VP9 2160p + Opus 135k')
        expect(resolved.notice).toBe('AV1 nur bis 1080p, VP9 2160p genutzt')
        expect(resolved.partSizes).toEqual([400000, 3100])
    })

    it('bleibt mit Grenze 1080p beim gewünschten Codec', () => {
        const av1 = resolveSelection({ type: 'video', videoCodec: 'av1', maxHeight: 1080, audioCodec: 'aac' }, formats, 100)!
        expect(av1.formatSpec).toBe('399+140')
        expect(av1.notice).toBeNull()
        const h264 = resolveSelection({ type: 'video', videoCodec: 'h264', maxHeight: 1080, audioCodec: 'opus' }, formats, 100)!
        expect(h264.formatSpec).toBe('137+251')
    })

    it('Nur Audio: Opus und AAC ohne Umwandlung, MP3 umgewandelt', () => {
        const opus = resolveSelection({ type: 'audio', videoCodec: 'av1', maxHeight: null, audioCodec: 'opus' }, formats, 100)!
        expect(opus).toMatchObject({ formatSpec: '251', audioOnly: 'opus', ext: 'opus', notice: null })
        const aac = resolveSelection({ type: 'audio', videoCodec: 'av1', maxHeight: null, audioCodec: 'aac' }, formats, 100)!
        expect(aac).toMatchObject({ formatSpec: '140', ext: 'm4a' })
        const mp3 = resolveSelection({ type: 'audio', videoCodec: 'av1', maxHeight: null, audioCodec: 'mp3' }, formats, 100)!
        expect(mp3).toMatchObject({ formatSpec: '251', ext: 'mp3', label: 'Opus 135k → MP3' })
    })

    it('bevorzugt die deutsche Tonspur, sonst die Originalspur', () => {
        const multi = [
            ...formats.filter((format) => format.vcodec),
            parseFormat({
                format_id: '251-0',
                ext: 'webm',
                vcodec: 'none',
                acodec: 'opus',
                tbr: 140,
                language: 'en-US',
                format_note: 'English original (default)'
            }),
            parseFormat({
                format_id: '251-1',
                ext: 'webm',
                vcodec: 'none',
                acodec: 'opus',
                tbr: 120,
                language: 'de-DE',
                format_note: 'German'
            }),
            parseFormat({
                format_id: '251-2',
                ext: 'webm',
                vcodec: 'none',
                acodec: 'opus',
                tbr: 150,
                language: 'fr-FR',
                format_note: 'French'
            })
        ]
        const selection = { type: 'video' as const, videoCodec: 'vp9' as const, maxHeight: 1080, audioCodec: 'opus' as const }
        expect(resolveSelection(selection, multi, 100)!.formatSpec).toBe('248+251-1')
        const noGerman = multi.filter((format) => format.language !== 'de-DE')
        expect(resolveSelection(selection, noGerman, 100)!.formatSpec).toBe('248+251-0')
    })

    it('liefert nichts ohne passende Formate', () => {
        expect(resolveSelection({ type: 'video', videoCodec: 'av1', maxHeight: 240, audioCodec: 'opus' }, formats, 100)).toBeNull()
    })
})

describe('resolveManual', () => {
    it('kombiniert die gewählten Formate', () => {
        expect(resolveManual('337', '140', formats, 100)).toMatchObject({
            formatSpec: '337+140',
            ext: 'mkv',
            label: 'VP9 2160p60 HDR + AAC 129k'
        })
        expect(resolveManual(null, '251', formats, 100)).toMatchObject({ formatSpec: '251', audioOnly: 'opus', ext: 'opus' })
    })
})

describe('parseSource', () => {
    it('liest eine flache Playlist', () => {
        const source = parseSource(
            {
                _type: 'playlist',
                title: 'Meine Playlist',
                channel: 'Kanal',
                thumbnails: [{ url: 'https://i.ytimg.com/pl/small.jpg' }, { url: 'https://i.ytimg.com/pl/big.jpg' }],
                entries: [
                    { id: 'a1', url: 'https://www.youtube.com/watch?v=a1', title: 'Erstes', duration: 61 },
                    { id: 'b2', title: 'Zweites', thumbnails: [{ url: 'https://i.ytimg.com/vi/b2/hq.jpg' }] }
                ]
            },
            'https://www.youtube.com/playlist?list=X'
        )
        expect(source.kind).toBe('playlist')
        expect(source.thumbnail).toBe('https://i.ytimg.com/pl/big.jpg')
        expect(source.entries).toEqual([
            { id: 'a1', url: 'https://www.youtube.com/watch?v=a1', title: 'Erstes', durationSec: 61, thumbnail: null, index: 1 },
            {
                id: 'b2',
                url: 'https://www.youtube.com/watch?v=b2',
                title: 'Zweites',
                durationSec: null,
                thumbnail: 'https://i.ytimg.com/vi/b2/hq.jpg',
                index: 2
            }
        ])
    })

    it('liest ein Einzelvideo mit Formaten', () => {
        const source = parseSource(
            { id: 'v1', title: 'Video', duration: 10, formats: RAW_FORMATS, description: 'Text' },
            'https://youtu.be/v1'
        )
        expect(source.kind).toBe('video')
        expect(source.video?.formats).toHaveLength(RAW_FORMATS.length)
        expect(source.entries[0]).toMatchObject({ id: 'v1', index: 1 })
    })
})

describe('Dateinamen', () => {
    it('ersetzt verbotene Zeichen wie yt-dlp und behält Emojis', () => {
        expect(sanitizeFileName('Was ist das? | Teil 1/2: "Test" 🎉')).toBe('Was ist das？ ｜ Teil 1⧸2： ＂Test＂ 🎉')
        expect(sanitizeFileName('Ende...  ')).toBe('Ende')
        expect(sanitizeFileName('CON')).toBe('_CON')
    })

    it('setzt bei Playlists die Nummer davor', () => {
        const playlist = { kind: 'playlist' as const, entryCount: 120 }
        expect(downloadStem({ title: 'Folge: 1', index: 7 }, playlist, { indexPrefix: true })).toBe('007 - Folge： 1')
        expect(downloadStem({ title: 'Folge', index: 7 }, playlist, { indexPrefix: false })).toBe('Folge')
        expect(downloadStem({ title: 'Video', index: 1 }, { kind: 'video', entryCount: 1 }, { indexPrefix: true })).toBe('Video')
    })
})

describe('Ausgabe von yt-dlp', () => {
    it('liest Fortschrittszeilen', () => {
        expect(parseProgressLine('MMDL 1048576 4194304 NA 524288.5 6')).toEqual({
            downloaded: 1048576,
            total: 4194304,
            speed: 524288.5,
            etaSec: 6
        })
        expect(parseProgressLine('MMDL 100 NA 2000 NA NA')).toEqual({ downloaded: 100, total: 2000, speed: null, etaSec: null })
        expect(parseProgressLine('[download] 10%')).toBeNull()
        expect(phaseOfLine('[Merger] Merging formats into "x.mkv"')).toBe('merge')
        expect(phaseOfLine('[ExtractAudio] Destination: x.mp3')).toBe('post')
    })

    it('übersetzt bekannte Fehler', () => {
        expect(translateError(['WARNING: x', "ERROR: [youtube] abc: Private video. Sign in if you've been granted access"])).toEqual({
            message: 'Privates Video',
            retryable: false
        })
        expect(
            translateError(['ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.']).message
        ).toMatch(/Altersbeschränkt/)
        expect(translateError(['ERROR: [youtube] abc: Sign in to confirm you’re not a bot']).message).toMatch(/kein Bot/)
        expect(translateError(['ERROR: unable to download video data: HTTP Error 503: Service Unavailable']).retryable).toBe(true)
        expect(translateError(['ERROR: Something odd'])).toEqual({ message: 'Something odd', retryable: false })
    })
})

describe('linkForMode', () => {
    const both = 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI&index=3'
    it('nimmt bei Video in Playlist je nach Schalter nur das Video oder die Playlist', () => {
        expect(linkForMode(both, 'video')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
        expect(linkForMode(both, 'playlist')).toBe('https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI')
    })

    it('erkennt Kurzlinks und Shorts, reine Playlists passen nicht zu Einzelvideo', () => {
        expect(linkForMode('https://youtu.be/jNQXAC9IVRw?si=abc', 'video')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
        expect(linkForMode('https://www.youtube.com/shorts/jNQXAC9IVRw', 'playlist')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
        expect(linkForMode('https://www.youtube.com/playlist?list=PL123', 'video')).toBeNull()
        expect(linkForMode('https://www.youtube.com/playlist?list=PL123', 'playlist')).toBe('https://www.youtube.com/playlist?list=PL123')
    })
})

describe('fullSizeThumbnails', () => {
    it('nimmt für Playlist-Bilder das große Bild des Videos zuerst', () => {
        expect(fullSizeThumbnails('https://i.ytimg.com/vi/fOT0BUpITw8/hqdefault.jpg?sqp=abc&rs=x')).toEqual([
            'https://i.ytimg.com/vi/fOT0BUpITw8/maxresdefault.jpg',
            'https://i.ytimg.com/vi/fOT0BUpITw8/hqdefault.jpg',
            'https://i.ytimg.com/vi/fOT0BUpITw8/hqdefault.jpg?sqp=abc&rs=x'
        ])
        expect(fullSizeThumbnails('https://yt3.ggpht.com/abc=s900')).toEqual(['https://yt3.ggpht.com/abc=s900'])
        expect(fullSizeThumbnails(null)).toEqual([])
    })
})
