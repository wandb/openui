import {
	DoubleArrowDownIcon,
	DoubleArrowUpIcon,
	ArrowRightIcon,
	CheckIcon
} from '@radix-ui/react-icons'
import { Action, convert, createOrRefine } from 'api/openai'
import { getShare } from 'api/openui'
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
	// replace any gray styles with zinc, fix placeholder images
	let fixed = html.replaceAll('-gray-', '-zinc-')
	// use placehold.co for images
	fixed = fixed.replaceAll('via.placeholder.com', 'placehold.co')
	// point to our own backend for mp3's / wav files
	fixed = fixed.replaceAll(/"[^"]*\.(mp3|wav)"|'[^']*\.(mp3|wav)'/g, "\""+document.location.origin + "/openui/funky.mp3" + "\"")
	// remove any comments in the HTML
	fixed = fixed.replaceAll(/<!--[\s\S]*?-->/g, '')
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
	console.log('New Chapter called', prompt)
	return `\n\n---\nprompt: ${prompt}\n---\n\n`
}

export default function Builder({ shared }: { shared?: boolean }) {
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
	const imageUploadRef = useRef<HTMLInputElement>(null)
	const queryRef = useRef<HTMLTextAreaElement>(null)
	// TODO: this is rather hacky to support history
	const curMarkdown = (item.markdown ?? '').split(/---\nprompt:.+\n---/gm).pop()
	const [markdown, setMarkdown] = useState<string>(curMarkdown ?? '')

	const [pureHTML, setPureHTML] = useState<string>(item.html ?? '')
	const [renderError, setRenderError] = useState<string | undefined>()
	const [js, setJs] = useState<Script[]>([])
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [editing, setEditing] = useState<boolean>(markdown !== '')
	const [rendering, setRendering] = useState<boolean>(false)
	const [llmHidden, setLLMHidden] = useState<boolean>(markdown !== '')
	// Create for new, refine for existed
	const action: Action = editing ? 'refine' : 'create';

	// TODO: likely replace with item.components
	// const [jsx, setJSX] = useState<string>('')
	const throttledMD = useThrottle(markdown)
	const bigEnough = useMediaQuery(`(min-width: ${MOBILE_WIDTH}px)`)

	// Update terminal state, TODO: decide if we want to bring this back
	useEffect(() => {
		/* saveSession({
			html: pureHTML,
			name: `${item.emoji} ${item.name}`,
			markdown: item.markdown
		}).catch(error => console.error(error)) */
	}, [pureHTML, item])

	// Load shared item
	useEffect(() => {
		if (shared) {
			; (async () => {
				const sharedItem = await getShare(id)
				setItem(sharedItem)
				setPureHTML(sharedItem.html ?? '')
			})().catch((error: Error) => {
				console.error(error)
				setTimeout(() => setRenderError(error.toString()), 1000)
			})
		}
	}, [shared, id, setItem])

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

	// Save our streamed markdown
	const saveMarkdown = useCallback(
		(final: string) => {
			// The empty markdown check is rather important, without it we get into an
			// infinite re-render
			if (final.trim() !== '') {
				console.log('Saving:', final)
				setItem(it => ({
					...it,
					markdown: (it.markdown ?? '') + final
				}))
				saveHistory()
			}
		},
		[saveHistory, setItem]
	)

	const streamResponse = useCallback(
		(query: string, html?: string, clearSession = false) => {
			setRendering(true)
			setMarkdown('')
			setAnnotatedHTML('')
			setRenderError(undefined)
			createOrRefine(
				{
					query,
					model,
					action,
					systemPrompt,
					html: clearSession ? undefined : html,
					image: clearSession ? undefined : screenshot,
					temperature
				},
				md => {
					setMarkdown(prevMD => (prevMD || '') + md)
				}
			)
				.then(final => {
					setScreenshot('');
					setRendering(false)
					saveMarkdown(final)
					if (queryRef.current) {
						queryRef.current.value = ''
					}
					// setLLMHidden(true)
				})
				.catch((error: Error) => {
					setRendering(false)
					setScreenshot('')
					saveMarkdown('')
					console.error(error)
					setRenderError(error.message)
				})
		},
		[
			model,
			action,
			screenshot,
			systemPrompt,
			setMarkdown,
			setRendering,
			setRenderError,
			setAnnotatedHTML,
			saveMarkdown,
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
			if (!markdown || params.id === 'new') {
				setPureHTML('')
				return
			}
			setRenderError(undefined)
			// TODO: maybe pass down html and skip parsing?
			const result = parseMarkdown(markdown, {
				name: item.name,
				emoji: item.emoji
			})
			if (result.html) {
				// TODO: this is getting called three times on render, refactor
				setItem(it => ({ ...it, ...result }))
				setPureHTML(fixHTML(result.html))
			} else if (!rendering) {
				setRenderError(
					`No HTML in response.  View the response in the chat history.`
				)
			}
		} catch (error) {
			setItem(it => ({ ...it, name: 'Error' }))
			console.error(error)
		}
		// we only key off throttledMD while referencing markdown
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [throttledMD])

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
		(prompt: string, clear = true) => {
			// New state management
			const newId = nanoid()
			setMarkdown('')
			historyAtomFamily({ id: newId, prompt, createdAt: new Date() })
			setHistoryIds(prev => [newId, ...prev])
			navigation(`/ai/${newId}?gen=1&clear=${clear}`)
		},
		[navigation, setHistoryIds]
	)

	const onSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
		e.preventDefault()

		let query = queryRef.current?.value.trim() ?? '';
		if (screenshot === '' && query === '') {
			return;
		}

		if (action === 'create') {
			// Keep the screenshot
			newComponent(query, screenshot === '');
			return;
		}
		setMarkdown('')
		console.log('Submit', item.name)
		setItem(it => ({
			...it,
			markdown: it.markdown + newChapter(query),
			prompts: [...(it.prompts ?? [it.prompt]), query]
		}))
		streamResponse(query, pureHTML)
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
	}, [pureHTML, setItem, params.id, item.name])

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
	// Auto submit for annotations
	useEffect(() => {
		if (annotatedHTML !== '') {
			setItem(it => ({
				...it,
				markdown: it.markdown + newChapter(comments[0])
			}))
			setComments([])
			streamResponse('', annotatedHTML)
		}
	}, [annotatedHTML, comments])

	return (
		<div className='flex-col bg-secondary'>
			<div className='p-2'>
				<HTMLAnnotator
					id={id}
					html={pureHTML}
					js={js}
					error={renderError}
					imageUploadRef={imageUploadRef}
					rendering={rendering}
				/>
				<CodeViewer id={id} code={pureHTML} shared={shared ?? false} />
				{
					// eslint-disable-next-line @typescript-eslint/no-magic-numbers
					historyIds.length <= 2 && (
						<Examples
							className={cn(
								'absolute left-[calc(50%)] w-11/12 -translate-x-1/2',
								llmHidden && '-bottom-10 opacity-0'
							)}
							style={{
								bottom: bigEnough ? '130px' : '230px'
							}}
							callback={(prompt: string) => {
								newComponent(prompt)
							}}
						/>
					)
				}
			</div>
			<Button
				// eslint-disable-next-line react/jsx-handler-names
				onClick={() => {
					const hiding = !llmHidden
					setLLMHidden(hiding)
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
			<Form onSubmit={onSubmit}>
				<input
					ref={imageUploadRef}
					id='file-input'
					type='file'
					className='hidden'
					accept='image/*'
					onChange={e => {
						const file = e.target.files?.[0] ?? null;
						if (file === null) {
							return;
						}
						const reader = new FileReader();
						reader.onload = () =>
							setScreenshot(reader.result as string);
						reader.readAsDataURL(file);
					}}
				/>
				<div
					id='llm-input'
					className={cn(
						`absolute left-[calc(50%)] z-0 flex w-11/12 -translate-x-1/2 justify-center rounded-full bg-background px-8 py-4 align-middle transition-all duration-500 lg:max-w-full`,
						llmHidden && 'translate-y-24 opacity-0'
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
								: screenshot ? 'Describe the screenshot you uploaded (Optional)' : 'Describe a UI you desire'
						}
						ref={queryRef}
						// eslint-disable-next-line react/jsx-handler-names
						onKeyDown={async (e: React.KeyboardEvent) => {
							if (e.key === 'Enter') {
								await onSubmit(e);
							}
						}}
					/>
					<div className='flex items-center'>
						{rendering ? (
							<div className='h-8 w-8 flex-none animate-spin rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500' />
						) : (
							<Button
								className='h-8 w-8 flex-none rounded-full'
								variant='outline'
								size='icon'
								type='submit'
							>
								{editing ? (
									<CheckIcon className='h-6 w-6' />
								) : (
									<ArrowRightIcon className='h-6 w-6' />
								)}
							</Button>
						)}
					</div>
				</div>
			</Form>
		</div>
	)
}

Builder.defaultProps = {
	shared: false
}
