import {
	convert,
	createOrRefine,
	respondToToolCalls,
	systemPrompt,
	type Action
} from 'api/openai'
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip'
import { useThrottle, useVersion } from 'hooks'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { EXAMPLES } from 'lib/constants'
import { newChapter, parseMarkdown } from 'lib/markdown'
import { cn, resizeImage } from 'lib/utils'
import { ArrowUpIcon, ImageIcon, RefreshCwIcon } from 'lucide-react'
import { nanoid } from 'nanoid'
import {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react'
import { Form, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
	ItemWrapper,
	cleanUiState,
	commentsAtom,
	convertFrameworkAtom,
	draggingAtom,
	facetsAtom,
	historyAtomFamily,
	historyIdsAtom,
	historySidebarStateAtom,
	imageDB,
	inspectorEnabledAtom,
	modelAtom,
	modelSupportsImagesAtom,
	screenshotAtom,
	temperatureAtom,
	openAIContextAtom,
	uiStateAtom,
	useSaveHistory,
	type ToolFinishEvent
} from 'state'
import { CurrentUIContext } from './CurrentUiContext'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

// Add fallback uuid generator
function uuidv4() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID()
	}
	// fallback: not RFC4122, but unique enough for session
	return Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
}

export default function Prompt({
	isEditing,
	imageUploadRef
}: {
	isEditing: boolean
	imageUploadRef: React.RefObject<HTMLInputElement>
}) {
	const currentUI = useContext(CurrentUIContext)
	const openAIContext = useAtomValue(openAIContextAtom)
	const setOpenAIContext = useSetAtom(openAIContextAtom)
	const params = useParams()
	const [searchParams, setSearchParams] = useSearchParams()

	const navigation = useNavigate()
	const id = params.id ?? 'new'
	const [item, setItem] = useAtom(historyAtomFamily({ id }))
	const wrappedItem = useMemo(
		() => new ItemWrapper(item, setItem),
		[item, setItem]
	)
	const [versionIdx, updateVersion] = useVersion(wrappedItem)
	const html = wrappedItem.pureHTML(versionIdx)

	const queryRef = useRef<HTMLTextAreaElement>(null)
	const nextExampleRef = useRef<NodeJS.Timeout>()
	const [screenshot, setScreenshot] = useAtom(screenshotAtom)
	const [inspectorEnabled, setInspectorEnabled] = useAtom(inspectorEnabledAtom)
	const [convertFramework, setConvertFramework] = useAtom(convertFrameworkAtom)
	const [sidebarState, setSidebarState] = useAtom(historySidebarStateAtom)
	const modelSupportsImages = useAtomValue(modelSupportsImagesAtom)
	const [comments, setComments] = useAtom(commentsAtom)
	const currentRender = useAtomValue(
		imageDB.item(`screenshot-${id}-${versionIdx}`)
	)
	const setImage = useSetAtom(imageDB.item(`image-${id}-${versionIdx}`))
	const uiState = useAtomValue(uiStateAtom)
	const dragging = useAtomValue(draggingAtom)
	const { rendering, annotatedHTML } = uiState
	const facets = useAtomValue(facetsAtom)

	const model = useAtomValue(modelAtom)
	const temperature = useAtomValue(temperatureAtom)
	const saveHistory = useSaveHistory()
	const [example, setExample] = useState<string>(EXAMPLES[0])
	const [bufferedExample, setBufferedExample] = useState<string>('')
	const setHistoryIds = useSetAtom(historyIdsAtom)
	const [liveMarkdown, setLiveMarkdown] = useState(item.markdown ?? '')
	const throttledMD = useThrottle(liveMarkdown)
	const newComponent = useCallback(
		(prompt: string, clear = true) => {
			// New state management
			const newId = nanoid()
			historyAtomFamily({ id: newId, prompt, createdAt: new Date() })
			setHistoryIds(prev => [newId, ...prev])
			navigation(`/ai/${newId}?gen=1&clear=${clear}`)
		},
		[navigation, setHistoryIds]
	)
	const [isFocused, setIsFocused] = useState(false)
	const [animate, setAnimate] = useState(false)
	const [textareaHeight, setTextareaHeight] = useState<number | undefined>()

	const [sessionUuid, setSessionUuid] = useState<string>('')

	const action: Action = isEditing ? 'refine' : 'create'
	// Save our streamed markdown
	const saveMarkdown = useCallback(
		(final: string) => {
			// The empty markdown check is rather important, without it we get into an
			// Infinite re-render
			if (final.trim() !== '') {
				setItem(it => ({
					...it,
					markdown: (it.markdown ?? '') + final
				}))
				saveHistory()
			}
		},
		[saveHistory, setItem]
	)

	// Continue tool calls when they finish
	useEffect(() => {
		async function continueToolCalls(finishedToolCalls: unknown) {
			if (!openAIContext) return
			const calls = Object.values(
				finishedToolCalls as Record<string, ToolFinishEvent>
			)
			console.log('Continuing tool calls', calls)
			currentUI.emit('ui-state', { rendering: true })
			try {
				const response = await respondToToolCalls(
					openAIContext,
					calls,
					sessionUuid,
					md => setLiveMarkdown(prev => (prev || '') + md)
				)
				setOpenAIContext(openAIContext)
				setLiveMarkdown(response.body)
				currentUI.emit('ui-state', {
					rendering: false,
					toolCalls: response.toolCalls
				})
				saveMarkdown(response.body)
			} catch (error) {
				console.error(error)
				currentUI.emit('ui-state', {
					rendering: false,
					error: (error as Error).message
				})
			}
		}
		currentUI.on('tool-calls-finished', continueToolCalls)
		return () => {
			currentUI.off('tool-calls-finished', continueToolCalls)
		}
	}, [currentUI, openAIContext, sessionUuid, setOpenAIContext, saveMarkdown])

	// UUID state and session logic
	const inactivityTimeout = useRef<NodeJS.Timeout | null>(null)

	// Helper to get/set uuid in sessionStorage
	const getOrCreateUuid = useCallback((id: string) => {
		const key = `uuid-for-${id}`
		let uuid = sessionStorage.getItem(key) || ''
		if (!uuid) {
			uuid = uuidv4()
			sessionStorage.setItem(key, uuid)
		}
		return uuid
	}, [])

	const setNewUuid = useCallback((id: string) => {
		const key = `uuid-for-${id}`
		const uuid = uuidv4()
		sessionStorage.setItem(key, uuid)
		setSessionUuid(uuid)
	}, [])

	// Reset inactivity timer
	const resetInactivityTimer = useCallback(() => {
		if (inactivityTimeout.current) {
			clearTimeout(inactivityTimeout.current)
		}
		inactivityTimeout.current = setTimeout(
			() => {
				setNewUuid(id)
			},
			30 * 60 * 1000
		) // 30 minutes
	}, [id, setNewUuid])

	// Setup listeners for activity and id changes
	useEffect(() => {
		// On mount or id change, get or create uuid
		const uuid = getOrCreateUuid(id)
		setSessionUuid(uuid || '')
		resetInactivityTimer()

		const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart']
		const handleActivity = () => {
			resetInactivityTimer()
		}
		activityEvents.forEach(event => {
			window.addEventListener(event, handleActivity)
		})

		return () => {
			if (inactivityTimeout.current) {
				clearTimeout(inactivityTimeout.current)
			}
			activityEvents.forEach(event => {
				window.removeEventListener(event, handleActivity)
			})
		}
	}, [id, getOrCreateUuid, resetInactivityTimer])

	const streamResponse = useCallback(
		(query: string, existingHTML?: string, clearSession = false) => {
			console.log('STREAMING RESPONSE:', query)
			if (query === '') {
				console.warn('No query, skipping, something is very wrong')
				return
			}
			// Reset our search params to ensure we're at a new version
			setSearchParams(new URLSearchParams(), {
				preventScrollReset: true,
				replace: true
			})
			updateVersion(-1)
			currentUI.emit('ui-state', {
				...(existingHTML ? {} : cleanUiState),
				rendering: true,
				prompt: query
			})
			// Removing for now to show our new tool based updates
			// currentUI.emit('iframe-reset', {})
			let imageToUse: string | undefined = screenshot
			if (!modelSupportsImages) {
				imageToUse = undefined
			} else if (currentRender) {
				imageToUse = currentRender.url
			}
			createOrRefine(
				{
					query,
					model,
					action,
					systemPrompt,
					html: clearSession ? undefined : existingHTML,
					image: clearSession ? undefined : imageToUse,
					temperature,
					iframeId: id,
					sessionId: sessionUuid
				},
				md => {
					setLiveMarkdown(prevMD => (prevMD || '') + md)
				},
				setOpenAIContext
			)
				.then(response => {
					setScreenshot('')
					setLiveMarkdown(response.body)
					currentUI.emit('ui-state', {
						rendering: false,
						toolCalls: response.toolCalls
					})
					// TODO: make sure unsplash runs here
					console.log('Rendering complete, saving markdown')
					saveMarkdown(response.body)
					if (queryRef.current) {
						queryRef.current.value = ''
					}
					// SetLLMHidden(true)
				})
				.catch((error: unknown) => {
					setScreenshot('')
					setLiveMarkdown('')
					console.error(error)
					let { message } = error as Error
					// Ollama vision error
					if (
						message.includes('Object of type bytes is not JSON serializable')
					) {
						message =
							'OpenUI currently only supports llava or moondream vision models from Ollama'
					}
					currentUI.emit('ui-state', {
						rendering: false,
						error: message
					})
				})
		},
		[
			setSearchParams,
			updateVersion,
			currentUI,
			screenshot,
			modelSupportsImages,
			currentRender,
			model,
			action,
			temperature,
			setScreenshot,
			saveMarkdown,
			setOpenAIContext,
			id,
			sessionUuid
		]
	)

	const randomExample = useCallback((existingExample: string) => {
		let ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]
		while (ex === existingExample) {
			ex = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]
		}
		setExample(ex)
		setBufferedExample(ex.slice(0, 1))
	}, [])

	// This effect is called when rendering a new component.
	// CAUTION: mucking with the deps here is a recipe for disaster,
	// We don't want this getting called twice in fast succession
	useEffect(() => {
		// TODO: not sure if we want this searchParam trash
		const clear = searchParams.get('clear') === 'true'
		const gen = searchParams.get('gen') === '1'
		if (id !== 'new' && gen && !rendering) {
			streamResponse(item.prompt, undefined, clear)
		} else if (id === 'new') {
			// Reset our examples
			randomExample(example)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item.prompt, id])

	useEffect(() => {
		if (searchParams.get('regen') === '1') {
			setLiveMarkdown('')
			let { prompt } = item
			const useMore = facets.length !== 1 || !facets.some(f => f.endsWith('er'))
			prompt = `Let's make this ${useMore && 'more'} ${facets.length > 0 ? facets.sort().join(' and ') : 'interesting'}.`
			// TODO: ripe for prompt engineering!
			setItem(it => ({
				...it,
				markdown: it.markdown + newChapter(prompt)
			}))
			saveHistory()
			streamResponse(prompt, wrappedItem.pureHTML(versionIdx))
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams.get('regen')])

	useEffect(() => {
		setIsFocused(dragging)
	}, [dragging])

	// Throttled updates of HTML when liveMarkdown changes
	useEffect(() => {
		try {
			if (!liveMarkdown || params.id === 'new') {
				return
			}
			// TODO: maybe pass down html and skip parsing?
			// We pop the last line to avoid re-rendering long lines
			let md = liveMarkdown
			if (rendering) {
				md = liveMarkdown.split('\n').slice(0, -1).join('\n')
			}
			// TODO: could memoize this
			const result = parseMarkdown(md, undefined, rendering)
			if (result.html) {
				// TODO: this is getting called three times on render, refactor
				setItem(it => ({ ...it, ...result }))
				currentUI.emit('ui-state', {
					pureHTML: result.html,
					rendering,
					error: undefined
				})
			} else if (!rendering) {
				console.log('No HTML state emitted')
				currentUI.emit('ui-state', {
					rendering: false,
					error: `No HTML in LLM response, received: \n${liveMarkdown}`
				})
			}
		} catch (error) {
			setItem(it => ({ ...it, name: 'Error' }))
			currentUI.emit('ui-state', {
				rendering: false,
				error: 'Error parsing response, see console.'
			})
			console.error(error)
		}
		// We only key off throttledMD while referencing markdown
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [throttledMD])

	const onSubmit = useCallback(
		(e: React.FormEvent | React.KeyboardEvent) => {
			if (sidebarState === 'history') {
				setSidebarState('closed')
			}
			setLiveMarkdown('')
			e.preventDefault()

			let query = queryRef.current?.value.trim() ?? ''
			if (screenshot === '' && query === '') {
				query = example
			}
			if (screenshot === '' && query === '') {
				return
			}

			if (action === 'create') {
				// Keep the screenshot
				// SaveMarkdown('')
				newComponent(query, screenshot === '')
				return
			}
			// SetMarkdown('')
			// TODO: save screenshots
			setItem(it => ({
				...it,
				markdown: it.markdown + newChapter(query),
				prompts: [...(it.prompts ?? [it.prompt]), query]
			}))
			saveHistory()
			streamResponse(query, html)
		},
		[
			action,
			example,
			html,
			newComponent,
			screenshot,
			setItem,
			saveHistory,
			streamResponse,
			setSidebarState,
			sidebarState
		]
	)

	// Convert HTML to a framework
	useEffect(() => {
		if (!convertFramework) {
			return
		}
		const toFramework = convertFramework
		setConvertFramework(undefined)
		currentUI.emit('ui-state', { rendering: true, error: undefined })
		const curComponents = item.components ?? {}
		convert(
			{
				model,
				framework: toFramework,
				html: html ?? '',
				temperature
			},
			md => {
				setItem(it => {
					if (curComponents[toFramework] === undefined) {
						curComponents[toFramework] = ''
					}
					curComponents[toFramework] += md
					return { ...it, components: { ...curComponents } }
				})
			}
		)
			.then(() => {
				saveHistory()
				currentUI.emit('ui-state', { rendering: false })
			})
			.catch((error: unknown) => {
				console.error(error)
				currentUI.emit('ui-state', {
					rendering: false,
					error: (error as Error).message
				})
			})
	}, [
		convertFramework,
		setItem,
		saveHistory,
		setConvertFramework,
		item.components,
		html,
		model,
		temperature,
		currentUI
	])

	// Auto submit for annotations
	useEffect(() => {
		// TODO: get rid of unsplash here
		if (annotatedHTML !== '') {
			setItem(it => ({
				...it,
				markdown:
					it.markdown + newChapter(comments.at(-1) ?? 'Edit from comment')
			}))
			setComments([])
			streamResponse('', annotatedHTML)
		}
	}, [annotatedHTML, comments, setComments, setItem, streamResponse])

	// Random example on mount
	useEffect(() => {
		randomExample('')
		if (document.activeElement === queryRef.current) {
			setIsFocused(true)
		}
	}, [randomExample])

	// New random example in 10 seconds
	useEffect(() => {
		if (isEditing) {
			clearTimeout(nextExampleRef.current)
		} else if (queryRef.current?.value === '') {
			nextExampleRef.current = setTimeout(() => {
				setTextareaHeight(undefined)
				randomExample(example)
			}, 10_000)
			setAnimate(true)
			setTimeout(() => setAnimate(false), 1000)
		}
		return () => clearTimeout(nextExampleRef.current)
	}, [randomExample, example, isEditing])

	useEffect(() => {
		if (isEditing) {
			setTextareaHeight(undefined)
			return
		}
		if (bufferedExample.length < example.length) {
			const minTime = 5
			const maxTime = 80
			const randomTime =
				Math.floor(Math.random() ** 2 * (maxTime - minTime + 1)) + minTime
			setTimeout(
				() => setBufferedExample(prev => example.slice(0, prev.length + 1)),
				randomTime
			)
			const { scrollHeight, clientHeight } = queryRef.current ?? {
				scrollHeight: 0,
				clientHeight: 0
			}
			if (scrollHeight > clientHeight) {
				setTextareaHeight(scrollHeight)
			} else if (scrollHeight !== clientHeight) {
				setTextareaHeight(undefined)
			}
		}
	}, [example, bufferedExample, isEditing])

	return (
		<div
			id='llm-input'
			className={cn(
				`bg-muted z-0 mx-auto my-4 flex w-full max-w-full justify-center rounded-full px-4 py-3 align-middle transition-all md:w-full lg:w-10/12`,
				isFocused ? 'border-primary dark:bg-muted border-2 bg-white' : ''
			)}
		>
			<Form
				onSubmit={onSubmit}
				className={cn(
					'flex min-h-16 w-full items-center justify-center',
					isEditing ? 'min-h-8' : ''
				)}
			>
				<input
					ref={imageUploadRef}
					id='file-input'
					type='file'
					className='hidden'
					accept='image/*'
					onChange={e => {
						const file = e.target.files?.[0] ?? undefined
						if (file === undefined) {
							return
						}
						const reader = new FileReader()
						reader.addEventListener('load', () => {
							resizeImage(reader.result as string, 1024).then(
								img => {
									setScreenshot(img.url)
									setImage(img).catch(() => {
										console.error('Failed to set image')
									})
								},
								() => console.error('Resize failed')
							)
						})
						reader.readAsDataURL(file)
					}}
				/>
				{!isEditing && (
					<Button
						className='mx-4 h-6 w-6 flex-none rounded-full border-none bg-transparent'
						variant='outline'
						size='icon'
						type='button'
						onClick={() => {
							clearTimeout(nextExampleRef.current)
							randomExample(example)
						}}
					>
						<RefreshCwIcon
							strokeWidth='1'
							className={`${animate ? 'animate-rotate-180' : ''} h-5 w-5`}
						/>
					</Button>
				)}
				<Textarea
					name='query'
					rows={Math.floor(textareaHeight ? textareaHeight / 33 : 1)}
					className={
						/* TODO: make this width calculation dynamic */
						cn(
							'my-auto max-h-[130px] flex-1 resize-none items-center justify-center overflow-y-hidden rounded-none align-middle !text-lg placeholder:text-lg',
							'bg-muted dark:focus-visible:bg-muted border-none ring-0 outline-hidden transition-all focus-visible:bg-white focus-visible:ring-0 focus-visible:ring-offset-0'
						)
					}
					style={{
						height: textareaHeight ? `${textareaHeight}px` : undefined
					}}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
						const { scrollHeight, clientHeight, value } = e.target
						if (scrollHeight > clientHeight) {
							setTextareaHeight(scrollHeight)
						} else if (scrollHeight !== clientHeight) {
							setTextareaHeight(undefined)
						}
						if (value === '') {
							randomExample(example)
						} else {
							clearTimeout(nextExampleRef.current)
							if (value.length === 1) {
								setTextareaHeight(undefined)
							}
						}
					}}
					onFocus={() => {
						setIsFocused(true)
					}}
					onBlur={() => {
						setIsFocused(false)
					}}
					placeholder={
						isEditing
							? 'Ask for changes to the current UI'
							: screenshot
								? 'Describe the screenshot you uploaded (Optional)'
								: bufferedExample
					}
					ref={queryRef}
					onKeyDown={(e: React.KeyboardEvent) => {
						if (e.key === 'Enter') {
							onSubmit(e)
							e.preventDefault()
						}
					}}
				/>
				<div className='flex items-center'>
					{isEditing && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => {
										// TODO: likely sync the state
										setInspectorEnabled(!inspectorEnabled)
									}}
									size='icon'
									variant='ghost'
									type='button'
									className={cn(
										'h-8 w-8 flex-none bg-transparent',
										inspectorEnabled
											? 'border-primary rounded-full border-1 text-white'
											: ''
									)}
								>
									<svg
										className='h-5 w-5'
										width='24'
										height='24'
										viewBox='0 0 24 24'
										strokeWidth={1}
										fill='none'
										xmlns='http://www.w3.org/2000/svg'
									>
										<path
											fillRule='evenodd'
											clipRule='evenodd'
											d='M2.89661 3.15265C2.83907 2.99331 2.99331 2.83907 3.15265 2.89661L21.5721 9.5481C22.0611 9.72467 22.1094 10.3972 21.6507 10.6418L14.7396 14.3278C14.5645 14.4212 14.4212 14.5645 14.3278 14.7396L10.6418 21.6507C10.3972 22.1094 9.72467 22.0611 9.5481 21.5722L2.89661 3.15265ZM5.24811 5.24811L10.2712 19.1582L13.2191 13.6309C13.3125 13.4558 13.4558 13.3125 13.6309 13.2191L19.1582 10.2712L5.24811 5.24811Z'
											fill='currentColor'
										/>
									</svg>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Select elements in the HTML</TooltipContent>
						</Tooltip>
					)}
					{modelSupportsImages && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									className='mr-2 h-8 w-8 flex-none rounded-full border-none bg-transparent'
									variant='outline'
									size='icon'
									type='button'
									onClick={() => imageUploadRef.current?.click()}
								>
									<ImageIcon strokeWidth={1} className='h-5 w-5' />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								Upload a screenshot of a web page you want to replicate
							</TooltipContent>
						</Tooltip>
					)}
					{rendering ? (
						<div className='rendering h-8 w-8 flex-none animate-spin rounded-full bg-linear-to-r from-purple-500 via-pink-500 to-red-500' />
					) : (
						<Button
							className={cn(
								'bg-muted hover:bg-primary mr-4 h-8 w-8 flex-none rounded-full border-none hover:text-white',
								isFocused
									? 'border-primary bg-primary/20 text-primary border-1'
									: ''
							)}
							variant='outline'
							size='icon'
							type='submit'
						>
							<ArrowUpIcon strokeWidth={2} className='h-5 w-5' />
						</Button>
					)}
				</div>
			</Form>
		</div>
	)
}
