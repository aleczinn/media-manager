import * as fs from 'fs'
import { MediaFile } from './types/MediaFile'
import { ensureDir, findMediaFiles, getCombinedMetadata } from './util/file-utils'
import { BLUE, CYAN, GREEN, RESET, WHITE, YELLOW } from './ansi'
import { GeneralTrack } from './types/GeneralTrack'
import { BaseTrack } from './types/BaseTrack'
import { VideoTrack } from './types/VideoTrack'
import { AudioTrack } from './types/AudioTrack'
import { SubtitleTrack } from './types/SubtitleTrack'
import { SeparatedTracks } from './types/SeparatedTracks'
import { debug } from './util/logger'
import { fixLanguageInTrack, getParsedMediaFile } from './util/utils'
import { processSubtitles } from './handler/subtitle-handler'
import { processAudio } from './handler/audio-handler'
import { processVideo } from './handler/video-handler'
import ffmpeg from 'fluent-ffmpeg'
import { ParsedMediaFile } from './types/ParsedMediaFile'
import { applyNormalization } from './util/audio-utils'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const PRESET_LANGUAGES_ORDER: Array<string> = ['de', 'en'] // ,  'ja'
export const PRESET_SUBTITLE_PRIORITY: Array<string> = ['forced', 'normal', 'cc', 'sdh']
export const PRESET_SUBTITLE_ORDER: Array<string> = ['srt', 'pgs', 'pgsdev', 'ass', 'vobsub']
export const PRESET_AUDIO_ORDER: Array<string> = ['truehd_atmos', 'eac3_atmos', 'dts_x', 'truehd', 'dts_hd_ma', 'dts_hd_hr', 'eac3', 'dts', 'ac3', 'aac', 'pcm']
export const PRESET_AUDIO_BRANDING: string = '[Sky Mix]'
export const PRESET_ENCODE_OPTIONS: Array<string> = ['libx264', '-crf 18', '-preset slow', '-x264-params ref=5:bframes=5']
export const PRESET_NORMALIZE_MIN_THRESHOLD: number = 1.0
export const PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS = 'de'

// Normalization
export const NORMALIZE: boolean = true;
export const NORMALIZE_SUPPORTED_AUDIO_FORMATS = ['dts', 'eac3', 'ac3', 'opus', 'aac', 'pcm'] // 'dts_hd_ma'
export const NORMALIZE_SUPPORTED_CHANNEL_COUNT = [2, 6]

// Renamer
const PRESET_RENAME_FIX: boolean = true

// Encoding
const PRESET_ENCODE_VIDEO: boolean = false

// Other
export const PRESET_THROW_AWAY_UNKNOWN_TRACKS: boolean = false
export const PRESET_DEBUG_LEVEL: 'OFF' | 'LOW' | 'FULL' = 'OFF' // Save the metadata as a JSON file, print out debug information per file
export const DEFAULT_SOURCE_NAME = 'Web';

const INPUT_DIR = 'C:\\Users\\alec_\\Desktop\\Loki\\INPUT'
const OUTPUT_DIR = 'C:\\Users\\alec_\\Desktop\\Loki\\OUTPUT'
// const INPUT_DIR = 'P:\\downloads\\SubMerge';
// const OUTPUT_DIR = `${INPUT_DIR}\\export`;

async function processFile(file: MediaFile) {
    const { size } = await fs.promises.stat(file.fullPath)

    console.log(`\n\n${RESET}> = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =`)
    console.log(`${RESET}>${CYAN} File: ${RESET}${file.name} ${WHITE}(${(size / 1024 / 1024 / 1024).toFixed(2)} GB)`)
    console.log(`${RESET}>${CYAN} Path: ${RESET}${file.path}`)
    console.log(`${RESET}>${CYAN} Full-Path: ${RESET}${file.fullPath}`)

    try {
        const metadata = await getCombinedMetadata(file)
        const tracks = metadata.media?.track || []

        if (PRESET_DEBUG_LEVEL == 'FULL') {
            const data = JSON.stringify(metadata, null, 2)
            fs.writeFileSync(`${file.fullPath}-combined.json`, data, 'utf-8')
            console.log('SAFE DEBUG FILE');
        }

        let separatedTracks: SeparatedTracks = separateTracks(tracks)

        console.log(`${RESET}>${CYAN} Streams: ${RESET} Video: ${separatedTracks.video.length} | Audio: ${separatedTracks.audio.length} | Subtitles: ${separatedTracks.subtitle.length}`)
        debug(' \n')

        processVideo(separatedTracks.video)
        processAudio(separatedTracks.audio)
        processSubtitles(separatedTracks.subtitle)

        console.log(`${RESET}>${CYAN} Filtered Streams: ${RESET} Video: ${separatedTracks.video.length} | Audio: ${separatedTracks.audio.length} | Subtitles: ${separatedTracks.subtitle.length}`)

        await buildScript(file, separatedTracks)
    } catch (error) {
        console.error(error)
    }
}

