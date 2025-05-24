import { atom } from 'jotai'
import type { OpenAI } from 'openai'
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
	// This is the tool calls that get's sent to the iframe for rendering
	toolCalls: Record<
		number,
		OpenAI.Chat.Completions.ChatCompletionMessageToolCall
	>
}

interface BaseEvent {
	action: string
	id: string
}
interface ExecScriptEvent extends BaseEvent {
	action: 'exec-script'
	toolCallId: string
	success: boolean
	description?: string
	error?: string
	stack?: string
	consoleOutput: {
		type: string
		args: unknown[]
	}[]
}

interface ScreenshotEvent extends BaseEvent {
	action: 'screenshot'
	screenshot: string
}

interface CommentEvent extends BaseEvent {
	action: 'comment'
	comment: string
	idx: number
	html: string
}

interface LoadedEvent extends BaseEvent {
	action: 'loaded'
	preview: boolean
	height: number
}

interface ReadyEvent extends BaseEvent {
	action: 'ready'
}

interface EditEvent extends BaseEvent {
	action: 'edit'
	toolCallId: string
	success: boolean
	error?: string
	html: string
	description?: string
	mutationCount?: number
	consoleOutput?: {
		type: string
		args: unknown[]
	}[]
}
export type ToolEvent = ExecScriptEvent | EditEvent
export type IFrameEvent =
	| ExecScriptEvent
	| EditEvent
	| ScreenshotEvent
	| CommentEvent
	| LoadedEvent
	| ReadyEvent
export interface ToolFinishEvent {
	call?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
	result?: ToolEvent
}

export const cleanUiState = {
	prompt: '',
	pureHTML: '',
	annotatedHTML: '',
	editedHTML: '',
	rendering: false,
	error: undefined,
	renderedHTML: undefined,
	toolCalls: {}
}
export const uiStateAtom = atom<CurrentUIState>(cleanUiState)
export const finishedToolCallsAtom = atom<Record<string, ToolFinishEvent>>({})
export const openAIContextAtom =
	atom<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming>()
export class UIState {
	public state: CurrentUIState

	public constructor(state: CurrentUIState) {
		this.state = state
	}
}
