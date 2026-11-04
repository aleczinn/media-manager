import { useMemo, useState } from 'react'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowRight, GripVertical, Plus, Replace, Trash2, X } from 'lucide-react'
import { findConflicts } from '@shared/conflicts'
import {
    applyNameRules,
    NAME_STEP_LABELS,
    ruleFolder,
    stepError,
    youtubeStem,
    type NameRules,
    type NameStep,
    type NameStepType
} from '@shared/name-rules'
import { cleanYoutubeName } from '@shared/youtube'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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

/** Vorher → Nachher mit den Regeln aus dem Entwurf, inklusive der Konflikte, die die Tabelle danach zeigen würde */
function usePreview(rows: Row[], rules: NameRules, selectedId: string | null): { preview: PreviewRow[]; assigned: boolean } {
    const overrides = useStore((s) => s.overrides)
    const outputNames = useStore((s) => s.outputNames)

    return useMemo(() => {
        const selected = rules.nameRuleSets.find((set) => set.id === selectedId) ?? null
        const assignedRows = rows.filter((row) => rules.folderRuleSets[ruleFolder(row.entry.file)] === selectedId)
        const assigned = assignedRows.length > 0
        const shown = assigned ? assignedRows : rows
        const shownIds = new Set(shown.map((row) => row.entry.file.id))

        const stemOf = (row: Row) => {
            const { file } = row.entry
            if (overrides[file.id] !== undefined) return overrides[file.id]
            // Solange der Regelsatz keinem Ordner zugewiesen ist, zeigt die Vorschau ihn probeweise auf allen Dateien
            if (shownIds.has(file.id) && selected) return applyNameRules(cleanYoutubeName(file.name), selected.steps)
            return youtubeStem(file, rules)
        }
        const conflicts = findConflicts(
            rows.filter((row) => !row.excluded && row.result?.status !== 'ok').map((row) => ({ id: row.entry.file.id, stem: stemOf(row) })),
            outputNames
        )

        return {
            assigned,
            preview: shown.map((row) => {
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
        }
    }, [rows, rules, selectedId, overrides, outputNames])
}

function Preview({ rows, rules, selectedId }: { rows: Row[]; rules: NameRules; selectedId: string | null }) {
    const { preview, assigned } = usePreview(rows, rules, selectedId)

    return (
        <section className="flex min-h-0 flex-col gap-2">
            <h3 className="text-sm font-medium">Vorschau</h3>
            {selectedId && !assigned && rows.length > 0 && (
                <p className="text-xs text-warning">
                    Noch keinem Ordner zugewiesen: Die Vorschau zeigt den Regelsatz probeweise auf allen Dateien.
                </p>
            )}
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

/** Quellordner der aktuellen Liste mit ihrer Dateianzahl */
function foldersOf(rows: Row[]): { folder: string; count: number }[] {
    const counts = new Map<string, number>()
    for (const row of rows) {
        const folder = ruleFolder(row.entry.file)
        counts.set(folder, (counts.get(folder) ?? 0) + 1)
    }
    return Array.from(counts, ([folder, count]) => ({ folder, count })).sort((a, b) => a.folder.localeCompare(b.folder, 'de'))
}

/** Editor für die Namensregeln des YouTube-Modus; Änderungen gelten erst nach „Speichern“ */
export function NameRulesDialog({ rows }: { rows: Row[] }) {
    const running = useStore((s) => s.run.running)
    const settings = useStore((s) => s.settings)
    const updateSettings = useStore((s) => s.updateSettings)
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<NameRules>({ nameRuleSets: [], folderRuleSets: {} })
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const folders = foldersOf(rows)

    const onOpenChange = (next: boolean) => {
        if (next && settings) {
            const { nameRuleSets, folderRuleSets } = settings
            setDraft({ nameRuleSets, folderRuleSets })
            // Vorbelegt mit dem Regelsatz des ersten Ordners, der einen hat
            const assigned = folders.map(({ folder }) => folderRuleSets[folder]).find((id) => nameRuleSets.some((set) => set.id === id))
            setSelectedId(assigned ?? nameRuleSets[0]?.id ?? null)
        }
        setOpen(next)
    }

    const selected = draft.nameRuleSets.find((set) => set.id === selectedId) ?? null

    const patchSelected = (patch: Partial<{ name: string; steps: NameStep[] }>) =>
        setDraft((current) => ({
            ...current,
            nameRuleSets: current.nameRuleSets.map((set) => (set.id === selectedId ? { ...set, ...patch } : set))
        }))

    const addSet = () => {
        const id = crypto.randomUUID()
        setDraft((current) => ({
            ...current,
            nameRuleSets: [...current.nameRuleSets, { id, name: `Regelsatz ${current.nameRuleSets.length + 1}`, steps: [] }]
        }))
        setSelectedId(id)
    }

    const removeSelected = () => {
        const remaining = draft.nameRuleSets.filter((set) => set.id !== selectedId)
        setDraft({
            nameRuleSets: remaining,
            folderRuleSets: Object.fromEntries(Object.entries(draft.folderRuleSets).filter(([, id]) => id !== selectedId))
        })
        setSelectedId(remaining[0]?.id ?? null)
    }

    const assign = (folder: string, id: string) =>
        setDraft((current) => {
            const folderRuleSets = { ...current.folderRuleSets }
            if (id) folderRuleSets[folder] = id
            else delete folderRuleSets[folder]
            return { ...current, folderRuleSets }
        })

    const save = async () => {
        await updateSettings(draft)
        setOpen(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="-my-1 ml-auto h-7 tracking-normal normal-case" disabled={running}>
                    <Replace className="size-3.5" />
                    Namensregeln
                </Button>
            </DialogTrigger>
            {/* Ein Klick neben den Dialog soll die Arbeit nicht verwerfen */}
            <DialogContent className="h-[85vh] max-w-6xl" onInteractOutside={(event) => event.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>Namensregeln</DialogTitle>
                    <DialogDescription>
                        Die Schritte eines Regelsatzes laufen von oben nach unten über den bereinigten Namen. Ein Schritt, der nicht passt,
                        ändert nichts. Von Hand eingetragene Zielnamen haben Vorrang.
                    </DialogDescription>
                </DialogHeader>
                {settings && !settings.pipeline.renameFile && (
                    <p className="text-sm text-warning">
                        „Datei umbenennen“ ist abgeschaltet, die Regeln wirken erst, wenn du es wieder anschaltest.
                    </p>
                )}

                <div className="grid min-h-0 flex-1 grid-cols-2 gap-5">
                    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                        <section className="flex flex-col gap-2">
                            <h3 className="text-sm font-medium">Regelsatz</h3>
                            <div className="flex items-center gap-2">
                                <Select
                                    aria-label="Regelsatz wählen"
                                    className="min-w-0 flex-1"
                                    value={selectedId ?? ''}
                                    disabled={!selected}
                                    onChange={(event) => setSelectedId(event.target.value)}
                                >
                                    {!selected && <option value="">Noch kein Regelsatz</option>}
                                    {draft.nameRuleSets.map((set) => (
                                        <option key={set.id} value={set.id}>
                                            {set.name || 'Ohne Namen'}
                                        </option>
                                    ))}
                                </Select>
                                <Button variant="secondary" onClick={addSet}>
                                    <Plus />
                                    Neu
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={removeSelected}
                                    disabled={!selected}
                                    aria-label="Regelsatz löschen"
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                            {selected && (
                                <Input
                                    aria-label="Name des Regelsatzes"
                                    placeholder="Name des Regelsatzes"
                                    value={selected.name}
                                    onChange={(event) => patchSelected({ name: event.target.value })}
                                />
                            )}
                        </section>

                        {selected && (
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
                        )}

                        <section className="flex flex-col gap-2">
                            <h3 className="text-sm font-medium">Ordner zuweisen</h3>
                            {folders.map(({ folder, count }) => (
                                <div key={folder} className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-sm" title={folder}>
                                        {folder}
                                        <span className="ml-1.5 text-xs text-muted-foreground">
                                            ({count} {count === 1 ? 'Datei' : 'Dateien'})
                                        </span>
                                    </span>
                                    <Select
                                        aria-label={`Regelsatz für ${folder}`}
                                        className="w-56 shrink-0"
                                        value={draft.folderRuleSets[folder] ?? ''}
                                        onChange={(event) => assign(folder, event.target.value)}
                                    >
                                        <option value="">Keiner</option>
                                        {draft.nameRuleSets.map((set) => (
                                            <option key={set.id} value={set.id}>
                                                {set.name || 'Ohne Namen'}
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            ))}
                            {folders.length === 0 && <p className="text-xs text-muted-foreground">Keine Dateien in der Liste</p>}
                        </section>
                    </div>

                    <Preview rows={rows} rules={draft} selectedId={selectedId} />
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                        Abbrechen
                    </Button>
                    <Button onClick={() => void save()}>Speichern</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