async function buildScript(file: MediaFile, tracks: SeparatedTracks): Promise<void> {
    const command = ffmpeg(file.fullPath)

    command.outputOptions(`-metadata title=`);

    const descriptionPath = path.join(file.path, `${file.name}.txt`);
    if (fs.existsSync(descriptionPath)) {
        const description = fs.readFileSync(descriptionPath, 'utf-8').trim();
        console.log(`${GREEN}✓${RESET} Beschreibung gefunden (${description.length} Zeichen)`)

        command.outputOptions([
            '-metadata', `description=${description}`,
            '-metadata', `comment=${description}`,
            '-metadata', `synopsis=${description}`
        ]);
    }

    // VIDEO
    tracks.video.forEach((track: VideoTrack, index: number) => {
        command.outputOptions(`-map 0:v:${track.LOCAL_INDEX}`)
        if (PRESET_ENCODE_VIDEO) {
            console.log(`> [INFO] Using encoding for video stream ${index} with options:`, PRESET_ENCODE_OPTIONS)
            command.outputOptions(`-c:v:${index}`)
            command.outputOptions(PRESET_ENCODE_OPTIONS)
        } else {
            command.outputOptions(`-c:v:${index} copy`)
        }
    })

    const normalizationApplied: boolean = await applyNormalization(file, tracks.audio, command)

    // Audio
    tracks.audio.forEach((track: AudioTrack, index: number) => {
        const i = normalizationApplied ? index + 1 : index

        command.outputOptions(`-map 0:a:${track.LOCAL_INDEX}`)
        command.outputOptions(`-c:a:${i} copy`)
        command.outputOptions(`-metadata:s:a:${i}`, `title=${track.Title}`)
        command.outputOptions(`-disposition:a:${i}`, '0')
        command.outputOptions(`-metadata:s:a:${i}`, `language=${track?.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS || 'und'}`)
    })

    // Subtitle
    tracks.subtitle.forEach((track: SubtitleTrack, index: number) => {
        command.outputOptions(`-map 0:s:${track.LOCAL_INDEX}`)
        command.outputOptions(`-c:s:${index} copy`)
        command.outputOptions(`-metadata:s:s:${index}`, `title=${track.Title}`)
        command.outputOptions(`-metadata:s:s:${index}`, `language=${track?.Language || PRESET_LANGUAGE_FOR_UNKNOWN_TRACKS || 'und'}`)

        const dispositions: string[] = []

        // if (track.Default === 'Yes') dispositions.push('default')
        if (track.Forced === 'Yes') dispositions.push('forced')
        if (track.HearingImpaired === 'Yes') dispositions.push('hearing_impaired')
        if (track.VisualImpaired === 'Yes') dispositions.push('visual_impaired')
        if (track.Dub === 'Yes') dispositions.push('dub')
        if (track.Original === 'Yes') dispositions.push('original')
        if (track.Karaoke === 'Yes') dispositions.push('karaoke')
        if (track.Commentary === 'Yes') dispositions.push('comment')
        if (track.Lyrics === 'Yes') dispositions.push('lyrics')

        const dispositionStr = dispositions.length > 0 ? dispositions.join('+') : '0'
        command.outputOptions(`-disposition:s:${index}`, dispositionStr)
    })

    // Flags to fix video async bug
    command.outputOptions('-fflags +genpts')
    command.outputOptions('-vsync cfr')
    command.outputOptions('-max_interleave_delta 0')

    const name = renameFix(file)

    await new Promise<void>((resolve, reject) => {
        let startTime = Date.now()

        command.save(`${OUTPUT_DIR}\\${name}`)
            .on('progress', (progress) => {
                if (progress.percent && progress.percent >= 0) {
                    let elapsed = (Date.now() - startTime) / 1000
                    let estimatedTotal = elapsed / (progress.percent / 100)
                    let remaining = estimatedTotal - elapsed

                    process.stdout.write(`\r${RESET}> ${GREEN}Building File${RESET} ${progress.percent.toFixed(2)}% | FPS${RESET}: ${progress.currentFps} ${GREEN}Frames${RESET}: ${progress.frames} ${GREEN}Zeit${RESET}: ${progress.timemark} [${GREEN}Verbleibend${RESET}: ${remaining.toFixed(2)}s]`);
                }
            })
            .on('error', (err) => {
                console.error('Error while creating file:', err.message)
                reject(err)
            })
            .on('end', () => {
                process.stdout.write('\n')
                resolve()
            })
    })
}

