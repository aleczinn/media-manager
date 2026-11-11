import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, isFontAttachment } from '../src/shared/build-args'
import { planTracks } from '../src/shared/pipeline'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import type { AttachmentInfo, FileAnalysis, SubtitleTrackInfo } from '../src/shared/types'

const subtitle = (codecId: string): SubtitleTrackInfo => ({
    inputIndex: 0,
    index: 0,
    eventCount: 500,
    title: '',
    language: 'de',
    codecId,
    default: false,
    forced: false,
    hearingImpaired: false,
    visualImpaired: false,
    original: false,
    dub: false,
    commentary: false,
    lyrics: false,
    karaoke: false
})

const NFO: AttachmentInfo = { index: 0, fileName: 'release.nfo', mimeType: 'text/plain', codec: '' }
const FONT: AttachmentInfo = { index: 1, fileName: 'Arial.ttf', mimeType: 'application/x-truetype-font', codec: 'ttf' }
const COVER: AttachmentInfo = { index: 2, fileName: 'cover.jpg', mimeType: 'image/jpeg', codec: '' }

function args(subtitleCodec: string | null, attachments: AttachmentInfo[]): string {
    const analysis: FileAnalysis = {
        durationSec: 60,
        video: [{ index: 0, title: '', language: 'en', codec: 'h264' }],
        audio: [],
        subtitle: subtitleCodec ? [subtitle(subtitleCodec)] : [],
        attachments
    }
    return buildFfmpegArgs({
        inputPath: 'in.mkv',
        outputPath: 'out.mkv',
        plan: planTracks(analysis, DEFAULT_SETTINGS),
        settings: DEFAULT_SETTINGS,
        gainDb: null,
        description: null,
        attachments
    }).join(' ')
}

describe('Anhänge', () => {
    it('erkennt Schriften an mimetype, Codec oder Endung', () => {
        expect(isFontAttachment(FONT)).toBe(true)
        expect(isFontAttachment({ index: 0, fileName: 'x.otf', mimeType: '', codec: '' })).toBe(true)
        expect(isFontAttachment({ index: 0, fileName: 'x', mimeType: 'font/ttf', codec: '' })).toBe(true)
        expect(isFontAttachment(NFO)).toBe(false)
        expect(isFontAttachment(COVER)).toBe(false)
    })

    it('lässt .nfo und Cover immer weg', () => {
        const result = args('S_TEXT/UTF8', [NFO, COVER])
        expect(result).not.toContain(':t')
    })

    it('behält bei ASS nur die Schriften, samt Metadaten (mimetype)', () => {
        const result = args('S_TEXT/ASS', [NFO, FONT, COVER])
        expect(result).toContain('-map 0:t:1 -c:t:0 copy -map_metadata:s:t:0 0:s:t:1')
        expect(result).not.toContain('0:t:0')
        expect(result).not.toContain('0:t:2')
    })

    it('lässt Schriften ohne ASS-Untertitel weg', () => {
        expect(args('S_TEXT/UTF8', [FONT])).not.toContain(':t')
        expect(args(null, [FONT])).not.toContain(':t')
    })
})
