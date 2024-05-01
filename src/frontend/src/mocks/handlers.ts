import { http, HttpResponse } from 'msw'

const handlers = [
	http.get('https://614c99f03c438c00179faa84.mockapi.io/fruits', () =>
		HttpResponse.json({})
	)
]

export default handlers
