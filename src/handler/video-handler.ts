import { VideoTrack } from '../types/VideoTrack'
import { debug } from '../util/logger'
import { RED } from '../ansi'

export function processVideo(tracks: VideoTrack[]): void {
    debug(`${RED}=== ORIGINAL VIDEO TRACKS ===`)
    tracks.forEach((track, i) => {
        const lang = track.Language || 'unknown'
        debug(`${RED}[${i}] ${lang} - "${track.Title}"`)
    })

    tracks.forEach(track => {
        track.Title = ''
        track.Language = 'en'
    })

    debug('\n')
}