function renameFix(file: MediaFile): string {
    if (PRESET_RENAME_FIX) {
        console.log(`${BLUE}> RenameFix`)
        console.log(`${RESET}> - ${BLUE}Original${RESET}: ${file.name}`)

        const f_name = file.name.toLowerCase()
        const d_name = file.fullPath.toLowerCase();

        if (f_name.startsWith('s0') || f_name.startsWith('s1') || f_name.includes('{source-') || f_name.includes('{edition-')) {
            console.log(`${RESET}> - ${BLUE}Name is in correct format!`)
            return `${file.name}.mkv`
        }

        const parsed: ParsedMediaFile | null = getParsedMediaFile(file)
        let name = 'Unknown'
        let extra = ''


        if (parsed) {
            if (parsed.season === '-1') {
                console.log(`${RESET}> - ${BLUE}No Season defined${RESET}: Use 1 as Fallback`)
                parsed.season = '01'
            }

            console.log(`${RESET}> - ${BLUE}Match found!${RESET} - Season: ${parsed.season}, Episode: ${parsed.episode}, Title: ${parsed.title}`)

            const extended = f_name.includes('extended')
            const upscale = f_name.includes('upsuhd') || f_name.includes('upscale')
            const directorsCut = f_name.includes('director')

            if (extended && upscale) {
                extra += ' {edition-Extended-Upscale}'
            } else if (extended) {
                extra += ' {edition-Extended}'
            } else if (upscale) {
                extra += ' {edition-Upscale}'
            } else if (directorsCut) {
                extra += ` {edition-Director's Cut}`
            }

            if (f_name.includes('dsnp') || d_name.includes('dspn') || d_name.includes('disney')) {
                extra += ' {source-Disney+}'
            } else if (f_name.includes('amazon') || d_name.includes('amazon')) {
                extra += ' {source-Amazon}'
            } else if (f_name.includes('netflix') || d_name.includes('netflix')) {
                extra += ' {source-Netflix}'
            } else if (f_name.includes('atvp')) {
                extra += ' {source-ATVP}'
            } else if (f_name.includes('rtl')) {
                extra += ' {source-RTL+}'
            } else if (f_name.includes('web')) {
                extra += ' {source-Web}'
            } else if (f_name.includes('uhd')) {
                if (upscale) {
                    extra += ' {source-BluRay}'
                } else {
                    extra += ' {source-UHD}'
                }
            } else if (f_name.includes('bluray') || f_name.includes('bdrip')) {
                extra += ' {source-BluRay}'
            } else {
                // Sofern nichts enthalten ist, wird auf den default Wert zurückgegriffen
                extra += ` {source-${DEFAULT_SOURCE_NAME}}`
            }

            const finalName = `S${parsed.season}e${parsed.episode} - ${name}${extra}.mkv`
            if (fs.existsSync(`${OUTPUT_DIR}\\${finalName}`)) {
                return `${parsed.title} - S${parsed.season}e${parsed.episode} - ${name}${extra}.mkv`
            }
            return finalName
        }
    }
    return `${file.name}.mkv`
}

function separateTracks(tracks: BaseTrack[]): SeparatedTracks {
    let general: GeneralTrack = {} as GeneralTrack, video: VideoTrack[] = [], audio: AudioTrack[] = [],
        subtitle: SubtitleTrack[] = []
    let videoIndex = 0, audioIndex = 0, subtitleIndex = 0

    tracks.forEach((track: BaseTrack) => {
        switch (track['@type']) {
            case 'General':
                general = track as GeneralTrack
                break
            case 'Video':
                fixLanguageInTrack(track as VideoTrack)
                Object.assign(track, {
                    LOCAL_INDEX: videoIndex
                })
                video.push(track as VideoTrack)
                videoIndex++
                break
            case 'Audio':
                fixLanguageInTrack(track as AudioTrack)
                Object.assign(track, {
                    LOCAL_INDEX: audioIndex
                })
                audio.push(track as AudioTrack)
                audioIndex++
                break
            case 'Text':
                fixLanguageInTrack(track as SubtitleTrack)
                Object.assign(track, {
                    LOCAL_INDEX: subtitleIndex
                })
                subtitle.push(track as SubtitleTrack)
                subtitleIndex++
                break
        }
    })

    return { general, video, audio, subtitle }
}

