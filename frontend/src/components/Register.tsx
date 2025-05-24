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
import { useSetAtom } from 'jotai'
import Cookies from 'js-cookie'
import { useEffect, useState } from 'react'
import { sessionAtom } from 'state'

export default function Register() {
	const [error, setError] = useState<string | undefined>()
	const [open, setOpen] = useState(false)
	const setSessionData = useSetAtom(sessionAtom)

	useEffect(() => {
		const restoreSession = async () => {
			const session = await getSession()
			// Check if the response was a 404
			if (session === undefined) {
				setSessionData(undefined)
				setOpen(true)
			} else {
				setSessionData(session)
				setOpen(false)
			}
		}
		const errorMessage = Cookies.get('error')
		if (errorMessage) {
			setError(errorMessage)
			Cookies.remove('error')
		}
		restoreSession().catch((error_: unknown) => console.error(error_))
	}, [setSessionData])

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
