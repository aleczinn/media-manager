import { useEffect } from 'react'
import { AlertTriangle, Clapperboard } from 'lucide-react'
import { ApplyBar } from '@/components/ApplyBar'
import { FileTable } from '@/components/FileTable'
import { FolderBar } from '@/components/FolderBar'
import { PipelineOptions } from '@/components/PipelineOptions'
import { SeriesBar } from '@/components/SeriesBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
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

    // Peak-Analysen schon während der Durchsicht im Hintergrund starten (der Main-Prozess ignoriert bekannte)
    const { peakRequests } = derived
    useEffect(() => {
        if (peakRequests.length > 0) void window.api.prefetchPeaks(peakRequests)
    }, [peakRequests])

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
                        <FileTable derived={derived} />
                        <ApplyBar derived={derived} />
                    </>
                )}
            </div>
        </TooltipProvider>
    )
}
