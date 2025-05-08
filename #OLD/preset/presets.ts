import {Preset} from "./preset";

export const animeCopy: Preset = {
    name: "Anime with Encode 1080p",
    languages: ['ger', 'eng', 'jpn'],
    normalized_audio_branding: "[Sky Mix]",
    encodeVideo: false,
    encodingOptions: [],
    renameFix: true,
    normalizeAudio: true,
    atmosOverrideDE: false,
    atmosOverrideEN: false
};

export const animeWithEncode: Preset = {
    name: "Anime with Encode 1080p",
    languages: ['ger', 'eng', 'jpn'],
    normalized_audio_branding: "[Sky Mix]",
    encodeVideo: true,
    encodingOptions: ['libx264', '-crf 19', '-preset slow', '-x264-params ref=5:bframes=5'],
    renameFix: true,
    normalizeAudio: true,
    atmosOverrideDE: false,
    atmosOverrideEN: false
};

export const uhdCopy: Preset = {
    name: "UHD Copy",
    languages: ['ger', 'eng'],
    normalized_audio_branding: "[Sky Mix]",
    encodeVideo: false,
    encodingOptions: [],
    renameFix: false,
    normalizeAudio: false,
    atmosOverrideDE: false,
    atmosOverrideEN: false
};

export const uhdEncode: Preset = {
    name: "UHD Copy",
    languages: ['ger', 'eng'],
    normalized_audio_branding: "[Sky Mix]",
    encodeVideo: true,
    encodingOptions: ['libx265', '-pix_fmt yuv420p10le', '-crf 19', '-preset medium', 'x265-params aq-mode=1:selective-sao=0:no-sao=1:no-rect=1:no-open-gop=1:rskip=0:no-rskip=1:no-amp=1'],
    renameFix: false,
    normalizeAudio: false,
    atmosOverrideDE: false,
    atmosOverrideEN: false
};