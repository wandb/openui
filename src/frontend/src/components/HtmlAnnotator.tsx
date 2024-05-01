import { Button } from 'components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger
} from 'components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type React from 'react'
import {
	Suspense,
	lazy,
	useEffect,
	useLayoutEffect,
	useRef,
	useState
} from 'react'
import {
	annotatedHTMLAtom,
	commentsAtom,
	darkModeAtom,
	historyAtomFamily,
	screenshotAtom,
	type HistoryItem
} from 'state'
import Scaffold from './Scaffold'

import { MessageCircleMore } from 'lucide-react'
import FileUpload from './FileUpload'
import Screenshot from './Screenshot'

const SyntaxHighlighter = lazy(async () => import('./SyntaxHighlighter'))
const Markdown = lazy(async () => import('react-markdown'))

function formatHTML(html: string) {
	const tab = '    '
	let result = ''
	let indent = ''

	for (const element of html.split(/>\s*</)) {
		if (/^\/\w/.test(element)) {
			indent = indent.slice(tab.length)
		}
		result += `${indent}<${element}>\n`
		if (/^<?\w[^>]*[^/]$/.test(element) && !element.startsWith('input')) {
			indent += tab
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-magic-numbers
	return result.slice(1, -2)
}

function breakString(str: string, N: number) {
	const result = []
	for (let i = 0; i < str.length; i += N) {
		result.push(str.slice(i, i + N))
	}
	return result
}

export interface Script {
	src: string
	text: string
	type?: string
}

interface HTMLAnnotatorProps {
	id: string
	html: string
	error?: string
	js?: Script[]
	rendering?: boolean
	imageUploadRef?: React.RefObject<HTMLInputElement>
}

function formatMarkdown(item: HistoryItem) {
	const md = item.markdown ?? ''
	const parts = md.split('---\n\n')
	if (parts[0].includes('name: ')) {
		parts.shift()
	}
	let { prompt } = item
	return parts
		.map(p => {
			const body = p.replace(/---\nprompt:.+\n/m, '')
			const prefix = `### ${prompt}\n\n`

			const subParts = p.split('---\n')
			// eslint-disable-next-line @typescript-eslint/no-magic-numbers
			if ((subParts[1] || '').startsWith('prompt:')) {
				// eslint-disable-next-line @typescript-eslint/no-magic-numbers
				prompt = subParts[1].replace('prompt:', '').trim()
			}
			if (p.startsWith('<')) {
				return `${prefix}\`\`\`html\n${body}\n\`\`\``
			}
			return prefix + body
		})
		.join('\n')
}

interface IFrameEvent {
	action: string
	html: string
	js: Script[]
	screenshot: string
	comment: string
	height: number
	preview: boolean
}

export default function HTMLAnnotator({
	html,
	error,
	js,
	id,
	rendering,
	imageUploadRef
}: HTMLAnnotatorProps) {
	// only point to our local annotator in development / running locally otherwise use github pages
	const iframeSrc = document.location.hostname.includes("127.0.0.1") ? 'http://127.0.0.1:7878' : 'https://wandb.github.io'
	const iframeRef = useRef<HTMLIFrameElement | null>(null)
	const item = useAtomValue(historyAtomFamily({ id }))

	// global state
	const setAnnotatedHTML = useSetAtom(annotatedHTMLAtom)
	const [screenshot, setScreenshot] = useAtom(screenshotAtom)
	const [comments, setComments] = useAtom(commentsAtom)
	const [darkMode, setDarkMode] = useAtom(darkModeAtom)

	// local state
	const [preview, setPreview] = useState<boolean>(false)
	const [inspectorEnabled, setInspectorEnabled] = useState<boolean>(false)
	const [bufferedHTML, setBufferedHTML] = useState<string | undefined>()
	const [media, setMedia] = useState<'desktop' | 'mobile' | 'tablet'>('desktop')

	useLayoutEffect(() => {
		setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
	}, [setDarkMode])

	useEffect(() => {
		if (darkMode) {
			document.documentElement.classList.add('dark')
		} else {
			document.documentElement.classList.remove('dark')
		}
	}, [darkMode])

	// iframe content
	useEffect(() => {
		if (!bufferedHTML) {
			setPreview(false)
		}
		if (iframeRef.current) {
			iframeRef.current.contentWindow?.postMessage(
				{
					html: bufferedHTML,
					js: rendering ? [] : js,
					darkMode,
					action: 'hydrate'
				},
				'*'
			)
		}
	}, [bufferedHTML, darkMode, js, rendering, iframeRef])

	useEffect(() => {
		if (iframeRef.current) {
			let lines = html.split('\n')
			const lineBreak = 80
			const minBuffer = 3
			const lastLine = -1
			// Let comments flow through, breaking at 80 chars
			if (lines.at(lastLine)?.startsWith('<!--')) {
				const comment = lines.pop()
				lines = [...lines, ...breakString(comment ?? '', lineBreak)]
			} else if (!lines.at(lastLine)?.endsWith('>')) {
				lines.pop()
			}
			// TODO: we could play around with this more
			if (lines.length > minBuffer || !rendering) {
				setBufferedHTML(lines.join('\n'))
			}
		}
	}, [html, rendering])

	// iframe listeners and dark mode
	useEffect(() => {
		const listener = (event: MessageEvent<IFrameEvent>) => {
			// Only listen to events from our iframe
			if (event.origin !== iframeSrc) return
			if (event.data.action === 'ready') {
				if (bufferedHTML) {
					iframeRef.current?.contentWindow?.postMessage(
						{ html: bufferedHTML, js, darkMode, action: 'hydrate' },
						'*'
					)
				}
			} else if (event.data.screenshot) {
				console.log('Got screenshot event, ignoring for now', event)
				// setImage(event.data.screenshot)
			} else if (event.data.comment) {
				setComments([...comments, event.data.comment])
				setAnnotatedHTML(formatHTML(event.data.html.trim()))
				setInspectorEnabled(false)
			} else if (event.data.action === 'loaded') {
				setPreview(event.data.preview)
			}
		}
		window.addEventListener('message', listener)
		return () => window.removeEventListener('message', listener)
	}, [
		bufferedHTML,
		comments,
		js,
		darkMode,
		setAnnotatedHTML,
		setComments,
		iframeSrc
	])

	return (
		<>
			<div className='w-full rounded-t-xl border bg-background p-4'>
				<div className='grid grid-cols-3'>
					<div className='col-span-2 items-center justify-center space-x-2 sm:col-span-1'>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => {
										// TODO: likely sync the state
										setInspectorEnabled(!inspectorEnabled)
										iframeRef.current?.contentWindow?.postMessage(
											{ html: bufferedHTML, action: 'toggle-inspector' },
											'*'
										)
									}}
									size='icon'
									variant='outline'
									className={`${inspectorEnabled && 'bg-secondary'}`}
								>
									<svg
										className='inline-block h-4 w-4'
										viewBox='0 0 16 16'
										fill='none'
										xmlns='http://www.w3.org/2000/svg'
									>
										<path
											fillRule='evenodd'
											clipRule='evenodd'
											d='M5.5 2V0H7V2H5.5ZM0.96967 2.03033L2.46967 3.53033L3.53033 2.46967L2.03033 0.96967L0.96967 2.03033ZM4.24592 4.24592L4.79515 5.75631L7.79516 14.0063L8.46663 15.8529L9.19636 14.0285L10.2739 11.3346L13.4697 14.5303L14.5303 13.4697L11.3346 10.2739L14.0285 9.19636L15.8529 8.46663L14.0063 7.79516L5.75631 4.79516L4.24592 4.24592ZM11.6471 8.53337L10.1194 9.14447C9.6747 9.32235 9.32235 9.6747 9.14447 10.1194L8.53337 11.6471L6.75408 6.75408L11.6471 8.53337ZM0 7H2V5.5H0V7Z'
											fill='currentColor'
										/>
									</svg>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Comment on elements in the HTML</TooltipContent>
						</Tooltip>
					</div>

					<div className='col-span-1 hidden items-center justify-center space-x-2 sm:flex'>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => setMedia('desktop')}
									size='icon'
									variant='outline'
								>
									<span className='sr-only'>Toggle desktop view</span>
									<svg
										className='inline-block h-3.5 w-3.5'
										aria-hidden='true'
										xmlns='http://www.w3.org/2000/svg'
										fill='none'
										viewBox='0 0 20 20'
									>
										<path
											stroke='currentColor'
											strokeLinecap='round'
											strokeLinejoin='round'
											strokeWidth='2'
											d='M10 14v4m-4 1h8M1 10h18M2 1h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z'
										/>
									</svg>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Toggle desktop view</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => setMedia('tablet')}
									variant='outline'
									size='icon'
								>
									<span className='sr-only'>Toggle tablet view</span>
									<svg
										className='inline-block h-3.5 w-3.5'
										aria-hidden='true'
										xmlns='http://www.w3.org/2000/svg'
										fill='none'
										viewBox='0 0 18 20'
									>
										<path
											stroke='currentColor'
											strokeLinecap='round'
											strokeLinejoin='round'
											strokeWidth='2'
											d='M7.5 16.5h3M2 1h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z'
										/>
									</svg>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Toggle tablet view</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => setMedia('mobile')}
									variant='outline'
									size='icon'
								>
									<span className='sr-only'>Toggle mobile view</span>
									<svg
										className='inline-block h-3.5 w-3.5'
										aria-hidden='true'
										xmlns='http://www.w3.org/2000/svg'
										fill='none'
										viewBox='0 0 14 20'
									>
										<path
											stroke='currentColor'
											strokeLinecap='round'
											strokeLinejoin='round'
											strokeWidth='2'
											d='M1 14h12M1 4h12M6.5 16.5h1M2 1h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z'
										/>
									</svg>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Toggle mobile view</TooltipContent>
						</Tooltip>
					</div>

					<div className='col-span-1 flex justify-end'>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => {
										if (iframeRef.current) {
											setDarkMode(!darkMode)
											iframeRef.current.contentWindow?.postMessage(
												{
													action: 'toggle-dark-mode'
												},
												'*'
											)
										}
									}}
									variant='outline'
									size='icon'
								>
									<svg
										data-toggle-icon='moon'
										className={`${!darkMode && 'hidden'
											} inline-block h-3.5 w-3.5`}
										aria-hidden='true'
										xmlns='http://www.w3.org/2000/svg'
										fill='currentColor'
										viewBox='0 0 18 20'
									>
										<path d='M17.8 13.75a1 1 0 0 0-.859-.5A7.488 7.488 0 0 1 10.52 2a1 1 0 0 0 0-.969A1.035 1.035 0 0 0 9.687.5h-.113a9.5 9.5 0 1 0 8.222 14.247 1 1 0 0 0 .004-.997Z' />
									</svg>
									<svg
										data-toggle-icon='sun'
										className={`${darkMode && 'hidden'
											} inline-block h-3.5 w-3.5`}
										aria-hidden='true'
										xmlns='http://www.w3.org/2000/svg'
										fill='currentColor'
										viewBox='0 0 20 20'
									>
										<path d='M10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-11a1 1 0 0 0 1-1V1a1 1 0 0 0-2 0v2a1 1 0 0 0 1 1Zm0 12a1 1 0 0 0-1 1v2a1 1 0 1 0 2 0v-2a1 1 0 0 0-1-1ZM4.343 5.757a1 1 0 0 0 1.414-1.414L4.343 2.929a1 1 0 0 0-1.414 1.414l1.414 1.414Zm11.314 8.486a1 1 0 0 0-1.414 1.414l1.414 1.414a1 1 0 0 0 1.414-1.414l-1.414-1.414ZM4 10a1 1 0 0 0-1-1H1a1 1 0 0 0 0 2h2a1 1 0 0 0 1-1Zm15-1h-2a1 1 0 1 0 0 2h2a1 1 0 0 0 0-2ZM4.343 14.243l-1.414 1.414a1 1 0 1 0 1.414 1.414l1.414-1.414a1 1 0 0 0-1.414-1.414ZM14.95 6.05a1 1 0 0 0 .707-.293l1.414-1.414a1 1 0 1 0-1.414-1.414l-1.414 1.414a1 1 0 0 0 .707 1.707Z' />
									</svg>
									<span className='sr-only'>Toggle dark/light mode</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Toggle dark/light mode</TooltipContent>
						</Tooltip>
						<Sheet>
							<Tooltip>
								<TooltipTrigger asChild>
									<SheetTrigger asChild>
										<Button className='ml-2' variant='outline' size='icon'>
											<MessageCircleMore strokeWidth={1} />
										</Button>
									</SheetTrigger>
								</TooltipTrigger>
								<TooltipContent>View chat history</TooltipContent>
							</Tooltip>

							<SheetContent className='w-[100%] overflow-scroll sm:max-lg:max-w-[75%] md:max-w-[50%]'>
								<SheetHeader>
									<SheetTitle>Chat history</SheetTitle>
									<SheetDescription asChild>
										<Suspense fallback={<Scaffold loading />}>
											<Markdown
												className='prose prose-sm prose-zinc max-w-full dark:prose-invert'
												components={{
													code(props) {
														// TS was complaining about the ref
														// eslint-disable-next-line react/prop-types
														const { children, className, node, ref, ...rest } =
															props
														const match = /language-(\w+)/.exec(className ?? '')
														return match ? (
															<SyntaxHighlighter
																className='max-h-[300px] overflow-scroll text-xs'
																// eslint-disable-next-line @typescript-eslint/no-magic-numbers
																language={match[1]}
																// eslint-disable-next-line react/jsx-props-no-spreading
																{...rest}
															>
																{String(children).replace(/\n$/, '')}
															</SyntaxHighlighter>
														) : (
															<code>{children}</code>
														)
													}
												}}
											>
												{formatMarkdown(item)}
											</Markdown>
										</Suspense>
									</SheetDescription>
								</SheetHeader>
							</SheetContent>
						</Sheet>
					</div>
				</div>
			</div>

			<div className='code-preview-wrapper'>
				<div className='code-preview flex border-x bg-background bg-gradient-to-r p-0'>
					{/* max-w-lg and max-w-sm for responsive */}
					<div className='code-responsive-wrapper h-[60vh] w-full overflow-auto'>
						{/* we allow-same-origin so the iframe can keep state */}
						{/* eslint-disable-next-line react/iframe-missing-sandbox */}
						<iframe
							title='HTML preview'
							sandbox='allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
							ref={iframeRef}
							className={`iframe-code mx-auto max-h-[60vh] w-full bg-background ${media === 'tablet' && 'max-w-lg'
								} ${media === 'mobile' && 'max-w-sm'}`}
							style={{ height: preview && !error ? '100%' : 0 }}
							src={`${iframeSrc}/openui/index.html?buster=113`}
						/>
						{!preview &&
							// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
							(rendering || error ? (
								<Scaffold loading error={error} />
							) : (

								screenshot ?
									<Screenshot />
									:
									<FileUpload
										onClick={() => imageUploadRef?.current?.click()}
										onDropFile={(file) => {
											const reader = new FileReader();
											reader.onload = () =>
												setScreenshot(reader.result as string);
											reader.readAsDataURL(file as File);
										}}
									/>
							))}
					</div>
				</div>
			</div>
		</>
	)
}

HTMLAnnotator.defaultProps = {
	error: undefined,
	imageUploadRef: undefined,
	js: [],
	rendering: false
}
