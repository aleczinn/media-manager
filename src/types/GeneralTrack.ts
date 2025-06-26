interface GeneralTrack extends BaseTrack {
    '@type': 'General';
    VideoCount: number;
    AudioCount: number
    TextCount: number
    Format: string;
    Format_Version: string;
    FileSize: number;
    Duration: number;
    OverallBitRate: number;
    FrameRate: number;
    FrameCount: number;
    IsStreamable: string;
    Encoded_Date?: string;
    Encoded_Application?: string;
    Encoded_Library?: string;
    extra: any
}