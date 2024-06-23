import { systemPrompt } from 'api/openai'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

const defaultTemp = 0.3

export const systemPromptAtom = atomWithStorage('systemPrompt', systemPrompt)
export const temperatureAtom = atomWithStorage('temperature', defaultTemp)
export const modelAtom = atomWithStorage('model', 'gpt-3.5-turbo')
export const modelSupportsImagesAtom = atom<boolean>(false)
export const modelSupportsImagesOverridesAtom = atomWithStorage<
	Record<string, boolean | undefined>
>('modelSupportsImagesOverrides', {})
