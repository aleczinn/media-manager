import { detectEdition, detectSource, episodeStem, sourceFolders } from './rename'
import type { EpisodeRef } from './tmdb-match'
import type { TmdbEpisode } from './types'

/** Eine Dateizeile für den Abgleich: zugeordnete Folge und ob sie abgewählt ist */
export interface EpisodeFile {
    ref: EpisodeRef | null
    excluded: boolean
}

/** Eintrag der Tabellenreihenfolge: Dateizeile oder fehlende Folge (jeweils Index in ihrer Liste) */
export type TableEntry = { type: 'file'; index: number } | { type: 'missing'; index: number }

export const episodeKey = ({ season, episode }: EpisodeRef): string => `${season}x${episode}`

const compareRefs = (a: EpisodeRef, b: EpisodeRef) => a.season - b.season || a.episode - b.episode

/**
 * Gleicht die TMDB-Folgen mit den Dateien ab, nur für Staffeln, die in den Dateien vorkommen.
 * Abgewählte Dateien zählen als vorhanden; doppelt ist eine Folge erst mit mindestens zwei angehakten Dateien.
 */
export function findEpisodeGaps(episodes: TmdbEpisode[], files: EpisodeFile[]): { missing: TmdbEpisode[]; duplicates: EpisodeRef[] } {
    const refs = files.flatMap((file) => (file.ref ? [file.ref] : []))
    const present = new Set(refs.map(episodeKey))
    const seasons = new Set(refs.map((ref) => ref.season))
    const missing = episodes.filter((episode) => seasons.has(episode.season) && !present.has(episodeKey(episode))).sort(compareRefs)

    const counts = new Map<string, { ref: EpisodeRef; count: number }>()
    for (const file of files) {
        if (!file.ref || file.excluded) continue
        const entry = counts.get(episodeKey(file.ref)) ?? { ref: file.ref, count: 0 }
        counts.set(episodeKey(file.ref), { ...entry, count: entry.count + 1 })
    }
    const duplicates = [...counts.values()]
        .filter((entry) => entry.count > 1)
        .map((entry) => ({ season: entry.ref.season, episode: entry.ref.episode }))
        .sort(compareRefs)
    return { missing, duplicates }
}

/**
 * Nachbarzeile einer fehlenden Folge in derselben Staffel: die Datei mit der nächstkleineren Folge (die fehlende
 * kommt dahinter), sonst die mit der nächstgrößeren (die fehlende kommt davor).
 */
export function anchorFile(fileRefs: (EpisodeRef | null)[], missing: EpisodeRef): { index: number; position: 'after' | 'before' } | null {
    let after: number | null = null
    let before: number | null = null
    fileRefs.forEach((ref, index) => {
        if (!ref || ref.season !== missing.season || ref.episode === missing.episode) return
        if (ref.episode < missing.episode) {
            if (after === null || ref.episode >= fileRefs[after]!.episode) after = index
        } else if (before === null || ref.episode < fileRefs[before]!.episode) {
            before = index
        }
    })
    if (after !== null) return { index: after, position: 'after' }
    if (before !== null) return { index: before, position: 'before' }
    return null
}

/** Reihenfolge der Tabelle: die Dateien wie gehabt, fehlende Folgen an ihrer Stelle in der Folgenreihenfolge */
export function interleaveMissing(fileRefs: (EpisodeRef | null)[], missing: EpisodeRef[]): TableEntry[] {
    const before = new Map<number, number[]>()
    const after = new Map<number, number[]>()
    const rest: number[] = []
    missing.forEach((ref, index) => {
        const anchor = anchorFile(fileRefs, ref)
        if (!anchor) return rest.push(index)
        const target = anchor.position === 'after' ? after : before
        target.set(anchor.index, [...(target.get(anchor.index) ?? []), index])
    })

    const missingEntries = (list: number[] | undefined): TableEntry[] => (list ?? []).map((index) => ({ type: 'missing', index }))
    return [
        ...fileRefs.flatMap((_, index): TableEntry[] => [
            ...missingEntries(before.get(index)),
            { type: 'file', index },
            ...missingEntries(after.get(index))
        ]),
        ...missingEntries(rest)
    ]
}

/** Zielname einer fehlenden Folge; Edition und Quelle kommen von der Nachbardatei derselben Staffel */
export function missingEpisodeStem(
    episode: EpisodeRef,
    title: string,
    neighbour: { name: string; fullPath: string; relativePath?: string } | null,
    defaultSource: string
): string {
    const edition = neighbour ? detectEdition(neighbour.name) : null
    const source = neighbour ? detectSource(neighbour.name, neighbour.fullPath, defaultSource, sourceFolders(neighbour)) : defaultSource
    return episodeStem(episode, title, edition, source)
}
