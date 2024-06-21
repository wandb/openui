import Chat from 'components/Chat'
import ErrorBoundary from 'components/ErrorBoundary'
import Head from 'components/Head'
import History from 'components/History'
import LoadingOrError from 'components/LoadingOrError'
import NavBar from 'components/NavBar'
import Register from 'components/Register'
import Versions from 'components/Versions'
import { useAtomValue } from 'jotai'
import { cn } from 'lib/utils'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { historyAtomFamily, historySidebarStateAtom } from 'state'

export default function LayoutWithSidebar({
	isShared = false
}: {
	isShared?: boolean
}) {
	const navigation = useNavigate()
	const params = useParams()
	const curItem = useAtomValue(historyAtomFamily({ id: params.id ?? 'new' }))
	const sidebarState = useAtomValue(historySidebarStateAtom)

	useEffect(() => {
		if (params.id === undefined) {
			navigation(`/ai/new`)
		}
	}, [params.id, navigation])

	return (
		<div className='mobile-safe-container flex h-screen w-full flex-col'>
			<Head
				title={
					curItem.name ? `${curItem.emoji} ${curItem.name}` : 'Create a new UI'
				}
			/>
			<NavBar />
			<Register />
			<main className='flex h-full flex-1 flex-col overflow-hidden bg-muted/40 md:gap-8'>
				<div
					className={cn(
						'grid grid-cols-[280px_auto]',
						sidebarState === 'versions' && 'grid-cols-[auto_420px]'
					)}
				>
					{/* TODO: figure out mobile */}
					<div
						className={cn(
							'flex animate-slide-in flex-col border-r-[1px] border-secondary transition-all',
							sidebarState !== 'history' &&
								'animate-slideout hidden md:hidden lg:hidden'
						)}
					>
						<History />
					</div>
					<div
						className={cn(
							'relative col-span-2 flex-1 transition-all md:col-span-2',
							sidebarState === 'closed'
								? 'lg:col-span-2'
								: 'sm:col-span-1 md:col-span-1',
							'animate-slide-in'
						)}
					>
						<ErrorBoundary
							renderError={error => <LoadingOrError error={error} />}
						>
							<Chat isShared={isShared} />
						</ErrorBoundary>
					</div>
					<div
						className={cn(
							'flex animate-slide-in-right flex-col gap-4 border-r-[1px] border-secondary bg-background transition-all',
							sidebarState !== 'versions' && 'hidden animate-slide-out',
							'absolute right-0 md:relative'
						)}
					>
						<Versions />
					</div>
				</div>
			</main>
			<canvas id='resizer' className='hidden' />
		</div>
	)
}
