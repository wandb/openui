import type { Model } from 'groq-sdk/resources'
import type { ModelResponse } from 'ollama'

export interface Models {
	openai: string[]
	groq: Model[]
	ollama: ModelResponse[]
	litellm: Model[]
}

export async function getModels(): Promise<Models> {
	try {
		const response = await fetch('/v1/models')
		const body = (await response.json()) as { models: Models }
		return body.models
	} catch (error) {
		console.error(error)
		return {
			openai: [],
			groq: [],
			ollama: [],
			litellm: []
		}
	}
}
