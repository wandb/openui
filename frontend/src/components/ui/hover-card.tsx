import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import type * as React from 'react'

import { cn } from 'lib/utils'

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardArrow = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Arrow> & {
	ref: React.RefObject<React.ElementRef<typeof HoverCardPrimitive.Arrow>>
}) => (
	<HoverCardPrimitive.Arrow
		ref={ref}
		className={cn('fill-background bottom-[1px]!', className)}
		style={{
			clipPath: 'inset(0 -10px -10px -10px)',
			filter: 'drop-shadow(0 0 3px gray)'
		}}
		{...props}
	/>
)
HoverCardArrow.displayName = HoverCardPrimitive.Arrow.displayName

const HoverCardContent = ({
	ref,
	className,
	align = 'center',
	sideOffset = 4,
	...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content> & {
	ref: React.RefObject<React.ElementRef<typeof HoverCardPrimitive.Content>>
}) => (
	<HoverCardPrimitive.Content
		ref={ref}
		align={align}
		sideOffset={sideOffset}
		className={cn(
			'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 rounded-md p-4 shadow-md outline-hidden',
			className
		)}
		{...props}
	/>
)
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardArrow, HoverCardContent, HoverCardTrigger }
