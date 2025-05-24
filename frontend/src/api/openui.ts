import type { HistoryItem, ItemWrapper } from '../state/atoms/history'

export interface SessionData {
	email?: string
	max_tokens?: number
	username?: string
	token_count?: number
}

interface ErrorBody {
	error: {
		code: string
		message: string
	}
}

const API_HOST = (import.meta.env.VITE_API_HOST ?? '/v1') as string

export async function share(id: string, item: ItemWrapper, versionIdx: number) {
	const r = await fetch(`${API_HOST}/share/${id}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			prompt: item.prompt(versionIdx),
			html: item.pureHTML(versionIdx),
			name: item.name,
			emoji: item.emoji
		})
	})
	if (r.status !== 201) {
		const body = (await r.json()) as ErrorBody
		throw new Error(body.error.message)
	}
}

export async function voteRequest(
	vote: boolean,
	item: ItemWrapper,
	versionIdx: number
) {
	const r = await fetch(`${API_HOST}/vote`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			prompt: item.prompt(versionIdx),
			html: item.pureHTML(versionIdx),
			name: item.name,
			emoji: item.emoji,
			vote
		})
	})
	if (r.status !== 201) {
		const body = (await r.json()) as ErrorBody
		throw new Error(body.error.message)
	}
}

export async function getShare(id: string): Promise<HistoryItem> {
	const r = await fetch(`${API_HOST}/share/${id}`)
	if (r.status !== 200) {
		const body = (await r.json()) as ErrorBody
		throw new Error(body.error.message)
	}
	const body = (await r.json()) as HistoryItem
	body.createdAt = new Date()
	return body
}

export async function saveSession(session: SessionData): Promise<void> {
	try {
		await fetch(`${API_HOST}/session`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(session)
		})
	} catch (error) {
		console.error(error)
	}
}

export async function getSession(): Promise<SessionData | undefined> {
	const r = await fetch(`${API_HOST}/session`)

	if (r.status === 404) {
		return
	}

	return (await r.json()) as SessionData
}

const asArrayBuffer = (v: string) =>
	Uint8Array.from(
		atob(v.replaceAll('_', '/').replaceAll('-', '+')),
		c => c.codePointAt(0) ?? 0
	)
const asBase64 = (ab: ArrayBuffer | undefined) =>
	btoa(String.fromCodePoint(...new Uint8Array(ab ?? [])))
		.replaceAll('+', '-')
		.replaceAll('/', '_')

async function getPublicKey(username: string, create = false) {
	const r = await fetch(
		`${API_HOST}/${create ? 'register' : 'auth'}/${encodeURIComponent(
			username
		)}`,
		{
			credentials: 'same-origin'
		}
	)

	if (r.status !== 200) {
		throw new Error(`Unexpected response ${r.status}: ${await r.text()}`)
	}
	if (create) {
		return (await r.json()) as PublicKeyCredentialCreationOptions
	}
	return (await r.json()) as PublicKeyCredentialRequestOptions
}

interface AuthResponse {
	attestationObject?: ArrayBuffer
	clientDataJSON?: ArrayBuffer
	signature?: ArrayBuffer
	authenticatorData?: ArrayBuffer
}

async function post(
	username: string,
	creds: PublicKeyCredential,
	create = false
) {
	const { attestationObject, clientDataJSON, signature, authenticatorData } =
		creds.response as AuthResponse
	const data = {
		id: creds.id,
		raw_id: asBase64(creds.rawId),
		response: {
			attestation_object: asBase64(attestationObject),
			client_data_json: asBase64(clientDataJSON),
			signature: asBase64(signature),
			authenticator_data: asBase64(authenticatorData)
		}
	}
	const req = await fetch(
		`${API_HOST}/${create ? 'register' : 'auth'}/${encodeURIComponent(
			username
		)}`,
		{
			credentials: 'same-origin',
			method: 'POST',
			body: JSON.stringify(data),
			headers: { 'content-type': 'application/json' }
		}
	)

	if (req.status !== 200) {
		throw new Error(`Unexpected response ${req.status}: ${await req.text()}`)
	}
}

export async function register(username: string): Promise<boolean> {
	try {
		const publicKey = (await getPublicKey(
			username,
			true
		)) as PublicKeyCredentialCreationOptions
		console.log('registration response:', publicKey.user, typeof publicKey.user)
		publicKey.user.id = asArrayBuffer(publicKey.user.id as unknown as string)
		publicKey.challenge = asArrayBuffer(
			publicKey.challenge as unknown as string
		)
		const creds = await navigator.credentials.create({ publicKey })
		await post(username, creds as PublicKeyCredential, true)
		return true
	} catch (error) {
		if (error instanceof Error) {
			// TODO: this is hacky but works
			if (error.toString().includes('User already exists')) {
				return false
			}
			throw error
		} else {
			throw new TypeError(`Unkown error: ${String(error)}`)
		}
	}
}

export async function auth(username: string): Promise<boolean> {
	const publicKey = (await getPublicKey(
		username
	)) as PublicKeyCredentialRequestOptions
	console.log('auth get response:', publicKey)
	publicKey.challenge = asArrayBuffer(publicKey.challenge as unknown as string)
	if (
		publicKey.allowCredentials !== undefined &&
		publicKey.allowCredentials.length > 0
	) {
		publicKey.allowCredentials[0].id = asArrayBuffer(
			publicKey.allowCredentials[0].id as unknown as string
		)
		// TODO: if a user attempts to re-register they'll be given the option
		// To scan a QR code to restore if any of the existing credentials don't
		// Still exist.  We may want to add the ability to register multiple passkeys.
		// We might be able to use aaguid to determine machine uniqueness
	}
	let creds
	try {
		creds = await navigator.credentials.get({ publicKey })
	} catch (error) {
		console.error('refused:', error)
		return false
	}
	await post(username, creds as PublicKeyCredential)
	return true
}
