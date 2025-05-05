import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import * as React from 'react'

import { cn } from 'lib/utils'

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
	ref: React.RefObject<React.ElementRef<typeof DialogPrimitive.Overlay>>
}) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80',
			className
		)}
		{...props}
	/>
)
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = ({
	ref,
	className,
	children,
	hasClose = true,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
	ref: React.RefObject<React.ElementRef<typeof DialogPrimitive.Content>>
	children: React.ReactNode
	hasClose?: boolean
}) => {
	const overlayRef =
		React.useRef<React.ElementRef<typeof DialogPrimitive.Overlay>>(null)
	return (
		<DialogPortal>
			<DialogOverlay ref={overlayRef} />
			<DialogPrimitive.Content
				ref={ref}
				className={cn(
					'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg',
					className
				)}
				{...props}
			>
				{children}
				{hasClose ? <DialogPrimitive.Close className='ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none'>
						<X className='h-4 w-4' />
						<span className='sr-only'>Close</span>
					</DialogPrimitive.Close> : null}
			</DialogPrimitive.Content>
		</DialogPortal>
	)
}
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'flex flex-col space-y-1.5 text-center sm:text-left',
			className
		)}
		{...props}
	/>
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
			className
		)}
		{...props}
	/>
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
	ref: React.RefObject<React.ElementRef<typeof DialogPrimitive.Title>>
}) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			'text-lg leading-none font-semibold tracking-tight',
			className
		)}
		{...props}
	/>
)
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = ({
	ref,
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
	ref: React.RefObject<React.ElementRef<typeof DialogPrimitive.Description>>
}) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn('text-muted-foreground text-sm', className)}
		{...props}
	/>
)
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger
}
