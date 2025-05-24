import { Share2Icon } from '@radix-ui/react-icons'
import copyTextToClipboard from '@uiw/copy-to-clipboard'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from 'components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip'
import { useVersion } from 'hooks'
import { useAtom } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ItemWrapper, historyAtomFamily } from 'state'
import { share } from '../api/openui'
import { Button } from './ui/button'

export default function ShareDialog() {
	const params = useParams()
	const id = params.id ?? 'new'
	const [rawItem, setRawItem] = useAtom(historyAtomFamily({ id }))
	const item = useMemo(
		() => new ItemWrapper(rawItem, setRawItem),
		[rawItem, setRawItem]
	)
	const [open, setOpen] = useState<boolean>(false)
	const [error, setError] = useState<string | undefined>()
	const [versionIdx] = useVersion(item)

	useEffect(() => {
		if (open) {
			// TODO: support the other frameworks, maybe versions?
			share(id, item, versionIdx)
				.then(() => {
					copyTextToClipboard(
						document.location.href.replace('/ai', '/ai/shared')
					)
				})
				.catch((error_: unknown) => {
					console.error('Share error', error_)
					setError((error_ as Error).toString())
				})
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, open])

	return (
		<Dialog onOpenChange={open_ => setOpen(open_)}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button variant='ghost' className='-mr-4 hover:bg-transparent'>
							<Share2Icon />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent side='bottom'>Share this version</TooltipContent>
			</Tooltip>
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
