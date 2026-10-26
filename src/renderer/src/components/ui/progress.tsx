import type { ComponentProps } from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Progress({ className, value, ...props }: ComponentProps<typeof ProgressPrimitive.Root>) {
    return (
        <ProgressPrimitive.Root className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/15', className)} {...props}>
            <ProgressPrimitive.Indicator
                className="h-full w-full flex-1 bg-primary transition-transform duration-300"
                style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
            />
        </ProgressPrimitive.Root>
    )
}
