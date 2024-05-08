import type { ModelList } from 'groq-sdk/resources'

// eslint-disable-next-line import/prefer-default-export
export async function getGroqModels(): Promise<ModelList> {
	try {
		const response = await fetch('/v1/models?api=groq')
		return await response.json() as ModelList
	} catch (error) {
		console.error(error)
		return []
	}
}
