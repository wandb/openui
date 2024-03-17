import {
	DoubleArrowDownIcon,
	DoubleArrowUpIcon,
	PlayIcon,
	ResumeIcon
} from '@radix-ui/react-icons'
import { convert, createOrRefine } from 'api/openai'
import CodeViewer from 'components/CodeViewer'
import Examples from 'components/Examples'
import HTMLAnnotator, { type Script } from 'components/HtmlAnnotator'
import { Button } from 'components/ui/button'
import { Textarea } from 'components/ui/textarea'
import { useMediaQuery, useThrottle } from 'hooks'
import { useAtom, useAtomValue } from 'jotai'
import { parseMarkdown } from 'lib/markdown'
import { MOBILE_WIDTH, cn } from 'lib/utils'

import { nanoid } from 'nanoid'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
	annotatedHTMLAtom,
	commentsAtom,
	convertFrameworkAtom,
	historyAtomFamily,
	historyIdsAtom,
	modelAtom,
	screenshotAtom,
	systemPromptAtom,
	temperatureAtom,
	useSaveHistory
} from 'state'

function fixHTML(html: string) {
	/* replace any gray styles with zinc, fix placeholder images */
	let fixed = html.replaceAll('-gray-', '-zinc-')
	fixed = fixed.replaceAll('via.placeholder.com', 'placehold.co')
	return fixed
}

function removeCommentNodes(element: HTMLElement) {
	try {
		// Get all child nodes of the current element
		const { childNodes } = element

		// eslint-disable-next-line @typescript-eslint/no-magic-numbers
		for (let i = childNodes.length - 1; i >= 0; i -= 1) {
			const child = childNodes[i]

			// If the child is a comment node, remove it
			if (child.nodeType === Node.COMMENT_NODE) {
				child.remove()
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				// If the child is an element node, search for comment nodes in its children
				removeCommentNodes(child as HTMLElement)
			}
		}
	} catch (error) {
		console.error(error)
	}
}

function newChapter(prompt: string) {
	return `\n\n---\nprompt: ${prompt}\n---\n\n`
}

