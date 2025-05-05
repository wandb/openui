import type * as React from 'react'

import { cn } from 'lib/utils'

const Textarea = ({
	ref,
	className,
	...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
	ref: React.RefObject<HTMLTextAreaElement>
}) => (
	<textarea
		className={cn(
			'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		ref={ref}
		{...props}
	/>
)
Textarea.displayName = 'Textarea'

// eslint-disable-next-line import/prefer-default-export
export { Textarea }
