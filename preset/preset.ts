export interface Preset{
    name: string;
    languages: string[]
    normalized_audio_branding: string
    encodeVideo: boolean
    encodingOptions: string[]
    renameFix: boolean
    normalizeAudio: boolean
    defaultLanguageForUnknownStream?: string
    atmosOverrideDE: boolean
    atmosOverrideEN: boolean
}