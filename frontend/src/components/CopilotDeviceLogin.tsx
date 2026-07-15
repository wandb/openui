import { useState, useEffect, useRef } from 'react'
import {
	cancelDeviceAuth,
	getDeviceAuthStatus,
	startDeviceAuth
} from 'api/copilot'
import type { DeviceAuthStatus } from 'api/copilot'
import { Button } from 'components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle
} from 'components/ui/dialog'

// The only URL we trust from the backend; anything else is a failure state.
const ALLOWED_VERIFICATION_URI = 'https://github.com/login/device'
const FIXED_ERROR_MESSAGE = 'GitHub Copilot connection could not be updated.'
const POLL_INTERVAL_MS = 2000

interface CopilotDeviceLoginProps {
	onAuthenticated: () => void
}

export default function CopilotDeviceLogin({
	onAuthenticated
}: CopilotDeviceLoginProps) {
	const [open, setOpen] = useState(false)
	const [status, setStatus] = useState<DeviceAuthStatus | null>(null)
	const [isStarting, setIsStarting] = useState(false)

	// Keep a stable ref so the polling effect can call the latest callback
	// without re-creating the interval when the prop identity changes.
	const onAuthenticatedRef = useRef(onAuthenticated)
	useEffect(() => {
		onAuthenticatedRef.current = onAuthenticated
	})

	// Run a 2-second poll while the flow is starting or pending.
	// The effect cleanup (return) clears the interval on:
	//   • state transitions to a terminal state / authenticated
	//   • dialog close (setStatus(null) → state becomes undefined)
	//   • unmount
	// The `cancelled` flag is set to true BEFORE clearInterval so any in-flight
	// getDeviceAuthStatus() promise that resolves after cleanup cannot update
	// state, restart the interval, or invoke onAuthenticated.
	useEffect(() => {
		if (status?.state !== 'starting' && status?.state !== 'pending') return

		let cancelled = false

		const id = setInterval(() => {
			void getDeviceAuthStatus()
				.then(newStatus => {
					if (cancelled) return
					setStatus(newStatus)
					if (newStatus.state === 'authenticated') {
						onAuthenticatedRef.current()
						setOpen(false)
					}
				})
				.catch(() => {
					if (cancelled) return
					setStatus({
						state: 'error',
						message: null,
						verification_uri: null,
						user_code: null,
						expires_at: null
					})
				})
		}, POLL_INTERVAL_MS)

		return () => {
			cancelled = true
			clearInterval(id)
		}
	}, [status?.state])

	const handleConnect = async () => {
		setIsStarting(true)
		try {
			const result = await startDeviceAuth()
			// Reject any non-GitHub URL before opening the dialog.
			if (
				result.state === 'pending' &&
				result.verification_uri !== ALLOWED_VERIFICATION_URI
			) {
				setStatus({
					state: 'error',
					message: null,
					verification_uri: null,
					user_code: null,
					expires_at: null
				})
			} else {
				setStatus(result)
			}
			setOpen(true)
		} catch {
			setStatus({
				state: 'error',
				message: null,
				verification_uri: null,
				user_code: null,
				expires_at: null
			})
			setOpen(true)
		} finally {
			setIsStarting(false)
		}
	}

	const handleCancel = async () => {
		// Set to a terminal state immediately so the polling effect clears.
		setStatus({
			state: 'cancelled',
			message: null,
			verification_uri: null,
			user_code: null,
			expires_at: null
		})
		setOpen(false)
		// Best-effort cancel request — result is discarded.
		try {
			await cancelDeviceAuth()
		} catch {
			// ignore
		}
	}

	// Called by Radix when the user closes the dialog via the X button or Escape.
	// Resetting status to null triggers the polling effect's cleanup function.
	const handleOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			setStatus(null)
		}
		setOpen(isOpen)
	}

	const isPending = status?.state === 'pending'
	const isStartingState = status?.state === 'starting'
	const isError =
		status !== null &&
		status.state !== 'starting' &&
		status.state !== 'pending' &&
		status.state !== 'authenticated'

	return (
		<>
			<Button
				type='button'
				onClick={() => void handleConnect()}
				disabled={isStarting}
			>
				Connect GitHub Copilot
			</Button>
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Connect GitHub Copilot</DialogTitle>
						{isPending && (
							<DialogDescription>
								Enter the code below on the GitHub device activation page.
							</DialogDescription>
						)}
					</DialogHeader>

					{isPending && (
						<div className='space-y-4'>
							{/* Code rendered as plain text — never innerHTML */}
							<p className='font-mono text-center text-2xl font-bold tracking-widest'>
								{status.user_code}
							</p>
							{/* Only the hardcoded, trusted GitHub URL is rendered as a link */}
							<a
								href={ALLOWED_VERIFICATION_URI}
								target='_blank'
								rel='noreferrer'
								className='block text-center underline'
							>
								Open GitHub device activation
							</a>
							<div className='flex justify-end'>
								<Button
									type='button'
									variant='secondary'
									onClick={() => void handleCancel()}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}

					{isStartingState && (
						<p className='text-sm text-muted-foreground'>
							Starting GitHub sign-in...
						</p>
					)}

					{isError && (
						<p className='text-sm text-amber-700 dark:text-amber-300'>
							{FIXED_ERROR_MESSAGE}
						</p>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
