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
	)
]

export default handlers
