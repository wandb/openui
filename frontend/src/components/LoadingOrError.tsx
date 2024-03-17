import type { ReactElement } from 'react'

interface Properties {
	error?: Error
}
export default function LoadingOrError({ error }: Properties): ReactElement {
	return (
		<div className='flex min-h-screen items-center justify-center'>
			<h1 className='text-xl' data-testid='LoadingOrError'>
				{error ? (
					error.message
				) : (
					<div className='h-16 w-16 animate-spin rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500' />
				)}
			</h1>
		</div>
	)
}
LoadingOrError.defaultProps = {
	error: undefined
}
