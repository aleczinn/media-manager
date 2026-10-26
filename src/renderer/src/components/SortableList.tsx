import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SortableListProps {
    items: string[]
    onChange: (items: string[]) => void
    getLabel: (value: string) => string
    /** Wenn gesetzt, bekommt jeder Eintrag einen Entfernen-Knopf */
    onRemove?: (value: string) => void
}

function SortableRow({ id, index, label, onRemove }: { id: string; index: number; label: string; onRemove?: (value: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                'flex h-8 items-center gap-2 rounded-md border border-input bg-black/20 pr-1 pl-1.5 text-sm',
                isDragging && 'relative z-10 border-primary/60 bg-secondary shadow-lg'
            )}
        >
            <button
                type="button"
                className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                aria-label={`${label} verschieben`}
                {...attributes}
                {...listeners}
            >
                <GripVertical className="size-4" />
            </button>
            <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
            <span className="flex-1 truncate">{label}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={() => onRemove(id)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`${label} entfernen`}
                >
                    <X className="size-3.5" />
                </button>
            )}
        </li>
    )
}

/** Liste, deren Reihenfolge per Drag & Drop (oder Tastatur) geändert wird. */
export function SortableList({ items, onChange, getLabel, onRemove }: SortableListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return
        onChange(arrayMove(items, items.indexOf(String(active.id)), items.indexOf(String(over.id))))
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
        >
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
                <ul className="flex w-full flex-col gap-1">
                    {items.map((item, index) => (
                        <SortableRow key={item} id={item} index={index} label={getLabel(item)} onRemove={onRemove} />
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    )
}
