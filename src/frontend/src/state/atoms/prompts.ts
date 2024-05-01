import { systemPrompt } from 'api/openai'
import { atomWithStorage } from 'jotai/utils'

const defaultTemp = 0.3

export const systemPromptAtom = atomWithStorage('systemPrompt', systemPrompt)
export const temperatureAtom = atomWithStorage('temperature', defaultTemp)
export const modelAtom = atomWithStorage('model', 'gpt-3.5-turbo')
