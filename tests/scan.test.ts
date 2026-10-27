import { describe, expect, it } from 'vitest'
import { buildScanArgs, parseScanLine, subtitleOutputIndex, type ScanOutcome } from '../src/main/scan'
import { analysisKey } from '../src/shared/peak'
import { hasUncountedSubtitles, withSubtitleCounts } from '../src/shared/pipeline'
import type { FileAnalysis, SubtitleTrackInfo } from '../src/shared/types'

describe('buildScanArgs', () => {
    it('kombiniert Peak und Zählung in einem Lauf', () => {
        const args = buildScanArgs('in.mkv', 0, true).join(' ')
        expect(args).toContain('-v verbose')
        expect(args).toContain('-i in.mkv -map 0:a:0 -af volumedetect -f null - -map 0:s? -c copy -f null -')
        expect(subtitleOutputIndex(0)).toBe(1)
    })

    it('macht nur, was gebraucht wird', () => {
        expect(buildScanArgs('in.mkv', null, true).join(' ')).toContain('-i in.mkv -map 0:s? -c copy -f null -')
        expect(buildScanArgs('in.mkv', null, true)).not.toContain('volumedetect')
        expect(buildScanArgs('in.mkv', 2, false).join(' ')).toContain('-map 0:a:2 -af volumedetect -f null -')
        expect(buildScanArgs('in.mkv', 2, false)).not.toContain('0:s?')
        expect(subtitleOutputIndex(null)).toBe(0)
    })
})

describe('parseScanLine', () => {
    // Echte Ausgabe von ffmpeg 8 (The 100 S02E11, -v verbose)
    const lines = [
        '[Parsed_volumedetect_0 @ 00000260ff402c40] max_volume: -4.1 dB',
        '[out#1/null @ 000002608150f940]   Output stream #1:0 (subtitle): 13 packets muxed (333 bytes); ',
        '[out#1/null @ 000002608150f940]   Output stream #1:1 (subtitle): 0 packets muxed (0 bytes); ',
        '[in#0/matroska,webm @ 00000260ff945000]   Input stream #0:3 (subtitle): 13 packets read (333 bytes); '
    ]

    it('liest Peak und Einträge je Untertitelspur', () => {
        const outcome: ScanOutcome = { maxVolume: null, subtitleCounts: [] }
        lines.forEach((line) => parseScanLine(line, outcome, 1))
        expect(outcome).toEqual({ maxVolume: -4.1, subtitleCounts: [13, 0] })
    })

    it('ignoriert andere Ausgaben und nicht angefragte Zählungen', () => {
        const outcome: ScanOutcome = { maxVolume: null, subtitleCounts: null }
        lines.forEach((line) => parseScanLine(line, outcome, 1))
        expect(outcome.subtitleCounts).toBeNull()

        const wrongOutput: ScanOutcome = { maxVolume: null, subtitleCounts: [] }
        lines.forEach((line) => parseScanLine(line, wrongOutput, 0))
        expect(wrongOutput.subtitleCounts).toEqual([])
    })
})

describe('withSubtitleCounts', () => {
    const track = (inputIndex: number, index: number, eventCount: number | null): SubtitleTrackInfo => ({
        inputIndex,
        index,
        eventCount,
        title: '',
        language: 'de',
        codecId: 'S_TEXT/UTF8',
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
    const analysis: FileAnalysis = {
        durationSec: 2550,
        video: [],
        audio: [],
        subtitle: [track(0, 0, null), track(0, 1, 640), track(1, 0, 593)]
    }

    it('ergänzt nur fehlende Zählungen eingebetteter Spuren', () => {
        expect(hasUncountedSubtitles(analysis)).toBe(true)
        const counted = withSubtitleCounts(analysis, [7, 999])
        expect(counted.subtitle.map((t) => t.eventCount)).toEqual([7, 640, 593])
        expect(hasUncountedSubtitles(counted)).toBe(false)
    })

    it('lässt die Analyse ohne Zählung unverändert', () => {
        expect(withSubtitleCounts(analysis, undefined)).toBe(analysis)
        expect(withSubtitleCounts(analysis, null)).toBe(analysis)
    })
})

describe('analysisKey', () => {
    const file = { fullPath: 'C:\in\a.mkv', size: 100, modifiedMs: 1, externalSubtitles: [{ path: 'C:\in\a.de.srt', size: 5 }] }

    it('bleibt für eine unveränderte Datei gleich', () => {
        expect(analysisKey({ ...file })).toBe(analysisKey(file))
    })

    it('ändert sich mit Größe, Änderungszeit oder externen Untertiteln', () => {
        expect(analysisKey({ ...file, size: 101 })).not.toBe(analysisKey(file))
        expect(analysisKey({ ...file, modifiedMs: 2 })).not.toBe(analysisKey(file))
        expect(analysisKey({ ...file, externalSubtitles: [] })).not.toBe(analysisKey(file))
    })
})
