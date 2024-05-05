import {
	DoubleArrowLeftIcon,
	DoubleArrowRightIcon,
	GearIcon,
	GitHubLogoIcon,
	Pencil2Icon
} from '@radix-ui/react-icons'
import ErrorBoundary from 'components/ErrorBoundary'
import Head from 'components/Head'
import HistoryItem from 'components/HistoryItem'
import LoadingOrError from 'components/LoadingOrError'
import Register from 'components/Register'
import Settings from 'components/Settings'
import { Button } from 'components/ui/button'
import { useMediaQuery } from 'hooks'
import { useAtom, useAtomValue, useStore } from 'jotai'
import { MOBILE_WIDTH, cn } from 'lib/utils'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { historyAtomFamily, historyIdsAtom } from 'state'

export default function LayoutWithSidebar() {
	const bigEnough = useMediaQuery(`(min-width: ${MOBILE_WIDTH}px)`)
	const [isCollapsed, setIsCollapsed] = useState(!bigEnough)
	const navigation = useNavigate()
	const [history] = useAtom(historyIdsAtom)
	const params = useParams()
	const curItem = useAtomValue(historyAtomFamily({ id: params.id ?? 'new' }))
	const store = useStore()

	useEffect(() => {
		if (params.id === undefined) {
			console.log('redirecting')
			navigation(`/ai/new`)
		}
	}, [params.id, navigation])

	useEffect(() => {
		setIsCollapsed(!bigEnough)
	}, [bigEnough, setIsCollapsed])

	const now = new Date()
	// eslint-disable-next-line @typescript-eslint/no-magic-numbers
	const today = new Date(now.getTime() - 24 * 60 * 60 * 1000)
	// eslint-disable-next-line @typescript-eslint/no-magic-numbers
	const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
	let lastLabel = ''

	return (
		<div className='mobile-safe-container flex overflow-hidden bg-secondary'>
			<Head title={curItem.name ?? 'Create a new Element'} />
			<Register />
			<div
				className={cn(
					`${
						isCollapsed ? 'w-0' : 'w-[300px]'
					} flex h-screen flex-none flex-col border-r border-input bg-zinc-300 transition-all duration-300 ease-in-out dark:bg-zinc-900`,
					!bigEnough && !isCollapsed && 'absolute z-50'
				)}
			>
				<div className='flex items-center pb-2 pl-4'>
					<h2
						className={`${
							isCollapsed ? 'opacity-0' : 'opacity-100'
						} text-sm text-secondary-foreground transition-all duration-300`}
					>
						History
					</h2>
					<Button
						asChild
						size='icon'
						variant='ghost'
						className='ml-auto inline-flex p-2 hover:bg-inherit'
					>
						<a
							aria-label='GitHub'
							rel='noreferrer'
							target='_blank'
							href='https://github.com/wandb/openui'
						>
							<GitHubLogoIcon className='h-5 w-5' />
						</a>
					</Button>
					<Settings
						trigger={
							<Button
								className={cn(
									'inline-flex p-2 hover:scale-110 hover:bg-inherit',
									!isCollapsed && '-ml-2	'
								)}
								variant='ghost'
								size='icon'
							>
								<GearIcon className='h-5 w-5' />
							</Button>
						}
					/>
					<Button
						// eslint-disable-next-line react/jsx-handler-names
						onClick={() => {
							navigation('/ai/new')
							if (!bigEnough) {
								setIsCollapsed(true)
							}
						}}
						className={cn(
							'inline-flex p-2 hover:scale-110 hover:bg-inherit',
							!isCollapsed && '-ml-2'
						)}
						variant='ghost'
						size='icon'
					>
						<Pencil2Icon className='inline-block h-5 w-5' />
					</Button>
				</div>
				<div className='flex h-full max-h-full flex-col items-start justify-start overflow-y-auto overflow-x-hidden p-3'>
					{history.map(id => {
						let label: string | undefined
						const item = store.get(historyAtomFamily({ id }))
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
								active={params.id === id}
								collapsed={isCollapsed}
							/>
						)
					})}
				</div>
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
				</Button>
			</div>
			<div className='mobile-safe-container relative flex-1 overflow-hidden'>
				<ErrorBoundary renderError={error => <LoadingOrError error={error} />}>
					<Outlet />
				</ErrorBoundary>
			</div>
		</div>
	)
}
