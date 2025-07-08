import { BaseTrack } from './BaseTrack'

export interface AudioTrack extends BaseTrack {
    '@type': 'Audio';
    Format: string;
    Format_Commercial_IfAny? : string;
    Format_Settings_Endianness: string;
    Format_AdditionalFeatures?: string;
    CodecID: string;
    Duration: number;
    BitRate_Mode: string;
    BitRate: number;
    Channels: number;
    ChannelPositions: string;
    ChannelLayout: string;
    SamplesPerFrame: number;
    SamplingRate: number;
    SamplingCount: number;
    FrameRate: number;
    FrameCount: number;
    Compression_Mode: string;
    Delay: number;
    Delay_Source: string;
    Video_Delay: number;
    StreamSize: number;
    Language?: string;
    ServiceKind: string;
    Default: string;
    Forced: string;
    extra: {
        bsid: string;
        dialnorm: string;
        compr: string;
        acmod: string;
        lfeon: string;
        dmixmod: string;
        ltrtcmixlev: string;
        ltrtsurmixlev: string;
        lorocmixlev: string;
        lorosurmixlev: string;
        dialnorm_Average: string;
        dialnorm_Minimum: string;
        compr_Average: string;
        compr_Minimum: string;
        compr_Maximum: string;
        compr_Count: string;
    }
    LOCAL_INDEX?: number;
}