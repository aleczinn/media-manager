import { useEffect, useState } from 'react'
import { AlertTriangle, Clapperboard, Files, Images } from 'lucide-react'
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
    const derived = useDerived()
    const artworkPlan = useArtworkPlan(derived.rows)
    const [tab, setTab] = useState('files')

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
                    <div className="ml-auto flex items-center gap-3">
                        <FfmpegBadge />
                        <SettingsDialog />
                    </div>
                </header>

                {ready && (
                    <>
                        <FolderBar />
                        <PipelineOptions />
                        <SeriesBar derived={derived} />
                        <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
                            <TabsList>
                                <TabsTrigger value="files">
                                    <Files />
                                    Dateien
                                </TabsTrigger>
                                <TabsTrigger value="artwork">
                                    <Images />
                                    Bilder
                                    {artworkPlan.jobs.length > 0 && (
                                        <span className="text-xs text-muted-foreground">({artworkPlan.jobs.length})</span>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="files" className="flex min-h-0 flex-1 flex-col">
                                <FileTable derived={derived} />
                            </TabsContent>
                            <TabsContent value="artwork" className="flex min-h-0 flex-1 flex-col">
                                <ArtworkPanel plan={artworkPlan} />
                            </TabsContent>
                        </Tabs>
                        <ApplyBar derived={derived} artworkJobs={artworkPlan.jobs} />
                    </>
                )}
            </div>
        </TooltipProvider>
    )
}
