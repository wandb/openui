import type { ModelResponse } from 'ollama'

// eslint-disable-next-line import/prefer-default-export
export async function getModels(): Promise<ModelResponse[]> {
	try {
		const response = await fetch('/v1/ollama/tags')
		const body = (await response.json()) as { models: ModelResponse[] }
		return body.models
	} catch (error) {
		console.error(error)
		return []
	}
}
