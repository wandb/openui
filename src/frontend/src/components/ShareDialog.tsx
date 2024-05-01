import { Share1Icon } from '@radix-ui/react-icons'
import copyTextToClipboard from '@uiw/copy-to-clipboard'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from 'components/ui/dialog'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { historyAtomFamily } from 'state'
import { share } from '../api/openui'

// eslint-disable-next-line import/prefer-default-export
export default function ShareDialog() {
	const params = useParams()
	const id = params.id ?? 'new'
	const item = useAtomValue(historyAtomFamily({ id }))
	const [open, setOpen] = useState<boolean>(false)
	const [error, setError] = useState<string | undefined>()

	useEffect(() => {
		if (open) {
			share(id, item)
				.then(() => {
					copyTextToClipboard(
						document.location.href.replace('/ai', '/ai/shared')
					)
				})
				.catch((error_: Error) => {
					console.error('Share error', error_)
					setError(error_.toString())
				})
		}
	}, [id, item, open])

	return (
		<Dialog onOpenChange={open_ => setOpen(open_)}>
			<DialogTrigger asChild>
				<button
					type='button'
					aria-label='Share'
					className='flex items-center border-l px-3 text-sm text-secondary-foreground hover:bg-background'
				>
					<Share1Icon />
				</button>
			</DialogTrigger>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogHeader>
					<DialogTitle>Share</DialogTitle>
					{error ? (
						<DialogDescription className='mb-2 text-red-500 dark:text-red-400'>
							{error}
						</DialogDescription>
					) : (
						<DialogDescription>
							Copy the link below to share your creation
						</DialogDescription>
					)}
				</DialogHeader>
				<div className='items-center'>
					<input
						type='text'
						value={document.location.href.replace('/ai', '/ai/shared')}
						className='w-full p-3'
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
