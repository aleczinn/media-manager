import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import {BLUE, CYAN, GREEN, PURPLE, RED, RESET, WHITE, YELLOW} from "./ansi";

const INPUT_DIR = path.resolve(__dirname, 'data');
const OUTPUT_DIR = path.join(__dirname, 'data', 'export');

const PATH = "G:\\test";

async function main() {
    try {
        const files = fs.readdirSync(PATH).filter(file => file.endsWith('.avi'));

        if (files.length === 0) {
            console.log(YELLOW, "Keine .avi-Dateien gefunden.", RESET);
            return;
        }

        for (const file of files) {
            const inputFile = path.join(PATH, file);
            const outputFile = path.join(PATH, path.parse(inputFile).name+ '.mkv');

            console.log(CYAN, `Konvertiere: ${inputFile} -> ${path.basename(outputFile)}`, RESET);

            console.log(`input: ${inputFile}`);
            console.log(`output: ${outputFile}`);

            await new Promise<void>((resolve, reject) => {
                ffmpeg(inputFile)
                    .outputOptions('-c:v copy', '-c:a copy')
                    .output(outputFile)
                    .on('end', () => {
                        console.log(GREEN, `Erfolgreich konvertiert: ${outputFile}`, RESET);
                        resolve();
                    })
                    .on('error', (err) => {
                        console.log(RED, `Fehler bei ${outputFile}: ${err.message}`, RESET);
                        reject(err);
                    })
                    .run();
            });
        }
    } catch (error) {
        console.error(error);
    }
}

main();