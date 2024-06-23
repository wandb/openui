import {
	AvatarIcon,
	ChevronDownIcon,
	GearIcon,
	PlusIcon
} from '@radix-ui/react-icons'
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar'
import { useAtom, useAtomValue } from 'jotai'
import { calculateSHA256, cn } from 'lib/utils'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
	historyAtomFamily,
	historySidebarStateAtom,
	sessionAtom,
	uiStateAtom
} from 'state'
import Logo from './Logo'
import Settings from './Settings'
import { Button } from './ui/button'

export default function NavBar() {
	const navigate = useNavigate()
	const [avatarURL, setAvatarURL] = useState<string | undefined>()
	const [historyState, setHistoryState] = useAtom(historySidebarStateAtom)
	const params = useParams()
	const id = params.id ?? 'new'
	const item = useAtomValue(historyAtomFamily({ id }))
	const sessionData = useAtomValue(sessionAtom)
	const uiState = useAtomValue(uiStateAtom)

	useEffect(() => {
		if (sessionData?.email) {
			calculateSHA256(sessionData.email).then(
				h => {
					setAvatarURL(`https://www.gravatar.com/avatar/${h}`)
				},
				() => console.error('Email hash failure')
			)
		}
	}, [sessionData?.email])

	let displayName = `${item.emoji} ${item.name}`
	if (!item.name) {
		if (uiState.rendering) {
			displayName = '⏳ Rendering...'
		} else if (uiState.error) {
			displayName = '⚠️ Error'
		} else {
			displayName = '⚠️ Unknown Error'
		}
	}
	const name = id === 'new' ? 'OpenUI' : displayName
	return (
		<header
			style={{ zIndex: 10_000 }}
			className='flex h-14 items-center gap-4 border-b bg-background px-4 py-2 md:px-6'
		>
			<nav className='flex flex-col gap-6 text-lg font-medium lg:gap-6'>
				<Button
					className='px-0 hover:bg-transparent'
					variant='ghost'
					onClick={() => {
						setHistoryState(historyState === 'history' ? 'closed' : 'history')
						navigate('/ai/new')
					}}
				>
					<Logo className='w-12' />
				</Button>
			</nav>
			<div className='mx-auto hidden w-full items-center md:flex'>
				<div
					className={cn(
						'absolute left-1/2 -translate-x-1/2 transform font-semibold',
						id === 'new' && 'hidden'
					)}
				>
					{name}
					<Button
						variant='ghost'
						size='icon'
						className='-ml-2 hover:bg-transparent'
						onClick={() =>
							setHistoryState(
								historyState === 'versions' ? 'closed' : 'versions'
							)
						}
					>
						<ChevronDownIcon className='h-3 w-3' />
					</Button>
				</div>
			</div>
			<div className='flex w-full items-center justify-end'>
				<Button
					asChild
					size='icon'
					variant='secondary'
					className='mr-2 h-8 w-8 rounded-sm hover:bg-muted/80'
				>
					<a
						aria-label='GitHub'
						rel='noreferrer'
						target='_blank'
						href='https://github.com/wandb/openui'
					>
						<svg
							className='h-4 w-4'
							width='24'
							height='24'
							viewBox='0 0 24 24'
							fill='none'
							xmlns='http://www.w3.org/2000/svg'
						>
							<path
								d='M16.8973 4.8424C17.0202 4.80019 17.437 4.64594 17.5258 4.80553C17.5838 4.90971 17.647 5.07393 17.6942 5.28761C17.7899 5.72079 17.7932 6.23147 17.6707 6.63977C17.5882 6.91481 17.6246 7.27653 17.8069 7.50094C18.397 8.22732 18.7502 9.15206 18.7502 10.1613C18.7502 12.3205 17.1213 14.1319 14.9742 14.3603L14.1986 14.4428C13.9261 14.4718 13.6912 14.6471 13.5857 14.9C13.4803 15.1529 13.5211 15.4432 13.6923 15.6571C14.0986 16.1651 14.2827 16.7103 14.3049 17.3771C14.342 18.4924 14.2994 19.6249 14.3002 20.7447C14.3005 21.1589 14.636 21.4945 15.0502 21.4942C15.4644 21.4939 15.8005 21.1579 15.8002 20.7437L15.8079 17.4015C15.8075 17.3342 15.8012 16.9439 15.7056 16.4643C15.705 16.4616 15.7034 16.4591 15.7007 16.4569C15.6612 16.261 15.6034 16.0331 15.5166 15.798C18.2346 15.3231 20.2502 12.9574 20.2502 10.1613C20.2502 8.91427 19.8505 7.75888 19.1728 6.81849C19.3117 6.18619 19.281 5.51695 19.1589 4.96398C19.0889 4.64745 18.9824 4.33824 18.8366 4.07618C18.7038 3.8376 18.477 3.52707 18.1121 3.38113C17.6131 3.18156 17.0005 3.22098 16.4101 3.4237C15.884 3.60434 15.3267 3.92921 14.7827 4.41877C14.6605 4.39541 14.4941 4.36706 14.2853 4.33908C13.8208 4.27683 13.1462 4.21637 12.2779 4.21637C11.4097 4.21637 10.7351 4.27683 10.2706 4.33908C10.0632 4.36686 9.89783 4.395 9.77581 4.41826C9.23206 3.92899 8.67488 3.60428 8.14896 3.4237C7.55857 3.22098 6.94595 3.18156 6.447 3.38113C6.08213 3.52707 5.85526 3.8376 5.72251 4.07618C5.57669 4.33824 5.47017 4.64745 5.40023 4.96398C5.27827 5.51596 5.24748 6.18379 5.38556 6.81508C4.70636 7.75609 4.30573 8.91276 4.30573 10.1613C4.30573 12.9576 6.32152 15.3234 9.03964 15.7981C8.95174 16.0369 8.89394 16.2677 8.85477 16.4643C8.75916 16.9438 8.75285 17.3341 8.75241 17.4014L8.75216 17.7675C8.27674 17.7451 7.97788 17.6398 7.76777 17.5177C7.5219 17.3747 7.33306 17.1728 7.10608 16.8809C7.05933 16.8208 7.01116 16.7566 6.96075 16.6894C6.53264 16.1185 5.94254 15.3317 4.68208 15.0166C4.28023 14.9161 3.87303 15.1604 3.77257 15.5623C3.67211 15.9641 3.91643 16.3713 4.31828 16.4718C5.04387 16.6532 5.33065 17.0287 5.7593 17.5901C5.81114 17.658 5.86504 17.7285 5.92205 17.8018C6.18119 18.135 6.51318 18.5233 7.01384 18.8144C7.48137 19.0862 8.0438 19.2445 8.75116 19.2687L8.75017 20.7437C8.7499 21.1579 9.08546 21.4939 9.49967 21.4942C9.91389 21.4944 10.2499 21.1589 10.2502 20.7447L10.2524 17.4114L10.2524 17.4102C10.2589 16.7326 10.4514 16.1724 10.8636 15.6571C11.0348 15.4432 11.0756 15.1529 10.9702 14.9C10.8647 14.6471 10.6298 14.4718 10.3573 14.4428L9.58172 14.3603C7.43462 14.1319 5.80573 12.3205 5.80573 10.1613C5.80573 9.15207 6.15885 8.22732 6.74895 7.50094C6.93002 7.27806 6.97051 6.91358 6.88837 6.63977C6.76588 6.23147 6.76919 5.72079 6.8649 5.28761C6.91212 5.07393 6.97528 4.90971 7.03325 4.80553C7.12205 4.64594 7.5389 4.80019 7.66184 4.8424C8.02462 4.96696 8.4831 5.23218 8.96612 5.71763C9.18958 5.94221 9.59673 6.00276 9.90003 5.92467C10.6726 5.7444 11.4895 5.71637 12.2779 5.71637C13.066 5.71637 13.8835 5.74365 14.6557 5.92464L14.657 5.92495L14.6582 5.92526C14.9617 6.00264 15.3694 5.94228 15.593 5.71763C16.076 5.23218 16.5345 4.96696 16.8973 4.8424Z'
								fill='currentColor'
							/>
						</svg>
					</a>
				</Button>
				<Settings
					trigger={
						<Button
							className='mr-2 h-8 w-8 rounded-sm hover:bg-muted/80'
							variant='secondary'
							size='icon'
						>
							<GearIcon className='h-4 w-4' />
						</Button>
					}
				/>

				<Button
					onClick={() => navigate('/ai/new')}
					className='h-8 pl-[0.35rem] pr-3 dark:text-white'
				>
					<PlusIcon className='mr-1 h-5 w-5' />
					New UI
				</Button>
				<Avatar className='ml-6 mr-0 hidden rounded-full sm:flex'>
					<AvatarImage src={avatarURL} />
					<AvatarFallback>
						<AvatarIcon className='h-5 w-5' />
					</AvatarFallback>
				</Avatar>
			</div>
		</header>
	)
}
