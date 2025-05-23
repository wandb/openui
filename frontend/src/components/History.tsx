import { useMediaQuery } from 'hooks'
import { useAtom, useAtomValue, useStore } from 'jotai'
import { MOBILE_WIDTH } from 'lib/utils'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
	historyAtomFamily,
	historyIdsAtom,
	historySidebarStateAtom
} from 'state'
import HistoryItem from './HistoryItem'

export default function History() {
	const params = useParams()

	const bigEnough = useMediaQuery(`(min-width: ${MOBILE_WIDTH}px)`)
	const isOpen = useAtomValue(historySidebarStateAtom) !== 'closed'

	const [isCollapsed, setIsCollapsed] = useState(!isOpen)
	const [history] = useAtom(historyIdsAtom)
	const store = useStore()

	const now = new Date()

	const today = new Date(now.getTime() - 24 * 60 * 60 * 1000)

	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
	let lastLabel = 'Today'

	useEffect(() => {
		// SetIsCollapsed(!bigEnough)
	}, [bigEnough, setIsCollapsed])

	return (
		<div className='relative flex h-screen max-h-[calc(100vh-4em)] flex-none flex-col overflow-y-auto border-r border-input transition-all duration-500 ease-in-out dark:bg-zinc-900'>
			<div className='flex h-screen max-h-full flex-col items-start justify-start overflow-x-hidden py-2 pl-2'>
				{history.map((id, i) => {
					let label: string | undefined
					const item = store.get(historyAtomFamily({ id }))
					// Hacky reset of lastLabel for cases where we have new itesm
					if (i === 0 && item.createdAt && item.createdAt >= today) {
						lastLabel = ''
					}
					if (
						item.createdAt &&
						item.createdAt >= today &&
						(lastLabel === '' || lastLabel === 'Today')
					) {
						label = lastLabel === 'Today' ? undefined : 'Today'
						lastLabel = 'Today'
					} else if (
						item.createdAt &&
						item.createdAt >= sevenDaysAgo &&
						lastLabel === 'Today'
					) {
						label = 'Previous 7 days'
						lastLabel = label
					} else if (
						lastLabel === 'Previous 7 days' &&
						item.createdAt &&
						item.createdAt <= sevenDaysAgo
					) {
						label = 'Previous 30 days'
						lastLabel = label
					} else {
						label = undefined
					}
					return (
						<HistoryItem
							key={id}
							id={id}
							label={label}
							isActive={params.id === id}
							isCollapsed={isCollapsed}
						/>
					)
				})}
			</div>
			{/*
			<span className='absolute bottom-0 p-2 pl-4 text-xs italic text-zinc-700 dark:text-zinc-300'>
				Built with{' '}
				<img
					aria-hidden
					src='https://wandb.github.io/weave/img/logo.svg'
					className='inline-block w-4'
					alt='Weave'
				/>{' '}
				<a
					href='https://wandb.me/weave?ref=openui'
					target='_blank'
					rel='noreferrer'
					className='underline'
				>
					Weave
				</a>
			</span>
			 <Button
				// eslint-disable-next-line react/jsx-handler-names
				onClick={() => {
					setIsCollapsed(!isCollapsed)
				}}
				className={cn(
					'ml-auto inline-flex p-2 hover:scale-110 hover:bg-secondary',
					isCollapsed && 'absolute -left-2 top-[90px] z-50 bg-secondary',
					!bigEnough && 'mb-20'
				)}
				variant='ghost'
				size='icon'
			>
				{isCollapsed ? (
					<DoubleArrowRightIcon className='inline-block h-4 w-4' />
				) : (
					<DoubleArrowLeftIcon className='inline-block h-4 w-4' />
				)}
        </Button> */}
		</div>
	)
}
