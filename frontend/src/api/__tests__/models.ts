import { http, HttpResponse } from 'msw'
import server from 'mocks/server'
import { findCopilotModel, getModels, supportsImages } from '../models'

const copilot = {
	id: 'copilot/gpt-test',
	name: 'GPT Test',
	capabilities: {
		vision: true,
		supported_media_types: ['image/png'],
		max_prompt_images: 1,
		max_prompt_image_size: 1024
	}
}

describe('Copilot model metadata', () => {
	it('parses the model catalog and uses capability metadata', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					models: {
						openai: [],
						groq: [],
						ollama: [],
						litellm: [],
						copilot: [copilot]
					},
					copilot_status: { state: 'connected', message: null }
				})
			)
		)

		const models = await getModels()

		expect(findCopilotModel(models, copilot.id)).toEqual(copilot)
		expect(supportsImages(models, copilot.id)).toBe(true)
		expect(supportsImages(models, 'copilot/missing')).toBeUndefined()
	})

	it('returns an unavailable status after a non-success response', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({ error: 'offline' }, { status: 503 })
			)
		)

		const models = await getModels()

		expect(models.copilot).toEqual([])
		expect(models.copilotStatus.state).toBe('unavailable')
	})

	it('returns an unavailable status after a catalog network failure', async () => {
		server.use(http.get('/v1/models', () => HttpResponse.error()))

		const models = await getModels()

		expect(models.copilot).toEqual([])
		expect(models.copilotStatus.state).toBe('unavailable')
	})

	it('defaults Copilot fields for a pre-Copilot catalog response', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					models: {
						openai: [],
						groq: [],
						ollama: [],
						litellm: []
					}
				})
			)
		)

		const models = await getModels()

		expect(models.copilot).toEqual([])
		expect(models.copilotStatus).toEqual({
			state: 'disabled',
			message: null,
			authMode: null
		})
	})
})
