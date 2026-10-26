import { useState, type ChangeEvent, type ReactNode } from 'react'
import { CheckCircle2, Settings2, XCircle } from 'lucide-react'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { Settings } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useStore } from '@/lib/store'

/** Alle Felder als Text, damit Listen und Zahlen frei bearbeitet werden können. */
interface Draft {
    audioBranding: string
    defaultSource: string
    spaceWarningGb: string
    languages: string
    unknownLanguage: string
    normalizeMinGain: string
    normalizeMaxGain: string
    normalizeFormats: string
    normalizeChannels: string
    audioOrder: string
    subtitlePriority: string
    subtitleOrder: string
    videoCodec: string
    videoEncodeArgs: string
    ffmpegPath: string
    ffprobePath: string
}

const toDraft = (s: Settings): Draft => ({
    audioBranding: s.audioBranding,
    defaultSource: s.defaultSource,
    spaceWarningGb: String(s.spaceWarningGb),
    languages: s.languages.join(', '),
    unknownLanguage: s.unknownLanguage,
    normalizeMinGain: String(s.normalizeMinGain),
    normalizeMaxGain: String(s.normalizeMaxGain),
    normalizeFormats: s.normalizeFormats.join(', '),
    normalizeChannels: s.normalizeChannels.join(', '),
    audioOrder: s.audioOrder.join(', '),
    subtitlePriority: s.subtitlePriority.join(', '),
    subtitleOrder: s.subtitleOrder.join(', '),
    videoCodec: s.videoCodec,
    videoEncodeArgs: s.videoEncodeArgs,
    ffmpegPath: s.ffmpegPath,
    ffprobePath: s.ffprobePath
})

const list = (value: string) =>
    value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)

const number = (value: string, fallback: number) => {
    const parsed = parseFloat(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : fallback
}

const fromDraft = (d: Draft): Partial<Settings> => ({
    audioBranding: d.audioBranding.trim(),
    defaultSource: d.defaultSource.trim() || DEFAULT_SETTINGS.defaultSource,
    spaceWarningGb: Math.max(0, number(d.spaceWarningGb, DEFAULT_SETTINGS.spaceWarningGb)),
    languages: list(d.languages),
    unknownLanguage: d.unknownLanguage.trim().toLowerCase() || 'und',
    normalizeMinGain: number(d.normalizeMinGain, DEFAULT_SETTINGS.normalizeMinGain),
    normalizeMaxGain: number(d.normalizeMaxGain, DEFAULT_SETTINGS.normalizeMaxGain),
    normalizeFormats: list(d.normalizeFormats),
    normalizeChannels: list(d.normalizeChannels)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    audioOrder: list(d.audioOrder),
    subtitlePriority: list(d.subtitlePriority),
    subtitleOrder: list(d.subtitleOrder),
    videoCodec: d.videoCodec.trim() || DEFAULT_SETTINGS.videoCodec,
    videoEncodeArgs: d.videoEncodeArgs.trim(),
    ffmpegPath: d.ffmpegPath.trim(),
    ffprobePath: d.ffprobePath.trim()
})

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="grid grid-cols-[200px_1fr] items-start gap-4">
            <span className="pt-2 text-sm">
                {label}
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            </span>
            <div className="flex items-center gap-2">{children}</div>
        </label>
    )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-primary uppercase">{title}</h3>
            {children}
        </section>
    )
}

