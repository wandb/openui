import type { Model } from 'groq-sdk/resources'
import type { ModelResponse } from 'ollama'

export interface CopilotCapabilities {
	vision: boolean
	supported_media_types: string[]
	max_prompt_images: number | null
	max_prompt_image_size: number | null
}

export interface CopilotModel {
	id: string
	name: string
	capabilities: CopilotCapabilities
}

export type CopilotStatusState =
	| 'disabled'
	| 'signed_out'
	| 'connected'
	| 'reauthenticate'
	| 'no_entitlement'
	| 'rate_limited'
	| 'unavailable'

export type CopilotAuthMode = 'oauth' | 'device'

export interface CopilotStatus {
	state: CopilotStatusState
	message: string | null
	authMode: CopilotAuthMode | null
}

export interface Models {
	openai: string[]
	groq: Model[]
	ollama: ModelResponse[]
	litellm: Model[]
	copilot: CopilotModel[]
	copilotStatus: CopilotStatus
}

const unavailableModels = (): Models => ({
	openai: [],
	groq: [],
	ollama: [],
	litellm: [],
	copilot: [],
	copilotStatus: {
		state: 'unavailable',
		message: 'The model catalog is unavailable.',
		authMode: null
	}
})

export function findCopilotModel(
	models: Models,
	modelId: string
): CopilotModel | undefined {
	return models.copilot.find(model => model.id === modelId)
}

export function supportsImages(
	models: Models,
	modelId: string
): boolean | undefined {
	return findCopilotModel(models, modelId)?.capabilities.vision
}

export async function getModels(): Promise<Models> {
	try {
		const response = await fetch('/v1/models')
		if (!response.ok) return unavailableModels()
		const body = (await response.json()) as {
			models: Omit<Models, 'copilotStatus'>
			copilot_status?: {
				state: CopilotStatusState
				message: string | null
				auth_mode?: CopilotAuthMode
			}
		}
		const rawStatus = body.copilot_status
		return {
			...body.models,
			copilot: body.models.copilot ?? [],
			copilotStatus: rawStatus
				? {
						state: rawStatus.state,
						message: rawStatus.message,
						authMode: rawStatus.auth_mode ?? null
					}
				: { state: 'disabled', message: null, authMode: null }
		}
	} catch (error) {
		console.error(error)
		return unavailableModels()
	}
}
