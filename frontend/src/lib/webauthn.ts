/* This is from an earlier experiment and is not currently being used */

export const encode = (byteArray: ArrayBuffer | Uint8Array) =>
	btoa(
		[...new Uint8Array(byteArray)]
			.map(val => String.fromCodePoint(val))
			.join('')
	)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '')

export const decode = (str: string) =>
	new Uint8Array(
		[...atob(str.replaceAll('_', '/').replaceAll('-', '+'))].map(
			val => val.codePointAt(0) ?? 0
		)
	)

export const random = (size: number) =>
	crypto.getRandomValues(new Uint8Array(size))

let challenge = new Uint8Array()

export const createKey = async (
	userName: string,
	rpName: string,
	requireResidentKey = true,
	timeout?: number
) => {
	challenge = random(32)
	// This where the magic happens, we can use this as a password

	const userId = random(16)
	const credential = await navigator.credentials.create({
		publicKey: {
			challenge,
			rp: {
				name: rpName
			},
			user: {
				id: userId,
				name: userName,
				displayName: userName
			},
			authenticatorSelection: {
				userVerification: 'preferred',
				requireResidentKey
			},
			attestation: 'direct',
			timeout,
			pubKeyCredParams: [
				{
					type: 'public-key',

					alg: -7
				},
				{
					type: 'public-key',

					alg: -257
				}
			]
		}
	})
	if (credential !== null) {
		const res = (credential as PublicKeyCredential)
			.response as AuthenticatorAttestationResponse
		const pub = res.getPublicKey()
		window.localStorage.setItem('credentialID', credential.id)
		window.localStorage.setItem(
			'credentialPublicKey',
			encode(pub ?? new Uint8Array())
		)
	}
	return credential
}

export const publicKey = async () => {
	const pubKey = decode(
		window.localStorage.getItem('credentialPublicKey') ?? ''
	)
	// TODO: might not work in windows
	return crypto.subtle.importKey(
		'spki',
		pubKey,
		{
			name: 'ECDSA',
			namedCurve: 'P-256',
			hash: { name: 'SHA-256' }
		},
		false,
		['verify']
	)
}

export const authenticate = async (id?: string) => {
	const credentialID = id ?? window.localStorage.getItem('credentialID')
	if (credentialID === null) {
		throw new Error('No credential ID found')
	}

	challenge = random(32)
	const credential = await navigator.credentials.get({
		publicKey: {
			challenge,
			allowCredentials: [
				{
					id: decode(credentialID),
					type: 'public-key'
				}
			]
		}
	})
	// TODO: verify the assertion
	if (credential !== null) {
		const cred = credential as PublicKeyCredential
		const { clientDataJSON, authenticatorData, signature, userHandle } =
			cred.response as AuthenticatorAssertionResponse
		const clientDataHash = new Uint8Array(
			await crypto.subtle.digest('SHA-256', clientDataJSON)
		)
		const authData = new Uint8Array(authenticatorData)
		const signedData = new Uint8Array(authData.length + clientDataHash.length)
		signedData.set(authData)
		signedData.set(clientDataHash, authData.length)
		const pubKey = await publicKey()
		const sig = await crypto.subtle.verify(
			{
				name: 'ECDSA',
				hash: 'SHA-256'
			},
			pubKey,
			signature,
			signedData.buffer
		)
		if (sig) {
			console.log('signature is valid')
		} else {
			console.log('signature is invalid')
		}
		if (userHandle !== null) {
			return new Uint8Array(userHandle)
		}
	}
	return credential
}
