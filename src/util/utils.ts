export function getSubtitleFormat(codecId: string): string {
    const codec = codecId.toLowerCase()

    if (codec.includes('pgs') || codec.includes('s_hdmv')) return 'pgs'
    if (codec.includes('srt') || codec.includes('subrip') || codec.includes('s_text')) return 'srt'
    if (codec.includes('ass') || codec.includes('s_ssa')) return 'ass'
    if (codec.includes('vobsub') || codec.includes('s_vobsub')) return 'vobsub'

    return codec
}

export function isDefaultTrack(track: any): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('default') ||
        track.Default == 'Yes'
}

export function isForcedSubtitle(track: any): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('forced') ||
        title.includes('erzwungen') ||
        track.Forced == 'Yes'
}

export function isSDHSubtitle(track: any): boolean {
    const title = (track.Title || '').toLowerCase()

    return title.includes('sdh') ||
        title.includes('hearing impaired') ||
        track.HearingImpaired == 'Yes'
}