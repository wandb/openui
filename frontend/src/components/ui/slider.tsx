import * as SliderPrimitive from '@radix-ui/react-slider'
import type * as React from 'react'

import { cn } from 'lib/utils'

const Slider = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
	ref: React.RefObject<React.ElementRef<typeof SliderPrimitive.Root>>
}) => (
	<SliderPrimitive.Root
		ref={ref}
		className={cn(
			'relative flex w-full touch-none items-center select-none',
			className
		)}
		{...props}
	>
		<SliderPrimitive.Track className='bg-secondary relative h-2 w-full grow overflow-hidden rounded-full'>
			<SliderPrimitive.Range className='bg-primary absolute h-full' />
		</SliderPrimitive.Track>
		<SliderPrimitive.Thumb className='border-primary bg-background ring-offset-background focus-visible:ring-ring block h-5 w-5 rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50' />
	</SliderPrimitive.Root>
)
Slider.displayName = SliderPrimitive.Root.displayName

// eslint-disable-next-line import/prefer-default-export
export { Slider }
