import { useEffect, useMemo } from 'react'
import { useAtom } from 'jotai'
import { useParams } from 'react-router-dom'
import { parseHTML } from '../lib/html'
import { useThrottle, useVersion } from './index'
import {
	ItemWrapper,
	historyAtomFamily,
	uiStateAtom,
	cleanUiState
} from '../state'

export function useUIEngine() {
	const { id } = useParams()
	const [rawItem, setRawItem] = useAtom(historyAtomFamily({ id: id ?? 'new' }))
	const item = useMemo(
		() => new ItemWrapper(rawItem, setRawItem),
		[rawItem, setRawItem]
	)
	const [versionIdx] = useVersion(item)
	const [uiState, setUiState] = useAtom(uiStateAtom)
	const htmlToParse = useThrottle(
		uiState.editedHTML || uiState.pureHTML || '',
		1000
	)

	useEffect(() => {
		if (item.markdown) {
			const html = item.pureHTML(versionIdx)
			const update: { pureHTML: string; error?: string; prompt: string } = {
				pureHTML: html ?? '',
				error: undefined,
				prompt: item.prompt(versionIdx) ?? ''
			}
			if (update.pureHTML === '') {
				update.error = `No HTML in LLM response, received: \n${item.markdown}`
			}
			setUiState({ ...cleanUiState, ...update })
		} else if (id === 'new') {
			setUiState(cleanUiState)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, versionIdx, setUiState])

	useEffect(() => {
		if (htmlToParse) {
			parseHTML(htmlToParse as string, !uiState.rendering)
				.then(html => {
					setUiState(state => ({ ...state, renderedHTML: html }))
				})
				.catch(error => {
					console.error('HTML Parse error', error)
				})
		}
	}, [htmlToParse, uiState.rendering, setUiState])
}
