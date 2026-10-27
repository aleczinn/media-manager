import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/lib/store'
import type { PipelineOptions as Options } from '@shared/types'

const OPTIONS: { key: keyof Options; label: string; hint: string }[] = [
    {
        key: 'normalize',
        label: 'Normalisieren',
        hint: 'Erste Tonspur peak-normalisiert als zusätzliche AC3-Spur (mit Branding) vorne einfügen'
    },
    {
        key: 'renameFile',
        label: 'Datei umbenennen',
        hint: 'Zielname nach Schema S01E02 - Titel {edition-…} {source-…} bzw. bei Filmen Titel (Jahr) {edition-…} {source-…}'
    },
    {
        key: 'filterLanguages',
        label: 'Sprachen filtern',
        hint: 'Audio- und Untertitelspuren entfernen, deren Sprache nicht in den Einstellungen steht'
    },
    { key: 'sortTracks', label: 'Spuren sortieren', hint: 'Nach Sprache, Kanälen und Format sortieren' },
    { key: 'renameTracks', label: 'Spuren benennen', hint: 'Einheitliche Titel wie „Dolby Digital 5.1“ oder „Deutsch Erzwungen“' },
    {
        key: 'dedupeSubtitles',
        label: 'UT-Duplikate entfernen',
        hint: 'Pro Sprache und Typ (Forced, Normal, SDH, CC) nur die beste Untertitelspur behalten'
    },
    {
        key: 'mergeSubtitles',
        label: 'Externe UT einbinden',
        hint: 'Untertitel aus einem Subs-Ordner oder gleichnamige Dateien neben dem Video (.idx/.sub, .srt, .ass, .sup) mit aufnehmen'
    },
    {
        key: 'cleanMetadata',
        label: 'Metadaten bereinigen',
        hint: 'Container- und Videotitel leeren, Beschreibung aus der zugehörigen .txt übernehmen (gleicher Name, auch mit „(Beschreibung)“)'
    },
    { key: 'encodeVideo', label: 'Video encodieren', hint: 'Video neu encodieren statt kopieren (langsam, Codec in den Einstellungen)' },
    {
        key: 'saveThumbnails',
        label: 'Vorschaubild speichern',
        hint: 'Episodenbild von TMDB als <Zielname>-thumb.jpg neben der Datei speichern, höchstens 1920×1080 (nur mit zugeordneter Serie)'
    },
    {
        key: 'saveArtwork',
        label: 'Bilder speichern',
        hint: 'Cover, Staffelposter, Logo, Backdrop und Landscape aus dem Bilder-Tab in den Output-Ordner schreiben'
    }
]

/** Im YouTube-Modus gibt es keine TMDB-Bilder */
const MEDIA_ONLY: (keyof Options)[] = ['saveThumbnails', 'saveArtwork']

const YOUTUBE_HINTS: Partial<Record<keyof Options, string>> = {
    renameFile: 'Qualitätsangaben wie (1080p_60fps_…), (Beschreibung) und (BQ) aus dem Namen entfernen'
}

export function PipelineOptions() {
    const pipeline = useStore((s) => s.settings?.pipeline)
    const youtube = useStore((s) => s.settings?.mode === 'youtube')
    const running = useStore((s) => s.run.running)
    const updateSettings = useStore((s) => s.updateSettings)

    if (!pipeline) return null

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card/60 px-4 py-2.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Verarbeitung</span>
            {OPTIONS.filter(({ key }) => !youtube || !MEDIA_ONLY.includes(key)).map(({ key, label, hint }) => (
                <Tooltip key={key}>
                    <TooltipTrigger asChild>
                        <Label className="cursor-pointer font-normal">
                            <Checkbox
                                checked={pipeline[key]}
                                disabled={running}
                                onCheckedChange={(checked) => updateSettings({ pipeline: { ...pipeline, [key]: checked === true } })}
                            />
                            {label}
                        </Label>
                    </TooltipTrigger>
                    <TooltipContent>{(youtube && YOUTUBE_HINTS[key]) || hint}</TooltipContent>
                </Tooltip>
            ))}
        </div>
    )
}
