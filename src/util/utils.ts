export function getSubtitleFormat(codecId: string): string {
    const codec = codecId.toLowerCase()

    if (codec.includes('pgs') || codec.includes('s_hdmv')) return 'pgs'
    if (codec.includes('srt') || codec.includes('subrip') || codec.includes('s_text')) return 'srt'
    if (codec.includes('ass') || codec.includes('s_ssa')) return 'ass'
    if (codec.includes('vobsub') || codec.includes('s_vobsub')) return 'vobsub'

    return codec
}