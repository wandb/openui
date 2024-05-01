import { GitHubLogoIcon } from '@radix-ui/react-icons'
import { getSession } from 'api/openui'
import { Button } from 'components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from 'components/ui/dialog'
import Cookies from 'js-cookie'
import { useEffect, useState } from 'react'

// eslint-disable-next-line import/prefer-default-export
export default function Register() {
	const [error, setError] = useState<string | undefined>()
	const [open, setOpen] = useState(false)

	useEffect(() => {
		const restoreSession = async () => {
			const session = await getSession()
			// check if the response was a 404
			if (session === undefined) {
				setOpen(true)
			} else {
				setOpen(false)
			}
		}
		const errorMessage = Cookies.get('error')
		if (errorMessage) {
			setError(errorMessage)
			Cookies.remove('error')
		}
		restoreSession().catch(error_ => console.error(error_))
	}, [])

	const title = 'Login'

	return (
		<Dialog
			open={open}
			onOpenChange={(op: boolean) => {
				// TODO: should reload the page when in mid-registration
				console.log(op)
			}}
		>
			<DialogContent noClose className='sm:max-w-[425px]'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{error ? (
						<DialogDescription className='mb-2 text-red-500 dark:text-red-400'>
							{error}
						</DialogDescription>
					) : (
						<DialogDescription>
							To enforce usage quotas an account is required.
						</DialogDescription>
					)}
				</DialogHeader>
				<div className='items-center'>
					<Button asChild>
						<a href='/v1/login'>
							<GitHubLogoIcon className='mr-2' /> Login with GitHub
						</a>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
