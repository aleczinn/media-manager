import { GeneralTrack } from './GeneralTrack'
import { VideoTrack } from './VideoTrack'
import { AudioTrack } from './AudioTrack'
import { SubtitleTrack } from './SubtitleTrack'

export interface SeparatedTracks {
    general: GeneralTrack;
    video: VideoTrack[];
    audio: AudioTrack[];
    subtitle: SubtitleTrack[];
}