export function SettingsDialog() {
    const settings = useStore((s) => s.settings)
    const ffmpeg = useStore((s) => s.ffmpeg)
    const running = useStore((s) => s.run.running)
    const { updateSettings, recheckFfmpeg } = useStore.getState()
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<Draft | null>(null)

    const onOpenChange = (next: boolean) => {
        if (next && settings) setDraft(toDraft(settings))
        setOpen(next)
    }

    const bind = (key: keyof Draft) => ({
        value: draft?.[key] ?? '',
        onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft((d) => (d ? { ...d, [key]: event.target.value } : d))
    })

    const browse = async (key: 'ffmpegPath' | 'ffprobePath') => {
        const file = await window.api.selectExecutable(draft?.[key])
        if (file) setDraft((d) => (d ? { ...d, [key]: file } : d))
    }

    const save = async () => {
        if (!draft) return
        await updateSettings(fromDraft(draft))
        await recheckFfmpeg()
        setOpen(false)
    }

    const resetDefaults = () =>
        setDraft(toDraft({ ...DEFAULT_SETTINGS, ffmpegPath: draft?.ffmpegPath ?? '', ffprobePath: draft?.ffprobePath ?? '' }))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" disabled={!settings || running}>
                    <Settings2 />
                    Einstellungen
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Einstellungen</DialogTitle>
                    <DialogDescription>Werden dauerhaft gespeichert. Listen werden mit Komma getrennt.</DialogDescription>
                </DialogHeader>

                {draft && (
                    <div className="-mx-6 flex flex-col gap-6 overflow-y-auto px-6 py-1">
                        <Group title="Tonspur & Renaming">
                            <Field label="Tonspur-Branding" hint="Wird an den Titel der normalisierten Spur angehängt">
                                <Input {...bind('audioBranding')} placeholder="[Sky Mix]" />
                            </Field>
                            <Field label="Standard-Quelle" hint="Wenn im Dateinamen keine Quelle erkannt wird">
                                <Input {...bind('defaultSource')} />
                            </Field>
                        </Group>

                        <Group title="Sprachen">
                            <Field label="Sprachen (Reihenfolge)" hint="Andere Sprachen werden beim Filtern entfernt">
                                <Input {...bind('languages')} placeholder="de, en" />
                            </Field>
                            <Field label="Sprache für Spuren ohne Tag">
                                <Input {...bind('unknownLanguage')} className="w-24" />
                            </Field>
                        </Group>

                        <Group title="Normalisierung (Peak)">
                            <Field label="Mindest-Gain (dB)" hint="Darunter wird nicht normalisiert">
                                <Input {...bind('normalizeMinGain')} className="w-24" />
                            </Field>
                            <Field label="Maximaler Gain (dB)">
                                <Input {...bind('normalizeMaxGain')} className="w-24" />
                            </Field>
                            <Field label="Unterstützte Formate">
                                <Input {...bind('normalizeFormats')} />
                            </Field>
                            <Field label="Unterstützte Kanalzahlen">
                                <Input {...bind('normalizeChannels')} className="w-32" />
                            </Field>
                        </Group>

                        <Group title="Sortierung">
                            <Field label="Audio-Formate">
                                <Input {...bind('audioOrder')} />
                            </Field>
                            <Field label="Untertitel-Typen">
                                <Input {...bind('subtitlePriority')} />
                            </Field>
                            <Field label="Untertitel-Formate">
                                <Input {...bind('subtitleOrder')} />
                            </Field>
                        </Group>

                        <Group title="Video-Encoding">
                            <Field label="Codec">
                                <Input {...bind('videoCodec')} className="w-40" />
                            </Field>
                            <Field label="Encoder-Argumente">
                                <Input {...bind('videoEncodeArgs')} className="font-mono text-xs" />
                            </Field>
                        </Group>

                        <Group title="Speicherplatz">
                            <Field label="Warnschwelle (GB)" hint="Warnung, wenn nach dem Export weniger frei wäre">
                                <Input {...bind('spaceWarningGb')} className="w-24" />
                            </Field>
                        </Group>

                        <Group title="ffmpeg">
                            <Field label="ffmpeg.exe" hint="Leer = aus dem PATH">
                                <Input {...bind('ffmpegPath')} placeholder="ffmpeg" />
                                <Button variant="secondary" onClick={() => browse('ffmpegPath')}>
                                    Durchsuchen
                                </Button>
                            </Field>
                            <Field label="ffprobe.exe" hint="Leer = aus dem PATH">
                                <Input {...bind('ffprobePath')} placeholder="ffprobe" />
                                <Button variant="secondary" onClick={() => browse('ffprobePath')}>
                                    Durchsuchen
                                </Button>
                            </Field>
                            <div className="flex gap-4 pl-[216px] text-xs">
                                {(['ffmpeg', 'ffprobe'] as const).map((bin) => (
                                    <span key={bin} className="flex items-center gap-1">
                                        {ffmpeg?.[bin] ? (
                                            <CheckCircle2 className="size-3.5 text-success" />
                                        ) : (
                                            <XCircle className="size-3.5 text-destructive" />
                                        )}
                                        {bin} {ffmpeg?.[bin] ?? 'nicht gefunden'}
                                    </span>
                                ))}
                            </div>
                        </Group>
                    </div>
                )}

                <DialogFooter className="border-t pt-4">
                    <Button variant="ghost" className="mr-auto" onClick={resetDefaults}>
                        Standardwerte
                    </Button>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Abbrechen
                    </Button>
                    <Button onClick={save}>Speichern</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
