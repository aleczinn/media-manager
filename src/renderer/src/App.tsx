import { useEffect, useState } from 'react'
import { AlertTriangle, Clapperboard, Files, Images, MonitorPlay } from 'lucide-react'
import { ApplyBar } from '@/components/ApplyBar'
import { ArtworkPanel } from '@/components/ArtworkPanel'
import { FileTable } from '@/components/FileTable'
import { FolderBar } from '@/components/FolderBar'
import { PipelineOptions } from '@/components/PipelineOptions'
import { SeriesBar } from '@/components/SeriesBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useArtworkPlan } from '@/lib/artwork'
import { useDerived } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { AppMode } from '@shared/types'

const MODES: { mode: AppMode; label: string; icon: typeof Clapperboard; hint: string }[] = [
    { mode: 'media', label: 'Filme & Serien', icon: Clapperboard, hint: 'Umbenennen nach TMDB, Vorschaubilder und Artwork' },
    {
        mode: 'youtube',
        label: 'YouTube',
        icon: MonitorPlay,
        hint: 'JDownloader-Downloads: Namen bereinigen, Tonspur auf Deutsch, Beschreibung (.txt) und Bild (.jpg) gleichnamig mitkopieren'
    }
]

/** Umschalter zwischen Filme & Serien und YouTube */
function ModeSwitch() {
    const mode = useStore((s) => s.settings?.mode)
    const running = useStore((s) => s.run.running)
    const updateSettings = useStore((s) => s.updateSettings)
    if (!mode) return null

    return (
        <div className="flex items-center rounded-lg border bg-card/60 p-0.5">
            {MODES.map(({ mode: value, label, icon: Icon, hint }) => (
                <button
                    key={value}
                    type="button"
                    title={hint}
                    disabled={running}
                    onClick={() => updateSettings({ mode: value })}
                    className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
                        mode === value ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                >
                    <Icon className="size-3.5" />
                    {label}
                </button>
            ))}
        </div>
    )
}

function FfmpegBadge() {
    const ffmpeg = useStore((s) => s.ffmpeg)
    if (!ffmpeg) return null

    if (!ffmpeg.ffmpeg || !ffmpeg.ffprobe) {
        return (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" />
                {!ffmpeg.ffmpeg ? 'ffmpeg' : 'ffprobe'} nicht gefunden – Pfad in den Einstellungen setzen
            </span>
        )
    }
    return (
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground" title={`ffmpeg ${ffmpeg.ffmpeg}`}>
            ffmpeg {ffmpeg.ffmpeg.split('-')[0]}
        </span>
    )
}

export function App() {
    const ready = useStore((s) => s.settings !== null)
    const youtube = useStore((s) => s.settings?.mode === 'youtube')
    const derived = useDerived()
    const artworkPlan = useArtworkPlan(derived.rows)
    const [tab, setTab] = useState('files')
    // Im YouTube-Modus gibt es keinen Bilder-Tab
    const activeTab = youtube ? 'files' : tab

    useEffect(() => {
        let cleanup: (() => void) | undefined
        let disposed = false
        void useStore
            .getState()
            .init()
            .then((fn) => {
                if (disposed) fn()
                else cleanup = fn
            })
        return () => {
            disposed = true
            cleanup?.()
        }
    }, [])

    // Peak-Analyse und Untertitel-Zählung schon während der Durchsicht im Hintergrund starten (der Main-Prozess ignoriert bekannte)
    const { scanRequests } = derived
    useEffect(() => {
        if (scanRequests.length > 0) void window.api.prefetchScans(scanRequests)
    }, [scanRequests])

    return (
        <TooltipProvider delayDuration={300}>
            <div className="flex h-full flex-col gap-3 p-4">
                <header className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <Clapperboard className="size-5" />
                    </div>
                    <h1 className="text-lg font-semibold tracking-tight">Media Manager</h1>
                    <ModeSwitch />
                    <div className="ml-auto flex items-center gap-3">
                        <FfmpegBadge />
                        <SettingsDialog />
                    </div>
                </header>

                {ready && (
                    <>
                        <FolderBar />
                        <PipelineOptions />
                        {!youtube && <SeriesBar derived={derived} />}
                        <Tabs value={activeTab} onValueChange={setTab} className="min-h-0 flex-1">
                            <TabsList>
                                <TabsTrigger value="files">
                                    <Files />
                                    Dateien
                                </TabsTrigger>
                                {!youtube && (
                                    <TabsTrigger value="artwork">
                                        <Images />
                                        Bilder
                                        {artworkPlan.jobs.length > 0 && (
                                            <span className="text-xs text-muted-foreground">({artworkPlan.jobs.length})</span>
                                        )}
                                    </TabsTrigger>
                                )}
                            </TabsList>
                            <TabsContent value="files" className="flex min-h-0 flex-1 flex-col">
                                <FileTable derived={derived} />
                            </TabsContent>
                            <TabsContent value="artwork" className="flex min-h-0 flex-1 flex-col">
                                <ArtworkPanel plan={artworkPlan} missingJobs={derived.missingJobs} />
                            </TabsContent>
                        </Tabs>
                        <ApplyBar derived={derived} artworkJobs={youtube ? [] : artworkPlan.jobs} />
                    </>
                )}
            </div>
        </TooltipProvider>
    )
}
