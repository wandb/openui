import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import server from 'mocks/server'
import CopilotDeviceLogin from '../CopilotDeviceLogin'
import type { DeviceAuthStatus } from 'api/copilot'

const pendingStatus: DeviceAuthStatus = {
	state: 'pending',
	message: null,
	verification_uri: 'https://github.com/login/device',
	user_code: 'ABCD-EFGH',
	expires_at: '2099-01-01T00:00:00Z'
}

const authenticatedStatus: DeviceAuthStatus = {
	state: 'authenticated',
	message: null,
	verification_uri: null,
	user_code: null,
	expires_at: null
}

const cancelledStatus: DeviceAuthStatus = {
	state: 'cancelled',
	message: null,
	verification_uri: null,
	user_code: null,
	expires_at: null
}

const expiredStatus: DeviceAuthStatus = {
	state: 'expired',
	message: null,
	verification_uri: null,
	user_code: null,
	expires_at: null
}

const startingStatus: DeviceAuthStatus = {
	state: 'starting',
	message: 'Starting GitHub sign-in...',
	verification_uri: null,
	user_code: null,
	expires_at: null
}

describe('<CopilotDeviceLogin />', () => {
	beforeEach(() => {
		// Only fake setInterval/clearInterval so the component's 2-second poll
		// is controlled by vi.advanceTimersByTimeAsync while userEvent's internal
		// setTimeout-based pointer delays keep using real timers.
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('shows the device code and refreshes models after authentication', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(authenticatedStatus)
			)
		)
		const onAuthenticated = vi.fn()
		render(<CopilotDeviceLogin onAuthenticated={onAuthenticated} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Open GitHub device activation' })
		).toHaveAttribute('href', 'https://github.com/login/device')
		await vi.advanceTimersByTimeAsync(2000)
		await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
	})

	it('keeps polling after a slow "starting" start and later renders the code', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(startingStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(pendingStatus)
			)
		)
		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		// Non-error "starting" message is shown, not the fixed error message.
		expect(
			await screen.findByText('Starting GitHub sign-in...')
		).toBeInTheDocument()
		expect(
			screen.queryByText('GitHub Copilot connection could not be updated.')
		).not.toBeInTheDocument()
		// Polling continues while "starting"; the next poll surfaces the code.
		await vi.advanceTimersByTimeAsync(2000)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()
	})

	it('does not treat "starting" as a terminal error state', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(startingStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(startingStatus)
			)
		)
		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(
			await screen.findByText('Starting GitHub sign-in...')
		).toBeInTheDocument()
		// Still starting after a poll — no error, still no code.
		await vi.advanceTimersByTimeAsync(2000)
		expect(
			screen.queryByText('GitHub Copilot connection could not be updated.')
		).not.toBeInTheDocument()
		expect(screen.getByText('Starting GitHub sign-in...')).toBeInTheDocument()
	})

	it('calls the cancel endpoint when the user cancels', async () => {
		let cancelCalled = false
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(pendingStatus)
			),
			http.post('/v1/copilot/device/cancel', () => {
				cancelCalled = true
				return HttpResponse.json(cancelledStatus)
			})
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
		await waitFor(() => expect(cancelCalled).toBe(true))
		expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument()
	})

	it('stops polling when the dialog close button is clicked', async () => {
		let statusCallCount = 0
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () => {
				statusCallCount++
				return HttpResponse.json(pendingStatus)
			})
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()

		// First poll
		await vi.advanceTimersByTimeAsync(2000)
		await waitFor(() => expect(statusCallCount).toBe(1))

		// Close dialog
		await userEvent.click(screen.getByRole('button', { name: 'Close' }))

		// No more polls after close
		await vi.advanceTimersByTimeAsync(4000)
		expect(statusCallCount).toBe(1)
	})

	it('stops polling on unmount', async () => {
		let statusCallCount = 0
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () => {
				statusCallCount++
				return HttpResponse.json(pendingStatus)
			})
		)

		const { unmount } = render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()

		// First poll
		await vi.advanceTimersByTimeAsync(2000)
		await waitFor(() => expect(statusCallCount).toBe(1))

		unmount()

		// No more polls after unmount
		await vi.advanceTimersByTimeAsync(4000)
		expect(statusCallCount).toBe(1)
	})

	it('shows a fixed error state when the device code expires', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(expiredStatus)
			)
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()

		await vi.advanceTimersByTimeAsync(2000)
		await waitFor(() =>
			expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument()
		)
		expect(
			screen.getByText('GitHub Copilot connection could not be updated.')
		).toBeInTheDocument()
	})

	it('shows a fixed error state for unsupported_storage from start', async () => {
		const unsupportedStatus: DeviceAuthStatus = {
			state: 'unsupported_storage',
			message: 'Raw server storage message',
			verification_uri: null,
			user_code: null,
			expires_at: null
		}
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(unsupportedStatus)
			)
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)

		expect(
			await screen.findByText('GitHub Copilot connection could not be updated.')
		).toBeInTheDocument()
		// Must not reflect raw server message
		expect(
			screen.queryByText('Raw server storage message')
		).not.toBeInTheDocument()
	})

	it('shows a fixed error message when the start request returns non-2xx', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json({ detail: 'raw server error' }, { status: 500 })
			)
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)

		expect(
			await screen.findByText('GitHub Copilot connection could not be updated.')
		).toBeInTheDocument()
		expect(screen.queryByText('raw server error')).not.toBeInTheDocument()
	})

	it('does not poll after reaching a terminal state', async () => {
		let statusCallCount = 0
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () => {
				statusCallCount++
				return HttpResponse.json(cancelledStatus)
			})
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)

		// First poll reaches cancelled → terminal state
		await vi.advanceTimersByTimeAsync(2000)
		await waitFor(() => expect(statusCallCount).toBe(1))

		// Advance again — must NOT trigger a second poll
		await vi.advanceTimersByTimeAsync(4000)
		expect(statusCallCount).toBe(1)
	})

	it('only renders the hardcoded GitHub URL, not an untrusted verification_uri', async () => {
		const maliciousStatus: DeviceAuthStatus = {
			state: 'pending',
			message: null,
			verification_uri: 'https://evil.example.com/device',
			user_code: 'ABCD-EFGH',
			expires_at: '2099-01-01T00:00:00Z'
		}
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(maliciousStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(pendingStatus)
			)
		)

		render(<CopilotDeviceLogin onAuthenticated={vi.fn()} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)

		// Unexpected URI → component replaces device flow with fixed failure state
		expect(
			await screen.findByText('GitHub Copilot connection could not be updated.')
		).toBeInTheDocument()
		// The malicious link must never be rendered
		expect(
			screen.queryByRole('link', { name: 'Open GitHub device activation' })
		).not.toBeInTheDocument()
		expect(
			screen.queryByText('https://evil.example.com/device')
		).not.toBeInTheDocument()
	})

	it('calls onAuthenticated exactly once on success', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(authenticatedStatus)
			)
		)
		const onAuthenticated = vi.fn()
		render(<CopilotDeviceLogin onAuthenticated={onAuthenticated} />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)

		await vi.advanceTimersByTimeAsync(2000)
		await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())

		// Advance more — must not call again
		await vi.advanceTimersByTimeAsync(4000)
		expect(onAuthenticated).toHaveBeenCalledOnce()
	})

	it('in-flight poll resolving after dialog close does not resurrect state or invoke onAuthenticated', async () => {
		// This test exercises the race: the interval fires, the fetch starts
		// (in-flight), the dialog is closed (cleanup: cancelled=true), then the
		// fetch resolves. Without the cancellation flag the resolved .then() would
		// call setStatus(pending) → restart the interval → eventually fire
		// onAuthenticated. With the fix the guard must block all state/callback
		// updates.

		let resolveInFlight!: () => void
		const block = new Promise<void>(resolve => {
			resolveInFlight = resolve
		})

		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json(pendingStatus)
			),
			// Async MSW handler: hangs until resolveInFlight() is called.
			http.get('/v1/copilot/device/status', async () => {
				await block
				return HttpResponse.json(authenticatedStatus)
			})
		)

		const onAuthenticated = vi.fn()
		render(<CopilotDeviceLogin onAuthenticated={onAuthenticated} />)

		await userEvent.click(
			screen.getByRole('button', { name: 'Connect GitHub Copilot' })
		)
		expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument()

		// Synchronously fire the interval so the in-flight fetch starts but
		// stays pending (MSW handler is blocked on `block`).
		vi.advanceTimersByTime(2000)

		// Close the dialog while the fetch is still in-flight.
		// Effect cleanup must run: cancelled = true, clearInterval.
		await userEvent.click(screen.getByRole('button', { name: 'Close' }))
		expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument()

		// Now unblock the fetch — it resolves with authenticatedStatus.
		resolveInFlight()
		// Wait a full event-loop turn so every microtask in the chain settles.
		// setTimeout is NOT faked (only setInterval is), so this is a real delay.
		await new Promise<void>(resolve => {
			setTimeout(resolve, 0)
		})

		// The cancellation guard must have prevented the callback and state update.
		expect(onAuthenticated).not.toHaveBeenCalled()

		// Advancing the clock must not trigger a new poll.
		vi.advanceTimersByTime(4000)
		await new Promise<void>(resolve => {
			setTimeout(resolve, 0)
		})
		expect(onAuthenticated).not.toHaveBeenCalled()
	})
})
