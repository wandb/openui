import { useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { createOrRefine, type Action, systemPrompt } from '../api/openai'
import {
	screenshotAtom,
	imageDB,
	modelAtom,
	modelSupportsImagesAtom,
	temperatureAtom
} from '../state'
import { useUIActions } from './useUI'

export function useLLM(id: string, versionIdx: number, action: Action) {
	const { updateState, resetIframe } = useUIActions()
	const [screenshot, setScreenshot] = useAtom(screenshotAtom)
	const currentRender = useAtomValue(
		imageDB.item(`screenshot-${id}-${versionIdx}`)
	)
	const setImage = useSetAtom(imageDB.item(`image-${id}-${versionIdx}`))
	const model = useAtomValue(modelAtom)
	const modelSupportsImages = useAtomValue(modelSupportsImagesAtom)
	const temperature = useAtomValue(temperatureAtom)

	const streamResponse = useCallback(
		async (
			query: string,
			existingHTML?: string,
			clearSession = false,
			onData?: (md: string) => void
		) => {
			updateState({ rendering: true, prompt: query })
			resetIframe()
			let imageToUse: string | undefined = screenshot
			if (!modelSupportsImages) {
				imageToUse = undefined
			} else if (currentRender) {
				imageToUse = currentRender.url
			}
			try {
				const final = await createOrRefine(
					{
						query,
						model,
						action,
						systemPrompt,
						html: clearSession ? undefined : existingHTML,
						image: clearSession ? undefined : imageToUse,
						temperature
					},
					md => {
						if (onData) onData(md)
					}
				)
				setScreenshot('')
				updateState({ rendering: false })
				return final
			} catch (err) {
				setScreenshot('')
				updateState({ rendering: false, error: (err as Error).message })
				throw err
			}
		},
		[
			updateState,
			resetIframe,
			screenshot,
			modelSupportsImages,
			currentRender,
			model,
			action,
			temperature,
			setScreenshot
		]
	)

	return { streamResponse, setImage }
}
