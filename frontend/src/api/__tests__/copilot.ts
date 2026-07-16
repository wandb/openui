import { http, HttpResponse } from 'msw'
import server from 'mocks/server'
import {
	type DeviceAuthStatus,
	getDeviceAuthStatus,
	startDeviceAuth,
	cancelDeviceAuth
} from '../copilot'

const pendingStatus: DeviceAuthStatus = {
	state: 'pending',
	message: null,
	verification_uri: 'https://github.com/login/device',
	user_code: 'ABCD-EFGH',
	expires_at: '2099-01-01T00:00:00Z'
}

const cancelledStatus: DeviceAuthStatus = {
	state: 'cancelled',
	message: null,
	verification_uri: null,
	user_code: null,
	expires_at: null
}

const authenticatedStatus: DeviceAuthStatus = {
	state: 'authenticated',
	message: null,
	verification_uri: null,
	user_code: null,
	expires_at: null
}

describe('Device Auth API', () => {
	it('getDeviceAuthStatus sends GET with same-origin credentials', async () => {
		let captured: Request | undefined
		server.use(
			http.get('/v1/copilot/device/status', ({ request }) => {
				captured = request
				return HttpResponse.json(pendingStatus)
			})
		)
		const result = await getDeviceAuthStatus()
		expect(captured?.method).toBe('GET')
		expect(captured?.credentials).toBe('same-origin')
		expect(result).toEqual(pendingStatus)
	})

	it('startDeviceAuth sends POST with same-origin credentials', async () => {
		let captured: Request | undefined
		server.use(
			http.post('/v1/copilot/device/start', ({ request }) => {
				captured = request
				return HttpResponse.json(pendingStatus)
			})
		)
		const result = await startDeviceAuth()
		expect(captured?.method).toBe('POST')
		expect(captured?.credentials).toBe('same-origin')
		expect(result).toEqual(pendingStatus)
	})

	it('cancelDeviceAuth sends POST with same-origin credentials', async () => {
		let captured: Request | undefined
		server.use(
			http.post('/v1/copilot/device/cancel', ({ request }) => {
				captured = request
				return HttpResponse.json(cancelledStatus)
			})
		)
		const result = await cancelDeviceAuth()
		expect(captured?.method).toBe('POST')
		expect(captured?.credentials).toBe('same-origin')
		expect(result).toEqual(cancelledStatus)
	})

	it('getDeviceAuthStatus throws a fixed error on non-2xx (no body reflection)', async () => {
		server.use(
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json({ detail: 'secret upstream error' }, { status: 500 })
			)
		)
		await expect(getDeviceAuthStatus()).rejects.toThrow(
			'GitHub Copilot connection could not be updated.'
		)
	})

	it('startDeviceAuth throws a fixed error on non-2xx (no body reflection)', async () => {
		server.use(
			http.post('/v1/copilot/device/start', () =>
				HttpResponse.json({ detail: 'secret upstream error' }, { status: 503 })
			)
		)
		await expect(startDeviceAuth()).rejects.toThrow(
			'GitHub Copilot connection could not be updated.'
		)
	})

	it('cancelDeviceAuth throws a fixed error on non-2xx (no body reflection)', async () => {
		server.use(
			http.post('/v1/copilot/device/cancel', () =>
				HttpResponse.json({ detail: 'secret upstream error' }, { status: 500 })
			)
		)
		await expect(cancelDeviceAuth()).rejects.toThrow(
			'GitHub Copilot connection could not be updated.'
		)
	})

	it('returns correctly typed DeviceAuthStatus fields on success', async () => {
		server.use(
			http.get('/v1/copilot/device/status', () =>
				HttpResponse.json(authenticatedStatus)
			)
		)
		const result = await getDeviceAuthStatus()
		expect(result.state).toBe('authenticated')
		expect(result.verification_uri).toBeNull()
		expect(result.user_code).toBeNull()
		expect(result.expires_at).toBeNull()
		expect(result.message).toBeNull()
	})
})
