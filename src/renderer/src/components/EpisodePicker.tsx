import { ChevronDown, ImageOff } from 'lucide-react'
import { episodeRefFromName, formatEpisodeRef, tmdbImageUrl } from '@shared/tmdb-match'
import type { TmdbEpisode } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Row } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const refKey = (episode: { season: number; episode: number }) => `${episode.season}:${episode.episode}`

/** Auswahl der TMDB-Episode pro Datei; Titel und Vorschaubild folgen der Auswahl */
export function EpisodePicker({ row, disabled }: { row: Row; disabled: boolean }) {
    const episodes = useStore((s) => s.tmdb.episodes)
    const seasons = useStore((s) => s.tmdb.seasons)
    const setEpisode = useStore((s) => s.setEpisode)
    const fileId = row.entry.file.id

    const bySeason = new Map<number, TmdbEpisode[]>()
    for (const episode of episodes) bySeason.set(episode.season, [...(bySeason.get(episode.season) ?? []), episode])
    const seasonName = (season: number) =>
        season === 0 ? 'Specials' : (seasons.find((s) => s.season === season)?.name ?? `Staffel ${season}`)

    const onChange = (value: string) => {
        if (!value) return setEpisode(fileId, null)
        const [season, episode] = value.split(':').map(Number)
        const auto = episodeRefFromName(row.entry.file.name)
        // Wählt man wieder die automatisch erkannte Folge, gilt die Zuordnung als automatisch
        setEpisode(fileId, auto && auto.season === season && auto.episode === episode ? undefined : { season, episode })
    }

    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <div className="relative min-w-0">
                <select
                    value={row.episode ? refKey(row.episode) : ''}
                    onChange={(event) => onChange(event.target.value)}
                    disabled={disabled}
                    className={cn(
                        'h-6 max-w-full appearance-none truncate rounded border bg-transparent pr-6 pl-2 text-xs outline-none disabled:opacity-50 [&>optgroup]:bg-popover [&>option]:bg-popover',
                        row.episodeManual
                            ? 'border-warning/50 text-warning'
                            : row.episode
                              ? 'border-input text-muted-foreground'
                              : 'border-dashed border-input text-muted-foreground/70'
                    )}
                    title={row.episodeManual ? 'Manuell gewählte Episode' : 'Automatisch per Staffel und Folge zugeordnet'}
                >
                    <option value="">Keine TMDB-Episode</option>
                    {[...bySeason.entries()].map(([season, list]) => (
                        <optgroup key={season} label={seasonName(season)}>
                            {list.map((episode) => (
                                <option key={refKey(episode)} value={refKey(episode)}>
                                    {formatEpisodeRef(episode)} · {episode.title}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            {row.episodeManual && <span className="shrink-0 text-[10px] text-warning">manuell</span>}
        </div>
    )
}

/** Vorschaubild der zugeordneten Episode links neben Zielname und Dropdown; beim Überfahren größer */
export function EpisodeThumbnail({ episode }: { episode: TmdbEpisode | null }) {
    const box = 'h-[62px] w-[110px] shrink-0 overflow-hidden rounded-md border bg-secondary/60'

    if (!episode?.stillPath) {
        return (
            <span
                className={cn(box, 'flex items-center justify-center text-muted-foreground/60')}
                title={episode ? 'Bei TMDB gibt es zu dieser Folge kein Vorschaubild' : 'Keine TMDB-Episode zugeordnet'}
            >
                <ImageOff className="size-4" />
            </span>
        )
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className={box}>
                    <img src={tmdbImageUrl(episode.stillPath, 'w300')} alt="" className="size-full object-cover" />
                </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-none p-1">
                <img src={tmdbImageUrl(episode.stillPath, 'w300')} alt="" className="w-[300px] rounded" />
                <div className="px-1 pt-1 text-xs">
                    {formatEpisodeRef(episode)} · {episode.title}
                </div>
            </TooltipContent>
        </Tooltip>
    )
}
