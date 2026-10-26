import { KNOWN_LANGUAGES, normalizeLanguage } from './languages'
import { parseEpisode } from './rename'

/** Externe Untertitelformate; bei VobSub wird die .idx eingelesen (die .sub muss daneben liegen) */
export const SUBTITLE_EXTENSIONS = ['.idx', '.srt', '.ass', '.ssa', '.sup']

/** Name des Ordners neben der Videodatei, in dem Releases ihre Untertitel ablegen */
export const SUBS_FOLDER = 'subs'

const LANGUAGE_TOKENS: Record<string, string> = {
    de: 'de',
    ger: 'de',
    deu: 'de',
    german: 'de',
    deutsch: 'de',
    en: 'en',
    eng: 'en',
    english: 'en'
}

const FORCED_TOKENS = ['forced', 'erzwungen']
const SDH_TOKENS = ['sdh', 'cc', 'hi']

export interface SubtitleHints {
    language: string | null
    forced: boolean
    sdh: boolean
}

const stripExtension = (fileName: string) => fileName.replace(/\.[^.]+$/, '')

export function isSubtitleFile(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return SUBTITLE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/** Stabile ID einer Untertitelspur, auch über externe Dateien hinweg */
export function subtitleTrackId(track: { inputIndex: number; index: number }): string {
    return `${track.inputIndex}:${track.index}`
}

/**
 * Liest Sprache, Forced und SDH aus dem Dateinamen, z. B. `folge-eng.idx`, `folge.de.forced.srt`.
 * Der Videoname wird vorher abgeschnitten, damit Wörter aus dem Serientitel nicht als Sprache gelten.
 */
export function subtitleHintsFromFilename(fileName: string, videoName = ''): SubtitleHints {
    let base = stripExtension(fileName).toLowerCase()
    const prefix = videoName.toLowerCase()
    if (prefix && base.startsWith(prefix)) base = base.slice(prefix.length)

    const tokens = base.split(/[\s._\-()[\]]+/).filter(Boolean)
    const forced = tokens.some((token) => FORCED_TOKENS.includes(token))
    const sdh = tokens.some((token) => SDH_TOKENS.includes(token))

    let language: string | null = null
    for (const token of tokens) {
        if (SDH_TOKENS.includes(token)) continue
        if (LANGUAGE_TOKENS[token]) {
            language = LANGUAGE_TOKENS[token]
            break
        }
        if (token.length === 2 || token.length === 3) {
            const normalized = normalizeLanguage(token, '')
            if (KNOWN_LANGUAGES.includes(normalized)) {
                language = normalized
                break
            }
        }
    }

    return { language, forced, sdh }
}

/**
 * Wählt die Untertiteldateien, die zu einem Video gehören.
 * - Subs-Ordner mit nur einem Video im Verzeichnis: alle Dateien gehören dazu
 * - sonst: Dateiname beginnt mit dem Videonamen oder (im Subs-Ordner) gleiche Staffel/Folge
 */
export function matchSubtitlesToVideo(videoName: string, videosInDir: number, candidates: string[], fromSubsFolder: boolean): string[] {
    if (fromSubsFolder && videosInDir === 1) return candidates

    const video = videoName.toLowerCase()
    const videoEpisode = parseEpisode(videoName)

    return candidates.filter((candidate) => {
        const base = stripExtension(candidate).toLowerCase()
        if (base.startsWith(video)) return true
        if (!fromSubsFolder || !videoEpisode) return false

        const episode = parseEpisode(stripExtension(candidate))
        return !!episode && episode.episode === videoEpisode.episode && (episode.season ?? 1) === (videoEpisode.season ?? 1)
    })
}
