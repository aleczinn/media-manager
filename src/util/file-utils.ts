import mediaInfoFactory from 'mediainfo.js'
import fs from 'fs'
import { MediaFile } from '../types/MediaFile'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'

export async function getMetaDataMediaInfo(file: MediaFile) {
    const factory = await mediaInfoFactory({
        chunkSize: 1024 * 1024
    })

    try {
        const stats = await fs.promises.stat(file.fullPath)
        const fileSize = stats.size

        return await factory.analyzeData(
            () => fileSize,

            (chunkSize, offset) => {
                const buffer = Buffer.alloc(chunkSize)
                const fd = fs.openSync(file.fullPath, 'r')

                try {
                    const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, offset)
                    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead)
                } finally {
                    fs.closeSync(fd)
                }
            }
        )
    } finally {
        factory.close()
    }
}

export async function getMetaDataFFprobe(file: MediaFile): Promise<string> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(file.fullPath, (error, metadata) => {
            if (error) {
                reject(`Error for analyzing ffprobe metadata for file: ${file.fullPath}`)
                return
            }

            const data = JSON.stringify(metadata, null, 2)
            resolve(data)
        })
    })
}

export async function getCombinedMetadata(file: MediaFile): Promise<any> {
    const [mediaInfoData, ffprobeDataString] = await Promise.all([
        getMetaDataMediaInfo(file),
        getMetaDataFFprobe(file)
    ])

    const ffprobeData = JSON.parse(ffprobeDataString)

    const ffprobeSubtitleMap = new Map()
    ffprobeData.streams?.forEach((stream: any) => {
        if (stream.codec_type === 'subtitle') {
            ffprobeSubtitleMap.set(stream.index, stream)
        }
    })

    if (mediaInfoData.media?.track) {
        mediaInfoData.media.track.forEach((track: any) => {
            if (track['@type'] === 'Text') {
                const streamOrder = parseInt(track.StreamOrder || '-1')
                const ffprobeStream = ffprobeSubtitleMap.get(streamOrder)

                if (streamOrder !== -1 && ffprobeStream?.disposition) {
                    const disposition = ffprobeStream.disposition

                    if (track['Forced'] != (disposition.forced == 1 ? 'Yes' : 'No')) {
                        console.error(`Warning! metadata field 'forced' does not match in mediainfo and ffprobe!`)
                        return null
                    }

                    if (track['Default'] != (disposition.default == 1 ? 'Yes' : 'No')) {
                        console.error(`Warning! metadata field 'default' does not match in mediainfo and ffprobe!`)
                        return null
                    }

                    Object.assign(track, {
                        Default: disposition.default === 1 ? 'Yes' : 'No',
                        Forced: disposition.forced === 1 ? 'Yes' : 'No',

                        HearingImpaired: disposition.hearing_impaired === 1 ? 'Yes' : 'No',
                        VisualImpaired: disposition.visual_impaired === 1 ? 'Yes' : 'No',
                        Original: disposition.original === 1 ? 'Yes' : 'No',
                        Dub: disposition.dub === 1 ? 'Yes' : 'No',
                        Commentary: disposition.comment === 1 ? 'Yes' : 'No',
                        Captions: disposition.captions === 1 ? 'Yes' : 'No',
                        Descriptions: disposition.descriptions === 1 ? 'Yes' : 'No',
                        CleanEffects: disposition.clean_effects === 1 ? 'Yes' : 'No',
                        Lyrics: disposition.lyrics === 1 ? 'Yes' : 'No',
                        Karaoke: disposition.karaoke === 1 ? 'Yes' : 'No'
                    })
                }
            }
        })
    }

    return mediaInfoData;
}

export function findMediaFiles(rootDir: string, extensions: string[] = ['.mkv', '.mp4', '.avi']): MediaFile[] {
    const files: MediaFile[] = []

    function scanDirectory(currentDir: string) {
        try {
            const items = fs.readdirSync(currentDir, { withFileTypes: true })

            for (const item of items) {
                const fullPath = path.join(currentDir, item.name)

                if (item.isDirectory()) {
                    scanDirectory(fullPath)
                } else if (item.isFile()) {
                    const extension = path.extname(item.name).toLowerCase()
                    const isSample = item.name.toLowerCase().includes('sample');

                    if (extensions.includes(extension) && !isSample) {
                        const fileName = path.basename(item.name, extension)
                        const folderName = path.basename(currentDir)

                        files.push({
                            name: fileName,
                            path: path.dirname(fullPath),
                            fullPath: fullPath,
                            extension: extension
                        })
                    }
                }
            }
        } catch (error) {
            console.error(`Fehler beim Scannen von ${currentDir}:`, error)
        }
    }

    scanDirectory(rootDir)
    return files
}