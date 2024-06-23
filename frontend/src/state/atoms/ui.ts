import { atom } from 'jotai'
import type { HTMLAndJS } from 'lib/html'

export interface CurrentUIState {
	// This is the prompt that the user typed in the prompt bar
	prompt: string
	// This should be the HTML we get from parsing our markdown
	pureHTML: string
	// This get's set when a user annotated existing HTML
	annotatedHTML: string
	// This get's set when a user edits the HTML
	editedHTML: string
	// Tells us if we're currently streaming changes in from an LLM
	rendering: boolean
	// If we have an error, we'll show it here
	error?: string
	// This is what get's sent to the iframe for rendering, will have unsplash images
	renderedHTML?: HTMLAndJS
}
export const cleanUiState = {
	prompt: '',
	pureHTML: '',
	annotatedHTML: '',
	editedHTML: '',
	rendering: false,
	error: undefined,
	renderedHTML: undefined
}
export const uiStateAtom = atom<CurrentUIState>(cleanUiState)

export class UIState {
	public state: CurrentUIState

	public constructor(state: CurrentUIState) {
		this.state = state
	}
}
