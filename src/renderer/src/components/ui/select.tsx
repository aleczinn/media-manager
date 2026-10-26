import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Natives Select im Stil der Inputs (Dropdown-Liste folgt dem dunklen Farbschema) */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
    return (
        <div className={cn('relative w-full', className)}>
            <select
                className="h-9 w-full appearance-none rounded-md border border-input bg-black/20 pr-9 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-popover"
                {...props}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
    )
}