export default function Builder() {
	// Global state
	const params = useParams()
	const [searchParams, setSearchParams] = useSearchParams()
	const navigation = useNavigate()
	const id = params.id ?? 'new'
	const [historyIds, setHistoryIds] = useAtom(historyIdsAtom)
	const [lastIds, setLastIds] = useState(historyIds)
	const [item, setItem] = useAtom(historyAtomFamily({ id }))
	const [annotatedHTML, setAnnotatedHTML] = useAtom(annotatedHTMLAtom)
	const [comments, setComments] = useAtom(commentsAtom)
	const [screenshot, setScreenshot] = useAtom(screenshotAtom)
	// const editedHTML = useAtomValue(editedHTMLAtom)
	const [convertFramework, setConvertFramework] = useAtom(convertFrameworkAtom)
	const saveHistory = useSaveHistory()
	const model = useAtomValue(modelAtom)
	const temperature = useAtomValue(temperatureAtom)
	const systemPrompt = useAtomValue(systemPromptAtom)

	const imageFileRef = useRef<HTMLInputElement>(null)
	const queryRef = useRef<HTMLTextAreaElement>(null)
	const formRef = useRef<HTMLFormElement>(null)
	// TODO: this is rather hacky to support history
	const curMarkdown = (item.markdown ?? '').split(/---\nprompt:.+\n---/gm).pop()
	const [markdown, setMarkdown] = useState<string>(curMarkdown ?? '')

	// Local state
	const [pendingScreenshot, setPendingScreenshot] = useState<
		string | undefined
	>()
	const [pureHTML, setPureHTML] = useState<string>('')
	const [renderError, setRenderError] = useState<string | undefined>()
	const [js, setJs] = useState<Script[]>([])
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [imageEl, setImageEl] = useState<HTMLImageElement | undefined>()
	const [editing, setEditing] = useState<boolean>(markdown !== '')
	const [rendering, setRendering] = useState<boolean>(false)
	const [llmHidden, setLLMHidden] = useState<boolean>(markdown !== '')
	// TODO: likely replace with item.components
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [jsx, setJSX] = useState<string>('')
	const throttledMD = useThrottle(markdown)
	const bigEnough = useMediaQuery(`(min-width: ${MOBILE_WIDTH}px)`)

	// Update terminal state
	useEffect(() => {
		/* saveSession({
			html: pureHTML,
			name: `${item.emoji} ${item.name}`,
			markdown: item.markdown
		}).catch(error => console.error(error)) */
	}, [pureHTML, item])

	// persist deleted history TODO: move me somewhere better
	useEffect(() => {
		if (lastIds.length !== historyIds.length) {
			saveHistory()
			setLastIds(historyIds)
		}
	}, [historyIds, lastIds.length, saveHistory])

	// editing
	useEffect(() => {
		setEditing((markdown || '').trim() !== '')
	}, [markdown])

	// page nav
	useEffect(() => {
		if (params.id === 'new') {
			setRenderError(undefined)
			setAnnotatedHTML('')
			setMarkdown('')
			setJs([])
			setLLMHidden(false)
			return
		}
		// @ts-expect-error just a hacky testing thing
		// eslint-disable-next-line no-underscore-dangle
		window._item = item
		setMarkdown(
			(item.markdown ?? '').split(/---\nprompt:.+\n---/gm).pop() ?? ''
		)

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params.id])

	const streamResponse = useCallback(
		(query?: string, html?: string, clearSession = false) => {
			setMarkdown('')
			setAnnotatedHTML('')
			setRenderError(undefined)
			setRendering(true)
			if (queryRef.current) {
				queryRef.current.value = ''
			}
			createOrRefine(
				{
					query: query ?? 'image-upload',
					model,
					systemPrompt,
					html: clearSession ? undefined : html,
					image: clearSession ? undefined : pendingScreenshot,
					temperature
				},
				md => {
					setMarkdown(prevMD => (prevMD || '') + md)
				}
			)
				.then(() => {
					setMarkdown(md => {
						setItem(it => ({
							...it,
							markdown: (it.markdown ?? '') + md
						}))
						saveHistory()
						return md
					})
					setPendingScreenshot(undefined)
					setRendering(false)
				})
				.catch((error: Error) => {
					setRendering(false)
					setPendingScreenshot(undefined)
					setMarkdown(md => {
						// This is rather important, without it we get into an
						// infinite re-render
						if (md.trim() !== '') {
							setItem(it => ({
								...it,
								markdown: (it.markdown ?? '') + md
							}))
						}
						saveHistory()
						return md
					})
					console.error(error)
					setRenderError(error.message)
				})
		},
		[
			model,
			pendingScreenshot,
			systemPrompt,
			setItem,
			setPendingScreenshot,
			setAnnotatedHTML,
			saveHistory,
			temperature
		]
	)

	// page nav streaming
	// TODO: hacky clear param nonsense
	useEffect(() => {
		const gen = searchParams.get('gen') === '1'
		const clear = searchParams.get('clear') === 'true'
		if (gen && !item.markdown && !rendering) {
			setSearchParams(new URLSearchParams(), {
				preventScrollReset: true,
				replace: true
			})
			streamResponse(item.prompt, undefined, clear)
		}
	}, [item, rendering, setSearchParams, searchParams, streamResponse])

	useEffect(() => {
		try {
			if (!markdown) {
				setPureHTML('')
				return
			}
			setRenderError(undefined)
			const result = parseMarkdown(markdown)
			if (result.html) {
				setItem(it => {
					console.log('UPD', it, result)
					return { ...it, ...result }
				})
				setPureHTML(fixHTML(result.html))
			} else if (!rendering) {
				setRenderError(
					`No HTML in response.  View the response in the chat history.`
				)
			}
		} catch (error) {
			console.error(error)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [throttledMD, rendering])

	// screenshot
	useEffect(() => {
		// TODO: do something with this element
		if (screenshot !== '') {
			const img = new Image()
			img.addEventListener('load', () => {
				setImageEl(img)
			})
			img.src = screenshot
		}
	}, [screenshot])

	// editing mode
	useEffect(() => {
		const keyDown = (e: KeyboardEvent) => {
			if (e.shiftKey) {
				setEditing(false)
			}
		}
		const keyUp = (e: KeyboardEvent) => {
			if (e.key === 'Shift') {
				setEditing(markdown !== '')
			}
		}
		document.addEventListener('keydown', keyDown)
		document.addEventListener('keyup', keyUp)
		return () => {
			document.removeEventListener('keydown', keyDown)
			document.removeEventListener('keyup', keyUp)
		}
	}, [markdown])

	const newComponent = useCallback(
		(query: string, clear = true) => {
			// New state management
			const newId = nanoid()
			setMarkdown('')
			historyAtomFamily({ id: newId, prompt: query, createdAt: new Date() })
			setHistoryIds(prev => [newId, ...prev])
			navigation(`/ai/${newId}?gen=1&clear=${clear}`)
		},
		[navigation, setHistoryIds]
	)

	const onSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
		e.preventDefault()
		let iterating = true
		// TODO: !results is a little lame
		if (!markdown || (e as React.KeyboardEvent).shiftKey) {
			iterating = false
		}
		setLLMHidden(true)
		let query = 'html-comments-only'
		if (e.target instanceof HTMLFormElement) {
			const formData = new FormData(e.target)
			query = formData.get('query')?.toString() ?? ''
		} else {
			// TODO: handle empty textarea
			query = (e.target as HTMLTextAreaElement).value
		}
		if (iterating) {
			setMarkdown('')
			setItem(it => ({
				...it,
				markdown: it.markdown + newChapter(query),
				prompts: [...(it.prompts ?? [it.prompt]), query]
			}))
			streamResponse(query, pureHTML)
		} else {
			newComponent(query)
		}
	}

	function parseJs(dom: Document): Script[] {
		const scripts = dom.querySelectorAll('script')
		const scriptObs: Script[] = []
		for (const script of scripts) {
			scriptObs.push({
				text: script.innerHTML,
				src: script.src,
				type: script.type
			})
		}
		return scriptObs
	}

	useEffect(() => {
		if (params.id === 'new') {
			// TODO: might want to put this elsewhere
			setPureHTML('')
			return
		}
		const parser = new DOMParser()
		const dom = parser.parseFromString(pureHTML, 'text/html')
		removeCommentNodes(dom.body)
		setItem(it => ({ ...it, html: dom.body.innerHTML }))
		setJs(parseJs(dom))
	}, [pureHTML, setItem, params.id])

	// convert HTML to a framework
	useEffect(() => {
		if (!convertFramework) {
			return
		}
		const toFramework = convertFramework
		setConvertFramework(undefined)
		setRendering(true)
		const curComponents = item.components ?? {}
		convert(
			{
				model,
				framework: toFramework,
				html: pureHTML,
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
				setRendering(false)
			})
			.catch(error => {
				setRendering(false)
				console.error(error)
			})
	}, [
		convertFramework,
		setItem,
		saveHistory,
		setConvertFramework,
		item.components,
		model,
		pureHTML,
		temperature
	])

	// auto submit for uploads / annotations
	// TODO: careful here / this isn't really working anymore
	useEffect(() => {
		if (screenshot !== '') {
			// TODO: this state management is gross
			newComponent('image-upload', false)
			setPendingScreenshot(screenshot)
			setScreenshot('')
		} else if (annotatedHTML !== '') {
			setItem(it => ({
				...it,
				markdown: it.markdown + newChapter(comments[0])
			}))
			setLLMHidden(true)
			setComments([])
			streamResponse('html-comments-only', annotatedHTML)
		}
	}, [
		annotatedHTML,
		comments,
		newComponent,
		screenshot,
		setAnnotatedHTML,
		setComments,
		setItem,
		setScreenshot,
		streamResponse
	])

	return (
		<div className='flex-col bg-secondary'>
			<div className='p-2'>
				<HTMLAnnotator
					id={id}
					html={pureHTML}
					js={js}
					error={renderError}
					imageUploadRef={imageFileRef}
					rendering={rendering}
				/>
				<CodeViewer id={id} code={pureHTML} />
				{
					// eslint-disable-next-line @typescript-eslint/no-magic-numbers
					historyIds.length <= 2 && (
						<Examples
							className={cn('absolute', llmHidden && 'bottom-0 opacity-0')}
							style={{
								bottom: bigEnough ? '130px' : '230px'
							}}
							callback={(prompt: string) => {
								if (queryRef.current) {
									queryRef.current.value = prompt
									const event = new Event('submit', {
										bubbles: true, // Event will bubble up through the DOM
										cancelable: true // Event can be canceled
									})
									formRef.current?.dispatchEvent(event)
								}
							}}
						/>
					)
				}
			</div>
			<Button
				// eslint-disable-next-line react/jsx-handler-names
				onClick={() => {
					const hiding = !llmHidden
					setLLMHidden(!llmHidden)
					if (queryRef.current && !hiding) {
						queryRef.current.focus()
					}
				}}
				variant='ghost'
				size='icon'
				className='absolute left-[calc(50%-1.25rem)] z-10 hover:scale-125 hover:animate-pulse hover:bg-transparent'
				style={
					/* calc(45px + env(safe-area-inset-bottom, 0px)) */ {
						bottom: `${bigEnough ? 10 : 100}px`
					}
				}
			>
				{llmHidden ? (
					<DoubleArrowUpIcon className='inline-block h-5 w-5' />
				) : (
					<DoubleArrowDownIcon className='inline-block h-5 w-5' />
				)}
			</Button>
			{/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
			<Form onSubmit={onSubmit} className='' ref={formRef}>
				<input
					ref={imageFileRef}
					id='file-input'
					type='file'
					className='hidden'
					accept='image/*'
				/>
				<div
					id='llm-input'
					className={cn(
						`absolute left-[calc(50%)] z-0 flex w-11/12 -translate-x-1/2 justify-center rounded-full bg-background px-8 py-4 align-middle transition-all duration-500 lg:max-w-full`,
						llmHidden && 'translate-y-8 opacity-0'
					)}
					style={
						/* calc(45px + env(safe-area-inset-bottom, 0px)) */ {
							bottom: `${bigEnough ? 45 : 145}px`
						}
					}
				>
					<Textarea
						name='query'
						rows={1}
						className='min-h-[41px] min-w-0 flex-1 resize-none rounded-none border-none text-base focus-visible:ring-0 focus-visible:ring-offset-0'
						placeholder={
							editing
								? 'Ask for changes to the current UI'
								: 'Describe a UI you desire'
						}
						ref={queryRef}
						// eslint-disable-next-line react/jsx-handler-names
						onKeyDown={(e: React.KeyboardEvent) => {
							if (e.key === 'Enter') {
								onSubmit(e).catch(error => console.error(error))
							}
						}}
					/>
					<div className='flex items-center'>
						{/* <Button
							className='mr-2 h-8 w-8 flex-none'
							variant='outline'
							size='icon'
							// eslint-disable-next-line react/jsx-handler-names
							onClick={(e: React.SyntheticEvent) => {
								e.preventDefault()
								imageFileRef.current?.click()
							}}
						>
							<UploadIcon className='h-4 w-4' />
						</Button> */}
						<Button
							className='h-8 w-8 flex-none'
							variant='outline'
							size='icon'
							type='submit'
						>
							{editing ? (
								<ResumeIcon className='h-4 w-4' />
							) : (
								<PlayIcon className='h-4 w-4' />
							)}
						</Button>
					</div>
				</div>
			</Form>
		</div>
	)
}
