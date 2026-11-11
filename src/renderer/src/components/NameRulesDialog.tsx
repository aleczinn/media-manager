import { useMemo, useState } from 'react'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowRight, Check, ChevronDown, GripVertical, Plus, Replace, Save, Trash2, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { findConflicts } from '@shared/conflicts'
import { applyNameRules, NAME_STEP_LABELS, stepError, type NameRuleSet, type NameStep, type NameStepType } from '@shared/name-rules'
import { cleanYoutubeName } from '@shared/youtube'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Row } from '@/lib/rows'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const STEP_TYPES: NameStepType[] = ['removeBefore', 'removeAfter', 'replace', 'trim', 'pattern']

function createStep(type: NameStepType): NameStep {
    const id = crypto.randomUUID()
    switch (type) {
        case 'replace':
            return { id, type, find: '', replacement: '', regex: false }
        // Vorn bleibt die Markierung meist stehen („#018 …“), hinten soll sie meist mit weg („★ Let's Play …“)
        case 'removeBefore':
            return { id, type, marker: '', includeMarker: false }
        case 'removeAfter':
            return { id, type, marker: '', includeMarker: true }
        case 'trim':
            return { id, type, start: 0, end: 0 }
        case 'pattern':
            return { id, type, pattern: '', target: '' }
    }
}

const FIELD = 'h-7 min-w-0 flex-1 px-2 text-xs'

function StepFields({ step, onChange }: { step: NameStep; onChange: (step: NameStep) => void }) {
    switch (step.type) {
        case 'replace':
            return (
                <>
                    <Input
                        className={FIELD}
                        value={step.find}
                        placeholder="Suchen"
                        spellCheck={false}
                        onChange={(event) => onChange({ ...step, find: event.target.value })}
                    />
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <Input
                        className={FIELD}
                        value={step.replacement}
                        placeholder="Ersetzen durch (leer = entfernen)"
                        spellCheck={false}
                        onChange={(event) => onChange({ ...step, replacement: event.target.value })}
                    />
                    <Label
                        className="shrink-0 cursor-pointer text-xs font-normal"
                        title="Suchtext als regulären Ausdruck lesen, Gruppen mit $1"
                    >
                        <Checkbox checked={step.regex} onCheckedChange={(checked) => onChange({ ...step, regex: checked === true })} />
                        Regex
                    </Label>
                </>
            )
        case 'removeBefore':
        case 'removeAfter':
            return (
                <>
                    <Input
                        className={FIELD}
                        value={step.marker}
                        placeholder={step.type === 'removeBefore' ? 'Alles vor diesem Text, z. B. #' : 'Alles nach diesem Text, z. B. ★'}
                        spellCheck={false}
                        onChange={(event) => onChange({ ...step, marker: event.target.value })}
                    />
                    <Label className="shrink-0 cursor-pointer text-xs font-normal">
                        <Checkbox
                            checked={step.includeMarker}
                            onCheckedChange={(checked) => onChange({ ...step, includeMarker: checked === true })}
                        />
                        Text auch entfernen
                    </Label>
                </>
            )
        case 'trim': {
            const count = (value: string) => Math.max(0, parseInt(value, 10) || 0)
            return (
                <>
                    <Label className="shrink-0 text-xs font-normal">
                        Vorne
                        <Input
                            className="h-7 w-16 px-2 text-xs"
                            type="number"
                            min={0}
                            value={step.start}
                            onChange={(event) => onChange({ ...step, start: count(event.target.value) })}
                        />
                    </Label>
                    <Label className="shrink-0 text-xs font-normal">
                        Hinten
                        <Input
                            className="h-7 w-16 px-2 text-xs"
                            type="number"
                            min={0}
                            value={step.end}
                            onChange={(event) => onChange({ ...step, end: count(event.target.value) })}
                        />
                    </Label>
                </>
            )
        }
        case 'pattern':
            return (
                <>
                    <Input
                        className={FIELD}
                        value={step.pattern}
                        placeholder="{titel} 🈲 OUTLAST 2 [{nr}]"
                        spellCheck={false}
                        onChange={(event) => onChange({ ...step, pattern: event.target.value })}
                    />
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <Input
                        className={FIELD}
                        value={step.target}
                        placeholder="#{nr} - {titel}"
                        spellCheck={false}
                        onChange={(event) => onChange({ ...step, target: event.target.value })}
                    />
                </>
            )
    }
}

