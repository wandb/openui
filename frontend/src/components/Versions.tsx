import { Cross1Icon } from '@radix-ui/react-icons'
import { useAtom, useSetAtom } from 'jotai'
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ItemWrapper, historyAtomFamily, historySidebarStateAtom } from 'state'
import VersionPreview from './VersionPreview'
import { Button } from './ui/button'

export default function Versions() {
	const params = useParams()
	const id = params.id ?? 'new'
	const setHistoryState = useSetAtom(historySidebarStateAtom)
	const [rawItem, setRawItem] = useAtom(historyAtomFamily({ id }))
	const item = useMemo(
		() => new ItemWrapper(rawItem, setRawItem),
		[rawItem, setRawItem]
	)
	item.id = id
	return (
		<div className='flex h-[calc(100vh-4em)] flex-none flex-col border-l'>
			<div className='flex items-center justify-between border-b p-4'>
				<h2 className='text-xl font-semibold'>Version History</h2>
				<Button
					variant='ghost'
					className='hover:bg-transparent'
					onClick={() => {
						setHistoryState('closed')
					}}
				>
					<Cross1Icon className='h-4 w-4' />
				</Button>
			</div>
			<div className='h-screen max-h-screen overflow-y-scroll'>
				{item.chapters.map((version, i) => (
					<VersionPreview
						// Html ? html.html : ''

						key={`version-${id}-${i}`}
						versionIdx={i}
						item={item}
					/>
				))}
			</div>
		</div>
	)
}
