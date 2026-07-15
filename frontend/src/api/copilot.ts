export type DeviceAuthState =
	| 'unauthenticated'
	| 'starting'
	| 'pending'
	| 'authenticated'
	| 'expired'
	| 'cancelled'
	| 'error'
	| 'unsupported_storage'

export interface DeviceAuthStatus {
	state: DeviceAuthState
	message: string | null
	verification_uri: string | null
	user_code: string | null
	expires_at: string | null
}

async function deviceRequest(
	path: 'status' | 'start' | 'cancel',
	method: 'GET' | 'POST'
): Promise<DeviceAuthStatus> {
	const response = await fetch(`/v1/copilot/device/${path}`, {
		method,
		credentials: 'same-origin',
		headers: { Accept: 'application/json' }
	})
	if (!response.ok) {
		throw new Error('GitHub Copilot connection could not be updated.')
	}
	return (await response.json()) as DeviceAuthStatus
}

export function getDeviceAuthStatus(): Promise<DeviceAuthStatus> {
	return deviceRequest('status', 'GET')
}

export function startDeviceAuth(): Promise<DeviceAuthStatus> {
	return deviceRequest('start', 'POST')
}

export function cancelDeviceAuth(): Promise<DeviceAuthStatus> {
	return deviceRequest('cancel', 'POST')
}
