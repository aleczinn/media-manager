import { VideoTrack } from '../types/VideoTrack'
import { debug } from '../util/logger'

export function processVideo(tracks: VideoTrack[]): void {
    debug('=== ORIGINAL VIDEO TRACKS ===')
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        debug(`[${i}] ${lang} - "${track.Title}"`)
    })

    tracks.forEach(track => {
        track.Title = ''
        track.Language = 'en'
    })

    debug('\n')
}