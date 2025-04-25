import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import {getAudioPriority, getAudioTrackName, SUBTITLE_MAPPING} from "./helper";
import {Preset} from "./preset/preset";
import {animeCopy, animeWithEncode} from "./preset/presets";
import {BLUE, CYAN, GREEN, PURPLE, RED, RESET, WHITE, YELLOW} from "./ansi";

const INPUT_DIR = path.resolve(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'data', 'export');

const defaultPreset: Preset = {
    name: "Default",
    languages: ['ger', 'deu', 'eng'],
    normalized_audio_branding: "[Sky Mix]",
    encodeVideo: false,
    encodingOptions: ['libx264', '-crf 18', '-preset slow', '-x264-params ref=5:bframes=5'],
    renameFix: false,
    normalizeAudio: false,
    defaultLanguageForUnknownStream: '',
    atmosOverrideDE: false,
    atmosOverrideEN: false
}
export const preset: Preset = defaultPreset;



function analyzeFile(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(file, (error, metadata) => {
            if (error) {
                reject(`Fehler beim analyisieren der Datei: ${error}`);
                return;
            }
            const data = JSON.stringify(metadata, null, 2)
            fs.writeFileSync('temp.json', data, 'utf-8');
            resolve(data);
        });
    });
}

function parseMetaData(metaData: any) {
    const videoStreams = []
    let audioStreams = [];
    let subtitleStreams = [];

    let videoIndex = 0;
    let audioIndex = 0;
    let subtitleIndex = 0;

    for (const stream of metaData.streams) {
        if (stream.codec_type == 'video' && stream.codec_name !== 'png' && stream.codec_name !== 'jpeg') {
            stream.local_index = videoIndex++;
            videoStreams.push(stream);
        } else if (stream.codec_type == 'audio') {
            stream.local_index = audioIndex++;
            audioStreams.push(stream);
        } else if (stream.codec_type == 'subtitle') {
            stream.local_index = subtitleIndex++;
            subtitleStreams.push(stream);
        }
    }

    audioStreams.sort((a: any, b: any) => sortAudioStreams(a, b));
    audioStreams = audioStreams.filter((s: any) => preset.languages.includes(s.tags?.language || preset.defaultLanguageForUnknownStream || ''));

    audioStreams = audioStreams.filter((s: any) => {
        const title = s.tags?.title?.toLowerCase();
        return !/audiode/i.test(title);
    });

    subtitleStreams.sort((a: any, b: any) => sortSubtitleStreams(a, b));
    subtitleStreams = subtitleStreams.filter((s: any) => preset.languages.includes(s.tags?.language || preset.defaultLanguageForUnknownStream || ''));

    // DEBUG for W.I.T.C.H. series
    // subtitleStreams = subtitleStreams.filter((s: any) => {
    //     const title = s.tags?.title?.toLowerCase();
    //     return !/signs/i.test(title);
    // });

    // Ignore ASS Subtitles
    subtitleStreams = subtitleStreams.filter((s: any) => {
        const codecName = s.codec_name?.toLowerCase();
        return !/ass/i.test(codecName);
    });

    return {videoStreams, audioStreams, subtitleStreams};
}

function isForcedSubtitle(stream: any): boolean {
    const title = stream.tags?.title?.toLowerCase() || "";
    return stream.disposition?.forced || /forced|erzwungen/i.test(title);
}

function isSDHSubtitle(stream: any): boolean {
    const title = stream.tags?.title?.toLowerCase() || "";
    return stream.disposition?.hearing_impaired || /sdh|hearing/i.test(title);
}

function isCCSubtitle(stream: any): boolean {
    const title = stream.tags?.title?.toLowerCase() || "";
    return /cc/i.test(title);
}

function sortAudioStreams(a: any, b: any): number {
    const langOrderA = preset.languages.indexOf(a.tags?.language);
    const langOrderB = preset.languages.indexOf(b.tags?.language);

    // Unknown audio moved to the end
    const adjustedLangOrderA = langOrderA === -1 ? preset.languages.length : langOrderA;
    const adjustedLangOrderB = langOrderB === -1 ? preset.languages.length : langOrderB;

    if (adjustedLangOrderA !== adjustedLangOrderB) {
        return adjustedLangOrderA - adjustedLangOrderB;
    }

    // Prioritise more channels over quality
    if (a.channels !== b.channels) {
        return b.channels - a.channels;
    }

    return getAudioPriority(a) - getAudioPriority(b);
}

