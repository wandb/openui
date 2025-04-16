import * as LabelPrimitive from '@radix-ui/react-label'
import { cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from 'lib/utils'

const labelVariants = cva(
	'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
)

const Label = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
	ref: React.RefObject<React.ElementRef<typeof LabelPrimitive.Root>>
}) => (
	<LabelPrimitive.Root
		ref={ref}
		className={cn(labelVariants(), className)}
		{...props}
	/>
)
Label.displayName = LabelPrimitive.Root.displayName

// eslint-disable-next-line import/prefer-default-export
export { Label }
