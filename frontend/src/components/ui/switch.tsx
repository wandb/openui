import * as SwitchPrimitives from '@radix-ui/react-switch'
import type * as React from 'react'

import { cn } from 'lib/utils'

const Switch = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
	ref: React.RefObject<React.ElementRef<typeof SwitchPrimitives.Root>>
}) => (
	<SwitchPrimitives.Root
		className={cn(
			'peer focus-visible:ring-ring focus-visible:ring-offset-background data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...props}
		ref={ref}
	>
		<SwitchPrimitives.Thumb
			className={cn(
				'bg-background pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0'
			)}
		/>
	</SwitchPrimitives.Root>
)
Switch.displayName = SwitchPrimitives.Root.displayName

// eslint-disable-next-line import/prefer-default-export
export { Switch }