async function mergeSubsIntoOneFile(file: MediaFile, current: number, total: number) {
    console.log(`\n${CYAN}[${current}/${total}]${RESET} Merging: ${WHITE}${file.name}${RESET}`)

    const subsDir = path.join(file.path, 'Subs')

    if (!fs.existsSync(subsDir)) {
        console.log(`${YELLOW}[${current}/${total}]${RESET} Kein Subs-Ordner – übersprungen: ${file.name}`)
        return
    }

    const subFiles = fs.readdirSync(subsDir).filter(f => f.endsWith('.idx'))
    const outputFile = path.join(OUTPUT_DIR, file.name + '.mkv')

    const mkvmergePath = 'C:\\Program Files\\MKVToolNix\\mkvmerge.exe'

    if (fs.existsSync(outputFile)) {
        console.log(`  ${YELLOW}→ Output existiert bereits – überspringe${RESET}`)
        return
    }

    await fixExistingSrtForcedFlags(file);

    let cmd = `"${mkvmergePath}" -o "${outputFile}" "${file.fullPath}"`

    subFiles.forEach((sub, i) => {
        const fullPath = path.join(subsDir, sub)
        const name = path.basename(fullPath).toLowerCase()

        let language = 'de'
        let title = 'Deutsch'

        if (name.includes('eng-forced')) {
            language = 'en'
            title = 'English Forced'
        } else if (name.includes('forced') || name.includes('erzwungen')) {
            title = 'Deutsch Erzwungen'
        } else if (name.includes('eng')) {
            language = 'en'
            title = 'English'
        }

        cmd += ` --language 0:${language} --track-name "0:${title}" "${fullPath}"`
    })

    await new Promise<void>((resolve, reject) => {
        const proc = exec(cmd)

        proc.stdout?.on('data', (data: string) => {
            const match = data.match(/Fortschritt:\s*(\d+)%/)
            if (match) {
                const pct = match[1].padStart(3)
                process.stdout.write(`\r  ${GREEN}▶${RESET} mkvmerge: ${WHITE}${pct}%${RESET}   `)
            } else {
                // Temporär – zeigt was mkvmerge wirklich sagt
                // console.log('[mkvmerge stdout]', data.trim())
            }
        })

        proc.stderr?.on('data', (data: string) => {
            if (data.trim()) console.error(`\n  ${YELLOW}⚠ mkvmerge:${RESET}`, data.trim())
        })

        proc.on('close', async (code) => {
            process.stdout.write('\n')
            if (code === 0 || code === 1) {
                console.log(`  ${GREEN}✓ Merge fertig${RESET}`)
                resolve()
            } else {
                reject(new Error(`mkvmerge exit code ${code}`))
            }
        })

        proc.on('error', reject)
    })
}

async function fixExistingSrtForcedFlags(file: MediaFile) {
    const mkvmergePath = 'C:\\Program Files\\MKVToolNix\\mkvmerge.exe'
    const mkvpropeditPath = 'C:\\Program Files\\MKVToolNix\\mkvpropedit.exe'

    // Track-Info der Original-Datei holen
    const { stdout: jsonOut } = await execAsync(`"${mkvmergePath}" -J "${file.fullPath}"`)
    const info = JSON.parse(jsonOut)
    const tracks: any[] = info.tracks ?? []

    const srtTracks = tracks.filter(t =>
        t.type === 'subtitles' &&
        t.properties?.codec_id === 'S_TEXT/UTF8' // SRT
    )

    if (srtTracks.length === 0) return

    console.log(`  ${CYAN}→ ${srtTracks.length} SRT-Spur(en) gefunden – setze Forced-Flag${RESET}`)

    let cmd = `"${mkvpropeditPath}" "${file.fullPath}"`

    srtTracks.forEach((track) => {
        const trackNum = track.id + 1 // mkvpropedit ist 1-based
        cmd += ` --edit track:${trackNum} --set flag-forced=1 --set flag-default=1`
    })

    try {
        await execAsync(cmd)
        console.log(`  ${GREEN}✓ Forced-Flag gesetzt${RESET}`)
    } catch (err) {
        console.error(`  ${YELLOW}⚠ mkvpropedit Fehler:${RESET}`, err)
    }
}

async function main() {
    try {
        await ensureDir(OUTPUT_DIR);

        const files = findMediaFiles(INPUT_DIR)

        console.log(`Found ${files.length} video files to analyze...`)

        if (PRESET_DEBUG_LEVEL != 'OFF') {
            console.log(`Using Debug Level: ${PRESET_DEBUG_LEVEL}`)
        }

        // for (const file of files) {
        //     await processFile(file)
        // }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            await processFile(file)
            // await mergeSubsIntoOneFile(files[i], i + 1, files.length)
        }
    } catch (error) {
        console.error(error)
    }
}

main();