import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import type { CurrentUIState } from '../state'
import { uiStateAtom, cleanUiState, iframeResetAtom } from '../state'

export function useUIActions() {
	const setUIState = useSetAtom(uiStateAtom)
	const bumpReset = useSetAtom(iframeResetAtom)

	const updateState = useCallback(
		(update: Partial<CurrentUIState>) => {
			setUIState(prev => ({ ...prev, ...update }))
		},
		[setUIState]
	)

	const resetIframe = useCallback(() => {
		bumpReset(v => v + 1)
	}, [bumpReset])

	const resetUI = useCallback(() => {
		setUIState(cleanUiState)
	}, [setUIState])

	return { updateState, resetIframe, resetUI }
}
