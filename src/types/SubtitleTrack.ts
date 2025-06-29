import { BaseTrack } from './BaseTrack'

export interface SubtitleTrack extends BaseTrack {
    '@type': 'Text';
    Format: string;
    MuxingMode: string;
    CodecID: string;
    Duration: number;
    BitRate: number;
    FrameRate: number;
    FrameCount: number;
    ElementCount: number;
    StreamSize: number;
    Language?: string;
    Default: string;
    Forced: string;
    HearingImpaired: string;
    VisualImpaired: string;
    Original: string;
    Dub: string;
    Commentary: string;
    Captions: string;
    Descriptions: string;
    CleanEffects: string;
    Lyrics: string;
    Karaoke: string;
    LOCAL_INDEX?: number;
}