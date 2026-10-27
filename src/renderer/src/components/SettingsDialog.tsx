import { useState, type ReactNode } from 'react'
import { CheckCircle2, Settings2, XCircle } from 'lucide-react'
import {
    AUDIO_FORMATS,
    CONCURRENCY_OPTIONS,
    completeOrder,
    labelOf,
    NORMALIZE_CHANNELS,
    SOURCES,
    SUBTITLE_FORMATS,
    SUBTITLE_TYPES,
    VIDEO_CODECS
} from '@shared/catalog'
import { getLanguageName, KNOWN_LANGUAGES } from '@shared/languages'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { Settings } from '@shared/types'
import { SortableList } from '@/components/SortableList'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type NumberKey = 'spaceWarningGb' | 'normalizeMinGain' | 'normalizeMaxGain'

/** Bearbeitungsstand des Dialogs; Zahlen als Text, damit sie frei eingegeben werden können (fehlende Folgen schaltet die Dateiliste) */
type Draft = Omit<Settings, 'inputDir' | 'outputDir' | 'pipeline' | 'showMissingEpisodes' | NumberKey> & Record<NumberKey, string>

const toDraft = (s: Settings): Draft => ({
    audioBranding: s.audioBranding,
    defaultSource: s.defaultSource,
    languages: s.languages,
    unknownLanguage: s.unknownLanguage,
    normalizeFormats: s.normalizeFormats,
    normalizeChannels: s.normalizeChannels,
    audioOrder: completeOrder(s.audioOrder, AUDIO_FORMATS),
    subtitlePriority: completeOrder(s.subtitlePriority, SUBTITLE_TYPES),
    subtitleOrder: completeOrder(s.subtitleOrder, SUBTITLE_FORMATS),
    videoCodec: s.videoCodec,
    videoEncodeArgs: s.videoEncodeArgs,
    ffmpegPath: s.ffmpegPath,
    ffprobePath: s.ffprobePath,
    concurrency: s.concurrency,
    tmdbApiKey: s.tmdbApiKey,
    fanartApiKey: s.fanartApiKey,
    spaceWarningGb: String(s.spaceWarningGb),
    normalizeMinGain: String(s.normalizeMinGain),
    normalizeMaxGain: String(s.normalizeMaxGain)
})

