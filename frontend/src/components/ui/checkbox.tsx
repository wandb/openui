import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import type * as React from 'react'

import { cn } from 'lib/utils'

const Checkbox = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
	ref: React.RefObject<React.ElementRef<typeof CheckboxPrimitive.Root>>
}) => (
	<CheckboxPrimitive.Root
		ref={ref}
		className={cn(
			'peer border-primary ring-offset-background focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground h-4 w-4 shrink-0 rounded-sm border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator
			className={cn('flex items-center justify-center text-current')}
		>
			<Check className='h-4 w-4' />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
)
Checkbox.displayName = CheckboxPrimitive.Root.displayName

// eslint-disable-next-line import/prefer-default-export
export { Checkbox }