function StepRow({
    step,
    index,
    onChange,
    onRemove
}: {
    step: NameStep
    index: number
    onChange: (step: NameStep) => void
    onRemove: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
    const error = stepError(step)
    const label = NAME_STEP_LABELS[step.type]

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                'flex flex-col gap-1 rounded-md border border-input bg-black/20 py-1.5 pr-1 pl-1.5',
                error && 'border-destructive/70',
                isDragging && 'relative z-10 border-primary/60 bg-secondary shadow-lg'
            )}
        >
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    aria-label={`${label} verschieben`}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="size-4" />
                </button>
                <span className="text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
                <span className="flex-1 truncate text-xs font-medium">{label}</span>
                <button
                    type="button"
                    onClick={onRemove}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`${label} entfernen`}
                >
                    <X className="size-3.5" />
                </button>
            </div>
            <div className="flex min-w-0 items-center gap-2 pr-1 pl-6">
                <StepFields step={step} onChange={onChange} />
            </div>
            {error && <p className="pl-6 text-xs text-destructive">{error}</p>}
        </li>
    )
}

function StepList({ steps, onChange }: { steps: NameStep[]; onChange: (steps: NameStep[]) => void }) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )
    const ids = steps.map((step) => step.id)

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return
        onChange(arrayMove(steps, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
        >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-1.5">
                    {steps.map((step, index) => (
                        <StepRow
                            key={step.id}
                            step={step}
                            index={index}
                            onChange={(next) => onChange(steps.map((other) => (other.id === step.id ? next : other)))}
                            onRemove={() => onChange(steps.filter((other) => other.id !== step.id))}
                        />
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    )
}

interface PreviewRow {
    id: string
    before: string
    after: string
    changed: boolean
    manual: boolean
    conflict: string | null
}

/** Vorher → Nachher mit den Schritten aus dem Entwurf, inklusive der Konflikte, die die Tabelle danach zeigen würde */
function usePreview(rows: Row[], steps: NameStep[]): PreviewRow[] {
    const overrides = useStore((s) => s.overrides)
    const outputNames = useStore((s) => s.outputNames)

    return useMemo(() => {
        const stemOf = (row: Row) => overrides[row.entry.file.id] ?? applyNameRules(cleanYoutubeName(row.entry.file.name), steps)
        const conflicts = findConflicts(
            rows.filter((row) => !row.excluded && row.result?.status !== 'ok').map((row) => ({ id: row.entry.file.id, stem: stemOf(row) })),
            outputNames
        )
        return rows.map((row) => {
            const { file } = row.entry
            const before = cleanYoutubeName(file.name)
            const after = stemOf(row)
            return {
                id: file.id,
                before,
                after,
                changed: after !== before,
                manual: overrides[file.id] !== undefined,
                conflict: conflicts.get(file.id)?.message ?? null
            }
        })
    }, [rows, steps, overrides, outputNames])
}

function Preview({ rows, steps }: { rows: Row[]; steps: NameStep[] }) {
    const preview = usePreview(rows, steps)

    return (
        <section className="flex min-h-0 flex-col gap-2">
            <h3 className="text-sm font-medium">Vorschau</h3>
            {/* Markierbar, damit sich Sonderzeichen wie ★ direkt in die Schritte kopieren lassen */}
            <ul className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-black/20 select-text">
                {preview.map((row) => (
                    <li key={row.id} className="border-b px-2.5 py-1.5 text-xs last:border-b-0">
                        <div className="truncate text-muted-foreground" title={row.before}>
                            {row.before}
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                            {/* Endung direkt am Namen und Leerzeichen sichtbar (whitespace-pre), damit ein Leerzeichen davor auffällt */}
                            <span className="flex min-w-0" title={row.conflict ?? `${row.after}.mkv`}>
                                <span
                                    className={cn(
                                        'overflow-hidden font-medium text-ellipsis whitespace-pre',
                                        row.conflict ? 'text-destructive' : !row.changed && 'font-normal text-muted-foreground/70'
                                    )}
                                >
                                    {row.after}
                                </span>
                                <span className="shrink-0 text-muted-foreground">.mkv</span>
                            </span>
                            {row.manual && (
                                <span className="shrink-0 text-[10px] text-warning" title="Der von Hand eingetragene Name hat Vorrang">
                                    manuell
                                </span>
                            )}
                            {!row.changed && !row.manual && (
                                <span className="shrink-0 text-[10px] text-muted-foreground/70">unverändert</span>
                            )}
                        </div>
                        {row.conflict && <div className="pl-[18px] text-[10px] text-destructive">{row.conflict}</div>}
                    </li>
                ))}
                {preview.length === 0 && <li className="px-2.5 py-3 text-xs text-muted-foreground">Keine Dateien in der Liste</li>}
            </ul>
        </section>
    )
}

const NO_PRESET = 'Keine Regeln'

/** Ein Feld für beides: Der Text benennt das gewählte Preset um, der Pfeil öffnet die Liste */
function PresetPicker({
    presets,
    selected,
    changed,
    onSelect,
    onRename
}: {
    presets: NameRuleSet[]
    selected: NameRuleSet | null
    /** Presets mit ungespeicherten Änderungen */
    changed: Set<string>
    onSelect: (id: string | null) => void
    onRename: (name: string) => void
}) {
    const [open, setOpen] = useState(false)
    const choose = (id: string | null) => {
        onSelect(id)
        setOpen(false)
    }
    const option = (id: string | null, label: string) => (
        <li key={id ?? 'none'}>
            <button
                type="button"
                onClick={() => choose(id)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
                <Check className={cn('size-3.5 shrink-0', (selected?.id ?? null) === id ? 'text-primary' : 'invisible')} />
                <span className={cn('min-w-0 flex-1 truncate', id === null && 'text-muted-foreground')}>{label}</span>
                {id && changed.has(id) && <span className="shrink-0 text-[10px] text-warning">geändert</span>}
            </button>
        </li>
    )

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor asChild>
                <div
                    className={cn(
                        'flex h-9 min-w-0 flex-1 rounded-md border border-input bg-black/20 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40',
                        selected && !selected.name.trim() && 'border-destructive'
                    )}
                >
                    <input
                        aria-label="Name des Presets"
                        value={selected?.name ?? NO_PRESET}
                        readOnly={!selected}
                        placeholder="Name des Presets"
                        spellCheck={false}
                        title={selected ? 'Zum Umbenennen einfach ändern und speichern' : undefined}
                        onClick={() => !selected && setOpen(true)}
                        onChange={(event) => onRename(event.target.value)}
                        className={cn(
                            'h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground',
                            !selected && 'cursor-pointer text-muted-foreground'
                        )}
                    />
                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            aria-label="Preset wählen"
                            className="flex w-9 shrink-0 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
                        </button>
                    </Popover.Trigger>
                </div>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content
                    align="start"
                    sideOffset={4}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    className="z-50 max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
                >
                    <ul>
                        {option(null, NO_PRESET)}
                        {presets.map((preset) => option(preset.id, preset.name.trim() || 'Ohne Namen'))}
                    </ul>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}

/** Kleinster freier Standardname, auch nachdem Presets gelöscht wurden */
function newPresetName(presets: NameRuleSet[]): string {
    const names = new Set(presets.map((preset) => preset.name))
    let number = 1
    while (names.has(`Preset ${number}`)) number++
    return `Preset ${number}`
}

const NO_STEPS: NameStep[] = []
const NO_PRESETS: NameRuleSet[] = []

/**
 * Editor für die Presets der Namensregeln im YouTube-Modus. Das gewählte Preset gilt sofort für alle aktuellen Dateien.
 * Änderungen an den Presets liegen in einem Entwurf, bis sie gespeichert werden; der Dialog bleibt dabei offen.
 */
export function NameRulesDialog({ rows }: { rows: Row[] }) {
    const running = useStore((s) => s.run.running)
    const saved = useStore((s) => s.settings?.nameRuleSets ?? NO_PRESETS)
    const renameFile = useStore((s) => s.settings?.pipeline.renameFile ?? true)
    const updateSettings = useStore((s) => s.updateSettings)
    const activeId = useStore((s) => s.activeRuleSetId)
    const setActive = useStore((s) => s.setActiveRuleSet)
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<NameRuleSet[]>([])
    const [confirmClose, setConfirmClose] = useState(false)

    const selected = draft.find((set) => set.id === activeId) ?? null
    const activeName = saved.find((set) => set.id === activeId)?.name
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
    const canSave = dirty && draft.every((set) => set.name.trim())
    const changed = useMemo(() => {
        const savedById = new Map(saved.map((set) => [set.id, JSON.stringify(set)]))
        return new Set(draft.filter((set) => savedById.get(set.id) !== JSON.stringify(set)).map((set) => set.id))
    }, [draft, saved])

    const onOpenChange = (next: boolean) => {
        if (next) {
            setDraft(saved)
            setConfirmClose(false)
            setOpen(true)
        } else if (dirty) {
            setConfirmClose(true)
        } else {
            setOpen(false)
        }
    }

    const patchSelected = (patch: Partial<Pick<NameRuleSet, 'name' | 'steps'>>) =>
        setDraft((current) => current.map((set) => (set.id === activeId ? { ...set, ...patch } : set)))

    const addPreset = () => {
        const id = crypto.randomUUID()
        setDraft((current) => [...current, { id, name: newPresetName(current), steps: [] }])
        setActive(id)
    }

    const removeSelected = () => {
        const index = draft.findIndex((set) => set.id === activeId)
        const remaining = draft.filter((set) => set.id !== activeId)
        setDraft(remaining)
        setActive((remaining[index] ?? remaining[index - 1])?.id ?? null)
    }

    const save = async () => {
        const next = draft.map((set) => ({ ...set, name: set.name.trim() }))
        setDraft(next)
        await updateSettings({ nameRuleSets: next })
    }

    const discard = () => {
        // Ein nur im Entwurf angelegtes Preset gibt es danach nicht mehr
        if (!saved.some((set) => set.id === activeId)) setActive(null)
        setOpen(false)
    }

    const saveAndClose = async () => {
        await save()
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="-my-1 ml-auto h-7 max-w-72 tracking-normal normal-case" disabled={running}>
                    <Replace className="size-3.5" />
                    Namensregeln
                    {activeName && <span className="truncate font-normal text-primary">{activeName}</span>}
                </Button>
            </DialogTrigger>
            {/* Ein Klick neben den Dialog soll die Arbeit nicht verwerfen */}
            <DialogContent className="h-[85vh] max-w-6xl" onInteractOutside={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Namensregeln</DialogTitle>
                    <DialogDescription>
                        Das gewählte Preset gilt für alle aktuellen Dateien. Seine Schritte laufen von oben nach unten über den bereinigten
                        Namen, ein Schritt, der nicht passt, ändert nichts. Von Hand eingetragene Zielnamen haben Vorrang.
                    </DialogDescription>
                </DialogHeader>
                {!renameFile && (
                    <p className="text-sm text-warning">
                        „Datei umbenennen“ ist abgeschaltet, die Regeln wirken erst, wenn du es wieder anschaltest.
                    </p>
                )}

                <div className="grid min-h-0 flex-1 grid-cols-2 gap-5">
                    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                        <section className="flex flex-col gap-2">
                            <h3 className="text-sm font-medium">Preset</h3>
                            <div className="flex items-center gap-2">
                                <PresetPicker
                                    presets={draft}
                                    selected={selected}
                                    changed={changed}
                                    onSelect={setActive}
                                    onRename={(name) => patchSelected({ name })}
                                />
                                <Button disabled={!canSave} onClick={() => void save()}>
                                    <Save />
                                    Speichern
                                </Button>
                                <Button variant="secondary" onClick={addPreset}>
                                    <Plus />
                                    Neu
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={removeSelected}
                                    disabled={!selected}
                                    aria-label="Preset löschen"
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        </section>

                        {selected ? (
                            <section className="flex flex-col gap-2">
                                <h3 className="text-sm font-medium">Schritte</h3>
                                <StepList steps={selected.steps} onChange={(steps) => patchSelected({ steps })} />
                                <div className="flex flex-wrap gap-1.5">
                                    {STEP_TYPES.map((type) => (
                                        <Button
                                            key={type}
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => patchSelected({ steps: [...selected.steps, createStep(type)] })}
                                        >
                                            <Plus className="size-3" />
                                            {NAME_STEP_LABELS[type]}
                                        </Button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Beim Muster steht jedes {'{wort}'} für einen beliebigen Text und muss den ganzen Namen treffen. Im Ziel
                                    wird es wieder eingesetzt.
                                </p>
                            </section>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {draft.length > 0
                                    ? 'Wähle oben ein Preset zum Ausprobieren oder lege mit „Neu“ ein weiteres an.'
                                    : 'Noch keine Presets. Lege mit „Neu“ das erste an.'}
                            </p>
                        )}
                    </div>

                    <Preview rows={rows} steps={selected?.steps ?? NO_STEPS} />
                </div>

                {confirmClose && dirty ? (
                    <div className="flex items-center justify-end gap-2">
                        <span className="mr-auto text-sm text-warning">Es gibt ungespeicherte Änderungen.</span>
                        <Button variant="ghost" onClick={() => setConfirmClose(false)}>
                            Weiter bearbeiten
                        </Button>
                        <Button variant="outline" onClick={discard}>
                            Verwerfen
                        </Button>
                        <Button disabled={!canSave} onClick={() => void saveAndClose()}>
                            Speichern und schließen
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => onOpenChange(false)}>
                            Schließen
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
