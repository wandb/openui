import { auth, getSession, register } from 'api/openui'
import { Button } from 'components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from 'components/ui/dialog'
import { Input } from 'components/ui/input'
import { Label } from 'components/ui/label'
import { useEffect, useState } from 'react'

// eslint-disable-next-line import/prefer-default-export
export default function Register() {
	const [username, setUsername] = useState('')
	const [error, setError] = useState<string | undefined>()
	const [open, setOpen] = useState(false)
	const [registered, setRegistered] = useState(false)

	useEffect(() => {
		if (localStorage.getItem('username')) {
			setUsername(localStorage.getItem('username') as string)
			setRegistered(true)
		}
		const restoreSession = async () => {
			const session = await getSession()
			// check if the response was a 404
			if (session === undefined) {
				setOpen(true)
			} else {
				setOpen(false)
			}
		}
		restoreSession().catch(error_ => console.error(error_))
	}, [])

	const performAuth = async (uname: string) => {
		const success = await auth(uname)
		if (success) {
			localStorage.setItem('username', uname)
			setOpen(false)
		} else {
			setError('Authentication failed, refresh the page or try again.')
		}
	}

	const performRegistration = async (uname: string) => {
		const success = await register(username)
		if (success) {
			localStorage.setItem('username', uname)
			await performAuth(username)
		} else {
			setError(
				"Account already exists, if you haven't registered before refresh this page and choose a new username."
			)
			setRegistered(true)
		}
	}

	const title = registered ? 'Login' : 'Register'

	return (
		<Dialog
			open={open}
			onOpenChange={(op: boolean) => {
				// TODO: should reload the page when in mid-registration
				console.log(op)
			}}
		>
			<DialogContent className='sm:max-w-[425px]'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{error ? (
						<DialogDescription className='mb-2 text-red-500 dark:text-red-400'>
							{error}
						</DialogDescription>
					) : (
						<DialogDescription>
							{registered
								? 'Start a new session'
								: 'To enforce usage quotas an account is required.'}
						</DialogDescription>
					)}
				</DialogHeader>
				<div className='grid gap-4 py-4'>
					<div className='grid grid-cols-4 items-center gap-4'>
						<Label htmlFor='username' className='text-right'>
							Username
						</Label>
						<Input
							id='username'
							value={username}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setUsername(e.target.value)
							}
							className='col-span-3'
						/>
					</div>
				</div>
				<DialogFooter>
					{registered ? (
						<Button
							variant='link'
							onClick={() => {
								localStorage.removeItem('username')
								setRegistered(false)
							}}
						>
							Register
						</Button>
					) : undefined}
					<Button
						type='submit'
						onClick={() => {
							// eslint-disable-next-line @typescript-eslint/no-magic-numbers
							if (username.length < 3) {
								setError('Username must be atleast 3 characters')
								return
							}
							;(async () =>
								registered
									? performAuth(username)
									: performRegistration(username))().catch((error_: Error) => {
								console.log('Error during registration', error)
								setError(error_.toString())
							})
						}}
					>
						{title}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