const number = (value: string, fallback: number) => {
    const parsed = parseFloat(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : fallback
}

const fromDraft = (d: Draft): Partial<Settings> => ({
    ...d,
    audioBranding: d.audioBranding.trim(),
    videoEncodeArgs: d.videoEncodeArgs.trim(),
    ffmpegPath: d.ffmpegPath.trim(),
    ffprobePath: d.ffprobePath.trim(),
    tmdbApiKey: d.tmdbApiKey.trim(),
    fanartApiKey: d.fanartApiKey.trim(),
    spaceWarningGb: Math.max(0, number(d.spaceWarningGb, DEFAULT_SETTINGS.spaceWarningGb)),
    normalizeMinGain: number(d.normalizeMinGain, DEFAULT_SETTINGS.normalizeMinGain),
    normalizeMaxGain: number(d.normalizeMaxGain, DEFAULT_SETTINGS.normalizeMaxGain)
})

function toggle<T>(list: T[], value: T, checked: boolean): T[] {
    return checked ? [...list.filter((item) => item !== value), value] : list.filter((item) => item !== value)
}

const languageLabel = (code: string) => (code === 'und' ? 'Keine Sprache (und)' : `${getLanguageName(code)} (${code})`)

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[200px_1fr] items-start gap-4">
            <span className="pt-2 text-sm">
                {label}
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
            </span>
            <div className="flex min-w-0 items-center gap-2">{children}</div>
        </div>
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

function CheckboxGroup<T extends string | number>({
    options,
    selected,
    onChange
}: {
    options: { value: T; label: string }[]
    selected: T[]
    onChange: (selected: T[]) => void
}) {
    return (
        <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 pt-2">
            {options.map((option) => (
                <Label key={option.value} className="cursor-pointer font-normal">
                    <Checkbox
                        checked={selected.includes(option.value)}
                        onCheckedChange={(checked) => onChange(toggle(selected, option.value, checked === true))}
                    />
                    {option.label}
                </Label>
            ))}
        </div>
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
        if (next) setTmdbStatus(null)
        if (next) setFanartStatus(null)
        setOpen(next)
    }

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))

    const [tmdbStatus, setTmdbStatus] = useState<{ ok: boolean; text: string } | null>(null)
    const testTmdb = async () => {
        setTmdbStatus({ ok: true, text: 'Prüfe …' })
        const result = await window.api.tmdbTest(draft?.tmdbApiKey.trim() ?? '')
        setTmdbStatus(result.ok ? { ok: true, text: 'Verbindung erfolgreich' } : { ok: false, text: result.error })
    }

    const [fanartStatus, setFanartStatus] = useState<{ ok: boolean; text: string } | null>(null)
    const testFanart = async () => {
        setFanartStatus({ ok: true, text: 'Prüfe …' })
        const result = await window.api.fanartTest(draft?.fanartApiKey.trim() ?? '')
        setFanartStatus(result.ok ? { ok: true, text: 'Verbindung erfolgreich' } : { ok: false, text: result.error })
    }

    const bind = (key: NumberKey | 'audioBranding' | 'videoEncodeArgs' | 'ffmpegPath' | 'ffprobePath' | 'tmdbApiKey' | 'fanartApiKey') => ({
        value: draft?.[key] ?? '',
        onChange: (event: { target: { value: string } }) => set(key, event.target.value)
    })

    const browse = async (key: 'ffmpegPath' | 'ffprobePath') => {
        const file = await window.api.selectExecutable(draft?.[key])
        if (file) set(key, file)
    }

    const save = async () => {
        if (!draft) return
        await updateSettings(fromDraft(draft))
        await recheckFfmpeg()
        setOpen(false)
    }

    const resetDefaults = () =>
        setDraft(
            toDraft({
                ...DEFAULT_SETTINGS,
                ffmpegPath: draft?.ffmpegPath ?? '',
                ffprobePath: draft?.ffprobePath ?? '',
                tmdbApiKey: draft?.tmdbApiKey ?? '',
                fanartApiKey: draft?.fanartApiKey ?? ''
            })
        )

    const addableLanguages = KNOWN_LANGUAGES.filter((code) => !draft?.languages.includes(code))
    // Eigene Werte aus älteren Einstellungen weiterhin anzeigen
    const sourceOptions = draft && !SOURCES.includes(draft.defaultSource) ? [draft.defaultSource, ...SOURCES] : SOURCES
    const codecOptions =
        draft && !VIDEO_CODECS.some((codec) => codec.value === draft.videoCodec)
            ? [{ value: draft.videoCodec, label: draft.videoCodec }, ...VIDEO_CODECS]
            : VIDEO_CODECS
    const unknownLanguageOptions = [...new Set([...KNOWN_LANGUAGES, draft?.unknownLanguage ?? 'und', 'und'])]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" disabled={!settings || running}>
                    <Settings2 />
                    Einstellungen
                </Button>
            </DialogTrigger>
            {/* Kein Autofokus aufs erste Feld beim Öffnen */}
            <DialogContent className="max-w-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Einstellungen</DialogTitle>
                    <DialogDescription>Werden dauerhaft gespeichert. Reihenfolgen per Drag & Drop am Griff ändern.</DialogDescription>
                </DialogHeader>

                {draft && (
                    <div className="-mx-6 flex flex-col gap-6 overflow-y-auto px-6 py-1">
                        <Group title="Tonspur & Renaming">
                            <Field label="Tonspur-Branding" hint="Wird an den Titel der normalisierten Spur angehängt">
                                <Input {...bind('audioBranding')} placeholder="[Sky Mix]" />
                            </Field>
                            <Field label="Standard-Quelle" hint="Wenn im Dateinamen keine Quelle erkannt wird">
                                <Select
                                    value={draft.defaultSource}
                                    onChange={(event) => set('defaultSource', event.target.value)}
                                    className="w-56"
                                >
                                    {sourceOptions.map((source) => (
                                        <option key={source} value={source}>
                                            {source}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </Group>

                        <Group title="Sprachen">
                            <Field label="Sprachen (Reihenfolge)" hint="Andere Sprachen werden beim Filtern entfernt">
                                <div className="flex w-full flex-col gap-2">
                                    <SortableList
                                        items={draft.languages}
                                        onChange={(languages) => set('languages', languages)}
                                        getLabel={languageLabel}
                                        onRemove={
                                            draft.languages.length > 1
                                                ? (code) =>
                                                      set(
                                                          'languages',
                                                          draft.languages.filter((item) => item !== code)
                                                      )
                                                : undefined
                                        }
                                    />
                                    {addableLanguages.length > 0 && (
                                        <Select
                                            value=""
                                            onChange={(event) =>
                                                event.target.value && set('languages', [...draft.languages, event.target.value])
                                            }
                                            className="w-56"
                                        >
                                            <option value="">Sprache hinzufügen …</option>
                                            {addableLanguages.map((code) => (
                                                <option key={code} value={code}>
                                                    {languageLabel(code)}
                                                </option>
                                            ))}
                                        </Select>
                                    )}
                                </div>
                            </Field>
                            <Field label="Sprache für Spuren ohne Tag">
                                <Select
                                    value={draft.unknownLanguage}
                                    onChange={(event) => set('unknownLanguage', event.target.value)}
                                    className="w-56"
                                >
                                    {unknownLanguageOptions.map((code) => (
                                        <option key={code} value={code}>
                                            {languageLabel(code)}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </Group>

                        <Group title="Normalisierung (Peak)">
                            <Field label="Mindest-Gain (dB)" hint="Darunter wird nicht normalisiert">
                                <Input {...bind('normalizeMinGain')} className="w-24" />
                            </Field>
                            <Field label="Maximaler Gain (dB)">
                                <Input {...bind('normalizeMaxGain')} className="w-24" />
                            </Field>
                            <Field label="Unterstützte Formate" hint="Nur diese Formate werden als Quelle normalisiert">
                                <CheckboxGroup
                                    options={AUDIO_FORMATS}
                                    selected={draft.normalizeFormats}
                                    onChange={(formats) => set('normalizeFormats', formats)}
                                />
                            </Field>
                            <Field label="Unterstützte Kanäle" hint="AC3 kann maximal 5.1">
                                <CheckboxGroup
                                    options={NORMALIZE_CHANNELS}
                                    selected={draft.normalizeChannels}
                                    onChange={(channels) => set('normalizeChannels', channels)}
                                />
                            </Field>
                        </Group>

                        <Group title="Sortierung">
                            <Field label="Audio-Formate" hint="Bei gleicher Sprache und Kanalzahl gewinnt das obere Format">
                                <SortableList
                                    items={draft.audioOrder}
                                    onChange={(order) => set('audioOrder', order)}
                                    getLabel={(value) => labelOf(AUDIO_FORMATS, value)}
                                />
                            </Field>
                            <Field label="Untertitel-Typen">
                                <SortableList
                                    items={draft.subtitlePriority}
                                    onChange={(order) => set('subtitlePriority', order)}
                                    getLabel={(value) => labelOf(SUBTITLE_TYPES, value)}
                                />
                            </Field>
                            <Field label="Untertitel-Formate" hint="Beim Entfernen von Duplikaten bleibt das obere Format">
                                <SortableList
                                    items={draft.subtitleOrder}
                                    onChange={(order) => set('subtitleOrder', order)}
                                    getLabel={(value) => labelOf(SUBTITLE_FORMATS, value)}
                                />
                            </Field>
                        </Group>

                        <Group title="Video-Encoding">
                            <Field label="Codec">
                                <Select
                                    value={draft.videoCodec}
                                    onChange={(event) => set('videoCodec', event.target.value)}
                                    className="w-72"
                                >
                                    {codecOptions.map((codec) => (
                                        <option key={codec.value} value={codec.value}>
                                            {codec.label}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label="Encoder-Argumente">
                                <Input {...bind('videoEncodeArgs')} className="font-mono text-xs" />
                            </Field>
                        </Group>

                        <Group title="Leistung">
                            <Field
                                label="Gleichzeitige Dateien"
                                hint="Gilt für Peak-Analyse und Schreiben. Bei normalen Festplatten (HDD) 1 wählen."
                            >
                                <Select
                                    value={String(draft.concurrency)}
                                    onChange={(event) => set('concurrency', Number(event.target.value))}
                                    className="w-56"
                                >
                                    {CONCURRENCY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </Select>
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

                        <Group title="TMDB">
                            <Field label="API-Key" hint="API-Key (v3) oder Read Access Token für Folgentitel und Vorschaubilder">
                                <Input {...bind('tmdbApiKey')} type="password" placeholder="leer = keine TMDB-Anbindung" />
                                <Button variant="secondary" onClick={testTmdb} disabled={!draft.tmdbApiKey.trim()}>
                                    Testen
                                </Button>
                            </Field>
                            <div className="flex flex-col gap-1.5 pl-[216px] text-xs text-muted-foreground">
                                {tmdbStatus && (
                                    <span className={cn('flex items-center gap-1', tmdbStatus.ok ? 'text-success' : 'text-destructive')}>
                                        {tmdbStatus.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                                        {tmdbStatus.text}
                                    </span>
                                )}
                                <span>
                                    Kostenloser Key: Konto bei TMDB anlegen, dann unter{' '}
                                    <button
                                        type="button"
                                        className="text-primary underline-offset-2 hover:underline"
                                        onClick={() => window.api.openExternal('https://www.themoviedb.org/settings/api')}
                                    >
                                        themoviedb.org/settings/api
                                    </button>{' '}
                                    erzeugen.
                                </span>
                                <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
                            </div>
                        </Group>

                        <Group title="Fanart.tv">
                            <Field
                                label="API-Key"
                                hint="Persönlicher Key für weitere Cover, Staffelposter, Logos, Backdrops und Landscape-Bilder"
                            >
                                <Input {...bind('fanartApiKey')} type="password" placeholder="leer = nur Bilder von TMDB" />
                                <Button variant="secondary" onClick={testFanart} disabled={!draft.fanartApiKey.trim()}>
                                    Testen
                                </Button>
                            </Field>
                            <div className="flex flex-col gap-1.5 pl-[216px] text-xs text-muted-foreground">
                                {fanartStatus && (
                                    <span className={cn('flex items-center gap-1', fanartStatus.ok ? 'text-success' : 'text-destructive')}>
                                        {fanartStatus.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                                        {fanartStatus.text}
                                    </span>
                                )}
                                <span>
                                    Kostenloser Key: Konto bei Fanart.tv anlegen, dann unter{' '}
                                    <button
                                        type="button"
                                        className="text-primary underline-offset-2 hover:underline"
                                        onClick={() => window.api.openExternal('https://fanart.tv/get-an-api-key/')}
                                    >
                                        fanart.tv/get-an-api-key
                                    </button>{' '}
                                    erzeugen.
                                </span>
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
