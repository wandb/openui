import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { Button } from 'components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from 'components/ui/dropdown-menu'
import { useAtomValue, useSetAtom } from 'jotai'
import { cn } from 'lib/utils'
import { Link, useNavigate } from 'react-router-dom'
import {
	historyAtomFamily,
	historyIdsAtom,
	historySidebarStateAtom
} from 'state'

export default function HistoryItem({
	id,
	label,
	isActive = false,
	isCollapsed = false
}: {
	id: string
	label?: string
	isActive: boolean
	isCollapsed: boolean
}) {
	const item = useAtomValue(historyAtomFamily({ id }))
	const navigate = useNavigate()
	const setHistoryIds = useSetAtom(historyIdsAtom)
	const setSidebarState = useSetAtom(historySidebarStateAtom)
	// Border-[1px] border-b-zinc-500
	return (
		<>
			{Boolean(label) && (
				<div className='mb-2 w-full text-xs'>
					<h3>{label}</h3>
				</div>
			)}
			<div
				className={`${
					isActive && 'bg-secondary'
				} group relative mb-2 w-full rounded-md p-2 text-sm hover:bg-secondary`}
			>
				<Link
					to={`/ai/${id}`}
					onClick={() => setSidebarState('closed')}
					className='flex items-center active:text-black'
				>
					<div className='relative grow overflow-hidden whitespace-nowrap'>
						{`${item.emoji ?? '🤔'} `}
						<span>&nbsp;&nbsp;{item.name ?? item.prompt}</span>
						{/* TODO: the right group-hover translation is finicky */}
						<div
							className={cn(
								'absolute bottom-0 right-0 top-0 w-8 bg-gradient-to-l from-background from-0% to-transparent group-hover:right-5 group-hover:from-secondary dark:from-zinc-900',
								{
									'from-secondary': isActive,
									'dark:from-secondary': isActive
								}
							)}
						/>
					</div>
				</Link>
				<div className='absolute bottom-0 right-0 top-0 flex items-center bg-secondary pr-2 opacity-0 group-hover:opacity-100'>
					<DropdownMenu modal={false}>
						<DropdownMenuTrigger asChild>
							<Button
								className='h-5 w-5 text-sm hover:ring-transparent focus-visible:ring-0'
								variant='ghost'
								size='icon'
							>
								<DotsHorizontalIcon className='inline-block h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem>Copy</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									setHistoryIds(prev => prev.filter(prevId => prevId !== id))
									historyAtomFamily.remove({ id })
									localStorage.removeItem(`${id}.html`)
									localStorage.removeItem(`${id}.md`)
									navigate('/ai/new')
								}}
							>
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<Button
					onClick={() => {
						setSidebarState('closed')
						navigate(`/ai/${id}`)
					}}
					className={cn(
						'absolute -right-[65px] top-0 z-50 ml-auto inline-flex h-8 w-8 p-2 hover:scale-110 hover:bg-inherit',
						isCollapsed && 'ml-10',
						isActive && 'bg-zinc-900'
					)}
					variant='ghost'
					size='icon'
				>
					{item.emoji ?? '🤔'}
				</Button>
			</div>
		</>
	)
}
