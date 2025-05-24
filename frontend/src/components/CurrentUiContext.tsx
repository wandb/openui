import { useThrottle, useVersion } from 'hooks'
import { useAtom } from 'jotai'
import eventEmitter, { type EventTarget } from 'lib/events'
import { parseHTML, type HTMLAndJS } from 'lib/html'
import type React from 'react'
import { createContext, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
	ItemWrapper,
	cleanUiState,
	historyAtomFamily,
	uiStateAtom
} from 'state'

const CurrentUIContext = createContext<EventTarget>(eventEmitter)

export const CurrentUIProvider = ({
	children
}: {
	children: React.ReactNode
}) => {
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

	// Reset our UI state when the id changes, then parse our pureHTML
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
		// We only want to trigger this when our ID or version changes, item will be updated
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, versionIdx, setUiState])

	// Parse our HTML at most once per second
	useEffect(() => {
		if (htmlToParse) {
			// Only process images when we aren't rendering
			parseHTML(htmlToParse as string, !uiState.rendering)
				.then((html): void => {
					setUiState(state => ({ ...state, renderedHTML: html }))
					// Push our state out
					eventEmitter.emit(`html-updated:${id}`, html)
				})
				.catch((error: unknown) => {
					console.error('HTML Parse error', error)
				})
		}
		// We don't include `id` because it causes us to reset state on a new page
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [htmlToParse, uiState.rendering, setUiState])

	// To simplify modifying state and propagating changes to the UI
	// We do it all with this the event emitter.  One day we could switch
	// To an actual reducer...
	useEffect(() => {
		const uiStateHandler = (ev: unknown) => {
			const event = ev as {
				annotatedHTML?: string
				editedHTML?: string
				pureHTML?: string
				rendering?: boolean
				renderedHTML?: HTMLAndJS
			}
			// TODO: we might want to refactor this
			if (event.annotatedHTML) {
				parseHTML(event.annotatedHTML, false)
					.then(html => {
						setUiState(state => ({ ...state, annotatedHTML: html.html }))
					})
					.catch((error: unknown) => {
						console.error('HTML Parse error', error)
					})
			} else {
				setUiState(state => ({
					...state,
					...event
				}))
			}
		}
		eventEmitter.on('ui-state', uiStateHandler)

		return () => {
			eventEmitter.off('ui-state', uiStateHandler)
		}
	}, [setUiState])

	return (
		<CurrentUIContext.Provider value={eventEmitter}>
			{children}
		</CurrentUIContext.Provider>
	)
}

export default CurrentUIContext
