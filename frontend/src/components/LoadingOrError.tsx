import type { ReactElement } from 'react'

interface Properties {
	error?: Error
}
export default function LoadingOrError({ error }: Properties): ReactElement {
	return (
		<div className='flex min-h-screen flex-col items-center justify-center'>
			<h1 className='text-xl' data-testid='LoadingOrError'>
				{error ? (
					error.message
				) : (
					<div
						role='status'
						className='h-16 w-16 animate-spin rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500'
					/>
				)}
			</h1>
			{error ? (
				<a
					href='/'
					className='mt-5 text-lg text-blue-500 underline'
					onClick={(e: React.SyntheticEvent) => {
						e.preventDefault()
						document.location.reload()
					}}
				>
					Reload
				</a>
			) : undefined}
		</div>
	)
}
