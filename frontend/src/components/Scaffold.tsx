interface ScaffoldProps {
	mode?: 'code' | 'html'
	error?: string
	isLoading: boolean
}

function parseError(error: string) {
	const lines = error.split('\n')
	const [message, details] = [lines[0], lines.slice(1)]
	return [message, details.join('\n')]
}

export default function Scaffold({
	mode = 'html',
	error,
	isLoading = false
}: ScaffoldProps) {
	const animate = isLoading ? 'animate-pulse' : ''
	if (error) {
		const [message, detail] = parseError(error)
		return (
			<div className='mx-auto mt-10 w-full max-w-[80%]'>
				<div className='bg-secondary text-black dark:text-white'>
					<div
						role='alert'
						className='relative mb-2 rounded border-l-4 border-red-500 p-4'
					>
						<strong className='font-bold'>Error! </strong>
						<span className='block sm:inline'>{message}</span>
						{detail !== '' && (
							<p className='mt-4 text-sm text-muted-foreground'>{detail}</p>
						)}
					</div>
				</div>
			</div>
		)
	}
	return (
		<div className='ml-[15%] w-full max-w-[80%]'>
			{' '}
			<div role='status' className={`my-7 ${animate}`}>
				{' '}
				<div className='mb-4 h-2.5 w-[82%] rounded-full bg-zinc-300 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[70%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<span className='sr-only'>Loading...</span>{' '}
			</div>
			{mode === 'html' && (
				<div role='status' className={`mb-7 max-w-[80%] ${animate}`}>
					{' '}
					<div className='flex h-48 w-full items-center justify-center rounded bg-zinc-300 dark:bg-zinc-700'>
						{' '}
						<svg
							className='h-12 w-12 text-gray-200'
							xmlns='http://www.w3.org/2000/svg'
							aria-hidden='true'
							fill='currentColor'
							viewBox='0 0 640 512'
						>
							<path d='M480 80C480 35.82 515.8 0 560 0C604.2 0 640 35.82 640 80C640 124.2 604.2 160 560 160C515.8 160 480 124.2 480 80zM0 456.1C0 445.6 2.964 435.3 8.551 426.4L225.3 81.01C231.9 70.42 243.5 64 256 64C268.5 64 280.1 70.42 286.8 81.01L412.7 281.7L460.9 202.7C464.1 196.1 472.2 192 480 192C487.8 192 495 196.1 499.1 202.7L631.1 419.1C636.9 428.6 640 439.7 640 450.9C640 484.6 612.6 512 578.9 512H55.91C25.03 512 .0006 486.1 .0006 456.1L0 456.1z' />
						</svg>{' '}
					</div>
					<span className='sr-only'>Loading...</span>{' '}
				</div>
			)}
			<div role='status' className={`my-6 ${animate}`}>
				{' '}
				<div className='mb-2.5 h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[82%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<span className='sr-only'>Loading...</span>{' '}
			</div>
			<div role='status' className={`my-6 ${animate}`}>
				{' '}
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[82%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<span className='sr-only'>Loading...</span>{' '}
			</div>
			<div role='status' className={`mb-6 mt-7 ${animate}`}>
				{' '}
				<div className='mb-4 h-2.5 w-[82%] rounded-full bg-zinc-300 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[72%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[80%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<span className='sr-only'>Loading...</span>{' '}
			</div>
			<div role='status' className={`my-6 ${animate}`}>
				{' '}
				<div className='mb-2.5 h-2 max-w-[78%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<div className='mb-2.5 h-2 max-w-[75%] rounded-full bg-zinc-200 dark:bg-zinc-700' />
				<span className='sr-only'>Loading...</span>{' '}
			</div>
		</div>
	)
}