function sortSubtitleStreams(a: any, b: any): number {
    const aLang = a.tags?.language || '';
    const bLang = b.tags?.language || '';

    const aForced = isForcedSubtitle(a);
    const bForced = isForcedSubtitle(b);
    const aSDH = isSDHSubtitle(a);
    const bSDH = isSDHSubtitle(b);

    const langOrder = preset.languages.indexOf(aLang) - preset.languages.indexOf(bLang);
    if (langOrder !== 0) return langOrder;
    if (aForced !== bForced) return aForced ? -1 : 1;
    if (aSDH !== bSDH) return aSDH ? 1 : -1;
    return 0;
}

async function deleteTempFiles(files: string[]) {
    for (const file of files) {
        try {
            if (fs.existsSync(file)) {
                await fs.promises.unlink(file);
            }
        } catch (err) {
            console.error(`${RED}File ${file} could not be deleted!`, err);
        }
    }
}

async function runFile(file: string): Promise<void> {
    try {
        const INPUT_FILE = path.join(INPUT_DIR, file);
        const TEMP_FILE = path.join(INPUT_DIR, `temp_${file}.mkv`);
        const TEMP_FILE_BOOSTED = path.join(INPUT_DIR, `temp_b_${file}.mkv`);

        const metaData = JSON.parse(await analyzeFile(INPUT_FILE));
        const {videoStreams, audioStreams, subtitleStreams} = parseMetaData(metaData)

        console.log(`\n\n${RESET}> = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =`);
        console.log(`${RESET}>${CYAN} File: ${RESET}${file}`);
        console.log(`${RESET}>${CYAN} Streams: ${RESET} Video: ${videoStreams.length} | Audio (filtered): ${audioStreams.length} | Subtitles (filtered): ${subtitleStreams.length}`);
        console.log(`\n${CYAN}> Processing file...`);

        if (videoStreams.length === 0) {
            console.log(`${RESET}>${RED}> ❌ No video streams found -> Processing canceled.`);
            return;
        }
        if (audioStreams.length === 0) {
            console.log(`${RESET}>${RED}> ❌ No audio tracks found -> Processing canceled.`);
            return;
        }
        if (subtitleStreams.length === 0) {
            console.log(`${RESET}> ❌ ${YELLOW}No subtitles found.`);
        }

        const command = ffmpeg(INPUT_FILE);
        command.outputOptions('-metadata title=');

        // Copy video streams to output file
        videoStreams.forEach((stream: any, i: number) => {
            command.outputOptions(`-map 0:v:${i}`);
            if (preset.encodeVideo) {
                console.log(`> [INFO] Using encoding for video stream ${i} with options:`, preset.encodingOptions);
                command.outputOptions(`-c:v:${i}`);
                command.outputOptions(preset.encodingOptions);
            } else {
                command.outputOptions(`-c:v:${i} copy`);
            }
        });

        let audioIndex = 0;
        if (preset.normalizeAudio) {
            console.log(`${PURPLE}> Normalization`);
            const mainTrack = audioStreams[0];

            if (mainTrack.channels == 6 || mainTrack.channels == 2) {
                if (mainTrack.codec_name === 'dts' || mainTrack.codec_name === 'eac3' || mainTrack.codec_name === 'ac3' || mainTrack.codec_name === 'aac' || !preset.atmosOverrideDE) {
                    // Create temp file with main audio track
                    console.log(`${RESET}> - Creating temp file with main audio track`);

                    await new Promise<void>((resolve, reject) => {
                        ffmpeg(INPUT_FILE)
                            .output(TEMP_FILE)
                            .outputOptions([
                                `-map 0:a:${mainTrack.local_index}`,
                                '-c copy',
                                '-y',
                                '-nostdin'
                            ])
                            .noVideo()
                            .on('progress', (progress) => {
                                if (progress.percent && progress.percent >= 0) {
                                    console.log(`${RESET}> - ${PURPLE}Progress${RESET}: ${progress.percent.toFixed(2)}%`);
                                }
                            })
                            .on('end', () => {
                                resolve();
                            })
                            .on('error', (err) => {
                                console.log(`${RESET}> - ${RED}❌ Something went wrong!`, err);
                                reject(`❌ Something went wrong: ${err.message}`)
                            })
                            .run();
                    });

                    // Get volume of audio track from temp file
                    console.log(`${RESET}> - Analyze volume level of main audio track`);

                    const volume: number = await new Promise<number>((resolve, reject) => {
                        ffmpeg(TEMP_FILE)
                            .addOption('-f', 'null')
                            .audioFilters('volumedetect')
                            .on('stderr', (stderrLine) => {
                                const match = stderrLine.match(/max_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
                                if (match) {
                                    resolve(parseFloat(match[1])); // Extrahierte Lautstärke zurückgeben
                                }
                            })
                            .on('progress', (progress) => {
                                if (progress.percent && progress.percent >= 0) {
                                    console.log(`${RESET}> - ${PURPLE}Progress${RESET}: ${progress.percent.toFixed(2)}%`);
                                }
                            })
                            .on('end', () => reject('❌ Keine Lautstärke-Daten gefunden!'))
                            .on('error', (err) => {
                                console.log(`${RESET}> - ${RED}❌ Something went wrong!`, err);
                                reject(`❌ Something went wrong: ${err.message}`)
                            })
                            .output('/dev/null')
                            .run();
                    });

                    const invertedVolume = volume * -1;
                    console.log(`${RESET}> - Maximum volume determined. Increase volume by ${PURPLE}${invertedVolume}dB.`);

                    if (invertedVolume > 0.2) {
                        await new Promise<void>((resolve, reject) => {
                            ffmpeg(TEMP_FILE)
                                .audioFilters(`volume=${(invertedVolume)}dB`)
                                .audioCodec('ac3')
                                .audioBitrate(mainTrack.channels == 2 ? 384 : 640)
                                .noVideo()
                                .on('progress', (progress) => {
                                    if (progress.percent && progress.percent >= 0) {
                                        console.log(`${RESET}> - ${PURPLE}Progress${RESET}: ${progress.percent.toFixed(2)}%`);
                                    }
                                })
                                .on('end', () => {
                                    resolve();
                                })
                                .on('error', (err) => {
                                    console.log(`${RESET}> - ${RED}❌ Something went wrong!`, err);
                                })
                                .output(TEMP_FILE_BOOSTED)
                                .run();
                        });

                        // Merge normalized track into main file
                        console.log(`${RESET}> - Merging audio track into main file...`);

                        command.input(TEMP_FILE_BOOSTED);
                        command.outputOptions(`-map 1:a:0`);
                        command.outputOptions(`-c:a:${audioIndex} copy`);
                        command.outputOptions(`-metadata:s:a:${audioIndex}`, `title=${mainTrack.channels == 2 ? `Dolby Stereo` : `Dolby Digital 5.1`} ${preset.normalized_audio_branding}`);
                        command.outputOptions(`-disposition:a:${audioIndex}`, audioIndex == 0 ? 'default' : '0');
                        audioIndex++;
                    } else {
                        console.log(`${RESET}> - ${RED}❌ Normalization skipped, because volume is already loud enough!`);
                    }
                } else {
                    console.log(`${RESET}> - ${RED}❌ Unsupported audio codec! - Supported: DTS, EAC3, AC3 & AAC`);
                }
            } else {
                console.log(`${RESET}> - ${RED}❌ Normalization need 2 or 6 channels > ${mainTrack.channels} channel given.`);
            }
        }

        // Add audio tracks to output file
        audioStreams.forEach((stream: any, i: number) => {
            command.outputOptions(`-map 0:a:${stream.local_index}`);
            command.outputOptions(`-c:a:${audioIndex} copy`);
            command.outputOptions(`-metadata:s:a:${audioIndex}`, `title=${getAudioTrackName(stream)}`);
            command.outputOptions(`-disposition:a:${audioIndex}`, audioIndex == 0 ? 'default' : '0');
            audioIndex++;
        });

        // Add subtitles to output file
        subtitleStreams.forEach((stream: any, i: number) => {
            command.outputOptions(`-map 0:s:${stream.local_index}`);
            command.outputOptions(`-c:s:${i} copy`);

            let subtitle_mapping_key = stream?.tags?.language || preset.defaultLanguageForUnknownStream || '';

            if (isForcedSubtitle(stream)) {
                subtitle_mapping_key += '_forced'
            } else if (isSDHSubtitle(stream)) {
                subtitle_mapping_key += '_sdh'
            } else if (isCCSubtitle(stream)) {
                subtitle_mapping_key += '_cc'
            }
            command.outputOptions(`-metadata:s:s:${i}`, `title=${SUBTITLE_MAPPING[subtitle_mapping_key] || 'Unknown'}`);

            if (isForcedSubtitle(stream)) {
                command.outputOptions(`-disposition:s:${i}`, i == 0 ? 'default+forced' : 'forced');
            } else if (isSDHSubtitle(stream)) {
                command.outputOptions(`-disposition:s:${i}`, 'hearing_impaired ');
            } else {
                command.outputOptions(`-disposition:s:${i}`, '0');
            }
        });


        let OUTPUT_FILE = file.replace(".mkv", "");
        console.log(`OUTPUT_FILE: ${OUTPUT_FILE}`);

        if (preset.renameFix) {
            console.log(`${BLUE}> RenameFix`);
            console.log(`${RESET}> - ${BLUE}Original${RESET}: ${file}`);

            const temp = OUTPUT_FILE.toLowerCase();

            if (!temp.startsWith('s0')) {
                const regex = /s(\d{1,2})e(\d{1,2})/i; // sucht nach S01E01, S1E1, etc.
                const match = temp.match(regex);

                if (match) {
                    OUTPUT_FILE = `S${match[1].padStart(2, '0')}e${match[2].padStart(2, '0')} - Unknown`;
                    console.log(`${RESET}> - Match found: ${OUTPUT_FILE}`);
                } else {
                    console.log(`${RESET}> - No match found!`);
                    OUTPUT_FILE = file;
                }

                if (temp.includes('web')) {
                    OUTPUT_FILE += ' {source-Web}';
                    console.log(`${RESET}> - Source found: ${OUTPUT_FILE}`);
                } else if (temp.includes('bluray')) {
                    OUTPUT_FILE += ' {source-BluRay}';
                    console.log(`${RESET}> - Source found: ${OUTPUT_FILE}`);
                } else if (temp.includes('uhd')) {
                    OUTPUT_FILE += ' {source-UHD}';
                    console.log(`${RESET}> - Source found: ${OUTPUT_FILE}`);
                }
            } else {
                console.log(`${RESET}> - file name is already in correct format`);
            }
        }

        command.outputOptions('-fflags +genpts');
        command.outputOptions('-vsync cfr');

        console.log(`\n${GREEN}> Building file...`);
        await new Promise<void>((resolve, reject) => {
            let startTime = Date.now();

            command.outputOptions('-max_interleave_delta 0');

            command.save(path.join(OUTPUT_DIR, OUTPUT_FILE + ".mkv"))
                .on('progress', (progress) => {
                    if (progress.percent && progress.percent >= 0) {
                        let elapsed = (Date.now() - startTime) / 1000;
                        let estimatedTotal = elapsed / (progress.percent / 100);
                        let remaining = estimatedTotal - elapsed;

                        console.log(`${RESET}> ${GREEN}FPS${RESET}: ${progress.currentFps} ${GREEN}Frames${RESET}: ${progress.frames} ${GREEN}Zeit${RESET}: ${progress.timemark} ${GREEN}Progress${RESET}: ${progress.percent.toFixed(2)}% [${GREEN}Verbleibend${RESET}: ${remaining.toFixed(2)}s]`);
                    }
                })
                .on('stderr', (stderrLine) => {
                    // Suche nach den cropdetect Werten in der Fehlerausgabe
                    const cropdetectRegex = /crop=([0-9]+):([0-9]+):([0-9]+):([0-9]+)/;
                    const match = stderrLine.match(cropdetectRegex);

                    if (match) {
                        // Extrahiere die Werte für den Beschnitt (w, h, x, y)
                        const [_, width, height, x, y] = match;
                        console.log(`Erkannter Beschnitt: Breite=${width}, Höhe=${height}, X=${x}, Y=${y}`);
                        // @ts-ignore
                        resolve({width, height, x, y});
                    }
                })
                .on('end', () => {
                    console.log(`${GREEN}> Processing done!`)
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Fehler beim verarbeiten der Datei:', err.message)
                    reject(err);
                });
        });

        await deleteTempFiles([TEMP_FILE, TEMP_FILE_BOOSTED]);
    } catch (error) {
        console.error(error);
    }
}

async function normalization() {

}

function naming(): string {
    return '';
}

async function main() {
    try {
        const files = fs.readdirSync(INPUT_DIR).filter(file => {
            const extension = path.extname(file).toLowerCase();
            return (extension === '.mkv' || extension === '.mp4') && !file.startsWith('temp_');
        });

        for (const file of files) {
            await runFile(file);
        }
    } catch (error) {
        console.error(error);
    }
}

main();

// const file = path.resolve("");
// const ana = analyzeFile(file);
// ana.then(result => {
//     console.log(result);
// })
