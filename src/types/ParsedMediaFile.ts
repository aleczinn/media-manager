import { MediaFile } from './MediaFile'

export interface ParsedMediaFile extends MediaFile {
    season: string
    episode: string
    title?: string
}