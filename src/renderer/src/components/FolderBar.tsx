import type { ReactNode } from 'react'
import { FolderInput, FolderOpen, FolderOutput, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

function FolderField({
    label,
    icon: Icon,
    value,
    onBrowse,
    actions,
    disabled
}: {
    label: string
    icon: typeof FolderInput
    value: string
    onBrowse: () => void
    actions?: ReactNode
    disabled?: boolean
}) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex w-20 shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Icon className="size-4" />
                {label}
            </div>
            <button
                type="button"
                onClick={onBrowse}
                disabled={disabled}
                className={cn(
                    'h-9 min-w-0 flex-1 truncate rounded-md border border-input bg-black/20 px-3 text-left text-sm transition-colors hover:border-primary/50 disabled:opacity-50',
                    !value && 'text-muted-foreground'
                )}
                title={value}
            >
                {value || 'Ordner auswählen …'}
            </button>
            <Button variant="secondary" onClick={onBrowse} disabled={disabled}>
                Durchsuchen
            </Button>
            {actions}
        </div>
    )
}

export function FolderBar() {
    const settings = useStore((s) => s.settings)
    const running = useStore((s) => s.run.running)
    const scanning = useStore((s) => s.scanning)
    const { selectInput, selectOutput, scan } = useStore.getState()

    const outputInsideInput =
        !!settings?.inputDir &&
        !!settings.outputDir &&
        (settings.outputDir.toLowerCase() + '\\').startsWith(settings.inputDir.toLowerCase().replace(/\\?$/, '\\'))

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-6">
                <FolderField
                    label="Input"
                    icon={FolderInput}
                    value={settings?.inputDir ?? ''}
                    onBrowse={selectInput}
                    disabled={running}
                    actions={
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={scan} disabled={!settings?.inputDir || running || scanning}>
                                    <RefreshCw className={cn(scanning && 'animate-spin')} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Neu einlesen</TooltipContent>
                        </Tooltip>
                    }
                />
                <FolderField
                    label="Output"
                    icon={FolderOutput}
                    value={settings?.outputDir ?? ''}
                    onBrowse={selectOutput}
                    disabled={running}
                    actions={
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.api.openPath(settings!.outputDir)}
                                    disabled={!settings?.outputDir}
                                >
                                    <FolderOpen />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Im Explorer öffnen</TooltipContent>
                        </Tooltip>
                    }
                />
            </div>
            {outputInsideInput && (
                <p className="text-xs text-warning">
                    Der Output-Ordner liegt im Input-Ordner. Fertige Dateien tauchen beim nächsten Einlesen wieder in der Liste auf.
                </p>
            )}
        </div>
    )
}
