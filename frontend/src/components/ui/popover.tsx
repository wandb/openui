import * as PopoverPrimitive from '@radix-ui/react-popover'
import type * as React from 'react'

import { cn } from 'lib/utils'

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverArrow = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Arrow> & {
	ref: React.RefObject<React.ElementRef<typeof PopoverPrimitive.Arrow>>
}) => (
	<PopoverPrimitive.Arrow
		ref={ref}
		className={cn('fill-background', className)}
		style={{
			clipPath: 'inset(0 -10px -10px -10px)',
			filter: 'drop-shadow(0 0 3px gray)',
			bottom: '1px'
		}}
		{...props}
	/>
)
PopoverArrow.displayName = PopoverPrimitive.Arrow.displayName

const PopoverContent = ({
	ref,
	className,
	align = 'center',
	sideOffset = 4,
	...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
	ref: React.RefObject<React.ElementRef<typeof PopoverPrimitive.Content>>
}) => (
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Content
			ref={ref}
			align={align}
			sideOffset={sideOffset}
			className={cn(
				'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 rounded-md border p-4 shadow-md outline-hidden',
				className
			)}
			{...props}
		/>
	</PopoverPrimitive.Portal>
)
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverArrow, PopoverContent, PopoverTrigger }
