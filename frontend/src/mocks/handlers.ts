import { http, HttpResponse } from 'msw'

const handlers = [
	http.get('/v1/models', () =>
		HttpResponse.json({
			models: {
				openai: [],
				groq: [],
				ollama: [],
				litellm: [],
				copilot: []
			},
			copilot_status: {
				state: 'disabled',
				message: null
			}
		})
	),
	http.get('https://614c99f03c438c00179faa84.mockapi.io/fruits', () =>
		HttpResponse.json({})
	),
	http.get('/v1/copilot/device/status', () =>
		HttpResponse.json({
			state: 'unauthenticated',
			message: null,
			verification_uri: null,
			user_code: null,
			expires_at: null
		})
	),
	http.post('/v1/copilot/device/start', () =>
		HttpResponse.json({
			state: 'unauthenticated',
			message: null,
			verification_uri: null,
			user_code: null,
			expires_at: null
		})
	),
	http.post('/v1/copilot/device/cancel', () =>
		HttpResponse.json({
			state: 'cancelled',
			message: null,
			verification_uri: null,
			user_code: null,
			expires_at: null
		})
	)
]

export default handlers
