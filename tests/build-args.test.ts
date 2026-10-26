import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs } from '../src/shared/build-args'
import { findConflicts } from '../src/shared/conflicts'
import { planTracks } from '../src/shared/pipeline'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { estimateRequiredBytes, getSpaceLevel, GB } from '../src/shared/space'
import type { FileAnalysis } from '../src/shared/types'

const analysis: FileAnalysis = {
    durationSec: 3600,
    video: [{ index: 0, title: '', language: 'en', codec: 'hevc' }],
    audio: [
        {
            index: 0,
            title: 'Deutsch',
            language: 'de',
            codecId: 'A_EAC3',
            format: 'E-AC-3',
            formatCommercial: '',
            additionalFeatures: '',
            channels: 6,
            default: true
        },
        {
            index: 1,
            title: 'English',
            language: 'en',
            codecId: 'A_AC3',
            format: 'AC-3',
            formatCommercial: '',
            additionalFeatures: '',
            channels: 2,
            default: false
        }
    ],
    subtitle: [
        {
            index: 0,
            title: 'Forced',
            language: 'de',
            codecId: 'S_TEXT/UTF8',
            default: true,
            forced: true,
            hearingImpaired: false,
            visualImpaired: false,
            original: false,
            dub: false,
            commentary: false,
            lyrics: false,
            karaoke: false
        }
    ]
}

describe('buildFfmpegArgs', () => {
    const plan = planTracks(analysis, DEFAULT_SETTINGS)

    it('setzt die normalisierte Spur vor die kopierten Tonspuren', () => {
        const args = buildFfmpegArgs({
            inputPath: 'in.mkv',
            outputPath: 'out.mkv.partial',
            plan,
            settings: DEFAULT_SETTINGS,
            gainDb: 3.25,
            description: 'Inhalt'
        })
        const joined = args.join(' ')

        expect(joined).toContain('-fflags +genpts -i in.mkv')
        expect(joined).toContain('-metadata title= -metadata description=Inhalt')
        expect(joined).toContain('-map 0:v:0 -map_metadata:s:v:0 -1 -c:v:0 copy')
        expect(joined).toContain('-filter_complex [0:a:0]volume=3.3dB[peak_normalized] -map [peak_normalized] -c:a:0 ac3 -b:a:0 640k')
        expect(args).toContain('title=Dolby Digital 5.1 [Sky Mix]')
        expect(joined).toContain(
            '-map 0:a:0 -c:a:1 copy -metadata:s:a:1 title=Dolby Digital Plus 5.1 -metadata:s:a:1 language=de -disposition:a:1 0'
        )
        expect(joined).toContain('-map 0:a:1 -c:a:2 copy')
        expect(joined).toContain(
            '-map 0:s:0 -c:s:0 copy -metadata:s:s:0 title=Deutsch Erzwungen -metadata:s:s:0 language=de -disposition:s:0 forced'
        )
        expect(args.slice(-3)).toEqual(['-f', 'matroska', 'out.mkv.partial'])
        expect(args).not.toContain('-fps_mode')
    })

    it('lässt die normalisierte Spur weg, wenn kein Gain feststeht', () => {
        const args = buildFfmpegArgs({
            inputPath: 'in.mkv',
            outputPath: 'o',
            plan,
            settings: DEFAULT_SETTINGS,
            gainDb: null,
            description: null
        })
        expect(args).not.toContain('-filter_complex')
        expect(args.join(' ')).toContain('-map 0:a:0 -c:a:0 copy')
    })

    it('nutzt beim Video-Encoding Codec und Argumente aus den Einstellungen', () => {
        const settings = { ...DEFAULT_SETTINGS, pipeline: { ...DEFAULT_SETTINGS.pipeline, encodeVideo: true } }
        const args = buildFfmpegArgs({ inputPath: 'in', outputPath: 'o', plan, settings, gainDb: null, description: null })
        expect(args.join(' ')).toContain('-c:v:0 libx264 -crf 18 -preset slow -x264-params ref=5:bframes=5')
        expect(args.join(' ')).toContain('-fps_mode cfr')
    })
})

describe('Speicherplatz', () => {
    it('rechnet die neue AC3-Spur zur Dateigröße dazu', () => {
        const plan = planTracks(analysis, DEFAULT_SETTINGS)
        // 640 kbit/s × 3600 s / 8 = 288 MB
        expect(estimateRequiredBytes([{ size: 1000, durationSec: 3600, plan }])).toBe(1000 + 288_000_000)
    })

    it('stuft knappen und fehlenden Platz ein', () => {
        expect(getSpaceLevel(20 * GB, 100 * GB, 10)).toBe('ok')
        expect(getSpaceLevel(25 * GB, 30 * GB, 10)).toBe('low')
        expect(getSpaceLevel(25 * GB, 20 * GB, 10)).toBe('insufficient')
    })
})

describe('findConflicts', () => {
    it('meldet existierende, doppelte und ungültige Namen', () => {
        const conflicts = findConflicts(
            [
                { id: 'a', stem: 'S01E01 {source-Web}' },
                { id: 'b', stem: 'S01E02' },
                { id: 'c', stem: 's01e02' },
                { id: 'd', stem: 'bad:name' },
                { id: 'e', stem: 'S01E03' }
            ],
            ['S01E01 {source-Web}.mkv']
        )
        expect(conflicts.get('a')?.reason).toBe('exists')
        expect(conflicts.get('b')?.reason).toBe('duplicate')
        expect(conflicts.get('c')?.reason).toBe('duplicate')
        expect(conflicts.get('d')?.reason).toBe('invalid')
        expect(conflicts.has('e')).toBe(false)
    })
})
