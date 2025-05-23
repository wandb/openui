import { Button } from 'components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip'
import { useVersion } from 'hooks'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import type React from 'react'
import {
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState
} from 'react'
import {
	ItemWrapper,
	commentsAtom,
	darkModeAtom,
	facetsAtom,
	historyAtomFamily,
	historySidebarStateAtom,
	imageDB,
	inspectorEnabledAtom,
	modelSupportsImagesAtom,
	uiStateAtom,
	uiThemeAtom,
	useSaveHistory
} from 'state'
import Scaffold from './Scaffold'

import { CodeIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons'
import { voteRequest } from 'api/openui'
import {
	HoverCard,
	HoverCardArrow,
	HoverCardContent,
	HoverCardTrigger
} from 'components/ui/hover-card'
import { adjectives } from 'lib/constants'
import type { Script } from 'lib/html'
import { themes } from 'lib/themes'
import { cn, resizeImage } from 'lib/utils'
import {
	CheckIcon,
	PaintbrushIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	WandSparklesIcon
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useNavigate } from 'react-router-dom'
import CodeViewer from './CodeViewer'
import CurrentUIContext from './CurrentUiContext'
import { Checkbox } from './ui/checkbox'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

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

	return result.slice(1, -2)
}

interface HTMLAnnotatorProps {
	id: string
	error?: string
}

export interface IFrameEvent {
	action: string
	id?: string
	html: string
	js: Script[]
	screenshot: string
	comment: string
	height: number
	preview: boolean
}

export default function HTMLAnnotator({ error, id }: HTMLAnnotatorProps) {
	const currentUI = useContext(CurrentUIContext)

	// Only point to our local annotator in development / running locally otherwise use github pages
	const iframeSrc = /127\.0\.0\.1|localhost/.test(document.location.hostname)
		? `http://${document.location.hostname}:${document.location.port === '5173' ? '7878' : document.location.port}`
		: 'https://wandb.github.io'
	const iframeRef = useRef<HTMLIFrameElement | null>(null)
	const annotatorRef = useRef<HTMLDivElement | null>(null)
	const iframeId = useMemo(() => nanoid(8), [])
	const saveHistory = useSaveHistory()
	const [rawItem, setRawItem] = useAtom(historyAtomFamily({ id }))
	const item = useMemo(
		() => new ItemWrapper(rawItem, setRawItem, saveHistory),
		[rawItem, setRawItem, saveHistory]
	)
	const [versionIdx] = useVersion(item)
	const navigation = useNavigate()

	// global state
	const [comments, setComments] = useAtom(commentsAtom)
	const [facets, setFacets] = useAtom(facetsAtom)
	const darkMode = useAtomValue(darkModeAtom)
	const [inspectorEnabled, setInspectorEnabled] = useAtom(inspectorEnabledAtom)
	const setSidebarState = useSetAtom(historySidebarStateAtom)
	const uiState = useAtomValue(uiStateAtom)
	const [uiTheme, setUiTheme] = useAtom(uiThemeAtom)
	const modelSupportsImages = useAtomValue(modelSupportsImagesAtom)
	const [image, setImage] = useAtom(
		imageDB.item(`screenshot-${id}-${versionIdx}`)
	)
	const isRendering = uiState.rendering // && `${html}`.length < 10

	// Local state
	const [isReady, setIsReady] = useState<boolean>(false)
	const [popoverOpen, setPopoverOpen] = useState<boolean>(false)
	const [themePopoverOpen, setThemePopoverOpen] = useState<boolean>(false)
	const [previewDarkMode, setPreviewDarkMode] = useState<string>(darkMode)
	const [voted, setVoted] = useState<string>('')
	// TODO: wire this up to jotai and make the versions pane absolute
	const [isCodeVisible, setIsCodeVisible] = useState<boolean>(false)
	const [userMedia, setUserMedia] = useState<
		'desktop' | 'mobile' | 'tablet' | undefined
	>()
	const [autoMedia, setAutoMedia] = useState<'mobile' | 'tablet' | undefined>()
	const media = userMedia ?? autoMedia ?? 'desktop'
	const [inspectorToggled, setInspectorToggled] = useState<boolean>(false)
	const [scale, setScale] = useState<number>(1)

	useLayoutEffect(() => {
		if (darkMode === 'system') {
			if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				setPreviewDarkMode('dark')
			} else {
				setPreviewDarkMode('light')
			}
		}
	}, [darkMode])

	useEffect(() => {
		if (isReady) {
			const theme = themes.find(t => t.name === uiTheme) ?? themes[0]
			iframeRef.current?.contentWindow?.postMessage(
				{ action: 'theme', theme },
				'*'
			)
		}
	}, [uiTheme, isReady, previewDarkMode])

	const toggleFacet = useCallback(
		(name: string) => {
			setFacets(prevFacets => {
				// Clear all non-official facets
				const cleanFacets = prevFacets.filter(facet =>
					adjectives.includes(facet)
				)
				if (cleanFacets.includes(name)) {
					return cleanFacets.filter(facet => facet !== name)
				}
				return [...cleanFacets, name]
			})
		},
		[setFacets]
	)

	useEffect(() => {
		function reset() {
			iframeRef.current?.contentWindow?.postMessage({ action: 'reset' }, '*')
		}
		currentUI.on('iframe-reset', reset)
		return () => {
			currentUI.off('iframe-reset', reset)
		}
	}, [currentUI])

	// Reset iframe on UI change
	useEffect(() => {
		iframeRef.current?.contentWindow?.postMessage({ action: 'reset' }, '*')
	}, [id])

	useEffect(() => {
		if (iframeRef.current) {
			const resizeObserver = new ResizeObserver(entries => {
				const width = annotatorRef.current?.clientWidth ?? 768
				switch (media) {
					case 'desktop': {
						if (width > 768) {
							setScale(1)
						} else {
							setScale(width / 768)
						}

						break
					}
					case 'tablet': {
						setScale(1)

						break
					}
					case 'mobile': {
						setScale(1)

						break
					}
					default: {
						setScale(1)
					}
				}
				for (const entry of entries) {
					if (entry.contentRect.width <= 480) {
						// 384 is the actual breakpoint (640 in tailwind docs?)
						setAutoMedia('mobile')
					} else if (entry.contentRect.width <= 768) {
						setAutoMedia('tablet')
					} else {
						setAutoMedia(undefined)
					}
				}
			})
			const annotator = annotatorRef.current
			if (annotator) {
				resizeObserver.observe(annotator)
				return () => resizeObserver.unobserve(annotator)
			}
			return () => {}
		}
		return () => {}
	}, [autoMedia, media])

	useEffect(() => {
		if (inspectorEnabled && !inspectorToggled) {
			setInspectorToggled(inspectorEnabled)
		}
		if (inspectorToggled) {
			iframeRef.current?.contentWindow?.postMessage(
				{ action: 'toggle-inspector' },
				'*'
			)
		}
	}, [inspectorEnabled, inspectorToggled])

	// Iframe content
	useEffect(() => {
		if (!uiState.renderedHTML) {
			return
		}
		if (iframeRef.current && isReady) {
			// This is further insurance to prevent markdown
			// TODO: is 30 right?
			if (uiState.renderedHTML.html.length > 30) {
				iframeRef.current.contentWindow?.postMessage(
					{
						html: uiState.renderedHTML.html,
						js: uiState.renderedHTML.js,
						darkMode: previewDarkMode === 'dark',
						action: 'hydrate',
						rendering: isRendering
					},
					'*'
				)
			}
		} else if (!isReady) {
			console.warn('Iframe not ready, not hydrating')
		}
	}, [uiState.renderedHTML, previewDarkMode, isReady, isRendering])

	// Iframe listeners and dark mode
	useEffect(() => {
		const listener = (event: MessageEvent<IFrameEvent>) => {
			// Only listen to events from our iframe
			if (event.origin !== iframeSrc) return
			// TODO: allowing null ids for now
			if (event.data.id && event.data.id !== iframeId) {
				return
			}
			if (event.data.action === 'ready') {
				setIsReady(true)
			} else if (event.data.screenshot) {
				console.log('Saving screenshot')
				resizeImage(event.data.screenshot, 1024)
					.then(setImage)
					.catch((error_: unknown) =>
						console.error('Screenshot failure', error_)
					)
			} else if (event.data.comment) {
				setComments([...comments, event.data.comment])
				currentUI.emit('ui-state', {
					annotatedHTML: formatHTML(event.data.html.trim())
				})
				setInspectorEnabled(false)
			}
			/* Got rid of this in favor of using the iframe for state display
				else if (event.data.action === 'loaded' && uiState.renderedHTML) {
				setPreview(event.data.preview)
			} */
		}
		window.addEventListener('message', listener)
		return () => window.removeEventListener('message', listener)
	}, [
		uiState.renderedHTML,
		comments,
		isRendering,
		darkMode,
		setComments,
		iframeSrc,
		iframeId,
		setInspectorEnabled,
		currentUI,
		setImage,
		image
	])

	const createVote = useCallback(
		(vote: boolean) => {
			voteRequest(vote, item, versionIdx).then(
				() => setVoted(vote ? 'yep' : 'nope'),
				(error_: unknown) => {
					console.error('Error creating vote', error_)
				}
			)
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[id, versionIdx]
	)

	const themeColor = useMemo(
		() =>
			(themes.find(theme => theme.name === uiTheme) ?? themes[0]).activeColor[
				previewDarkMode === 'dark' ? 'dark' : 'light'
			],
		[uiTheme, previewDarkMode]
	)

	return (
		<div className='flex flex-col'>
			<div className='relative flex w-full flex-row'>
				<div
					ref={annotatorRef}
					className={cn(
						'code-preview-wrapper flex-grow',
						isCodeVisible && 'hidden w-1/2 lg:block'
					)}
				>
					<div className='code-responsive-wrapper relative h-[calc(100vh-315px)] w-full flex-none overflow-auto rounded-lg bg-background'>
						{/* We allow-same-origin so the iframe can keep state */}
						<iframe
							title='HTML preview'
							id={`version-${versionIdx}`}
							sandbox='allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
							ref={iframeRef}
							style={{
								transform: `scale(${scale.toFixed(2)})`,
								width: scale < 1 ? '768px' : undefined
							}}
							className={cn(
								'iframe-code left-0 top-0 mx-auto h-full w-full origin-top-left',
								media === 'tablet' && 'max-w-3xl',
								media === 'mobile' && 'max-w-sm',
								media === 'desktop' && 'absolute',
								error && 'hidden'
							)}
							src={`${iframeSrc}/openui/index.html?id=${iframeId}`}
						/>
						{/* TODO: redo the scaffold */}
						{error ? <Scaffold isLoading error={error} /> : undefined}
					</div>
				</div>
				<div
					className={`flex-shrink-0 py-0 pl-4 transition-all duration-500 ease-in-out ${
						isCodeVisible ? 'sm:w-full md:w-full lg:w-1/2' : 'hidden w-0'
					}`}
				>
					<CodeViewer id={id} code={uiState.editedHTML || uiState.pureHTML} />
				</div>
			</div>
			<div className='w-full p-1'>
				<div className='grid grid-cols-3'>
					<div className='col-span-1 items-center justify-center'>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => {
										createVote(true)
									}}
									size='icon'
									variant='ghost'
									className={`hover:animate-wiggle-zoom hover:bg-transparent ${voted === 'yep' && 'text-green-600'}`}
								>
									<ThumbsUpIcon className='h-4 w-4' />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Click me if you like the UI</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() => {
										createVote(false)
									}}
									size='icon'
									variant='ghost'
									className={`hover:animate-wiggle-zoom hover:bg-transparent ${voted === 'nope' && 'text-red-800'}`}
								>
									<ThumbsDownIcon className='h-4 w-4' />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Click me if you dislike the UI</TooltipContent>
						</Tooltip>
						<Popover open={popoverOpen}>
							<PopoverTrigger asChild>
								<Button
									className='-mr-2 border-none text-muted-foreground hover:animate-wiggle-zoom hover:bg-transparent'
									variant='ghost'
									size='icon'
									type='button'
									onClick={() => setPopoverOpen(true)}
								>
									<WandSparklesIcon className='h-4 w-4' />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								side='top'
								className='w-80'
								onOpenAutoFocus={() => {
									if (modelSupportsImages) {
										console.log('Taking screenshot')
										iframeRef.current?.contentWindow?.postMessage(
											{ action: 'take-screenshot' },
											'*'
										)
									}
								}}
								onEscapeKeyDown={() => setPopoverOpen(false)}
								onInteractOutside={() => setPopoverOpen(false)}
							>
								<div className='grid gap-4'>
									<div className='space-y-2'>
										<h4 className='font-medium leading-none'>
											Iterate on this UI
										</h4>
										<p className='text-sm text-muted-foreground'>
											Select one or more dimensions to guide the LLM.
										</p>
									</div>
									<div className='grid gap-2'>
										<div className='grid grid-cols-2 items-center gap-4'>
											{adjectives.map(adjective => (
												<div key={adjective}>
													<Checkbox
														id={adjective}
														checked={facets.includes(adjective)}
														onCheckedChange={() => toggleFacet(adjective)}
														className='mr-1'
													/>
													<Label htmlFor={adjective}>
														{!adjective.endsWith('er') && 'More '}
														{adjective.endsWith('er')
															? adjective.charAt(0).toUpperCase() +
																adjective.slice(1)
															: adjective}
													</Label>
												</div>
											))}
										</div>
										<Button
											type='button'
											className='mt-2'
											onClick={() => {
												setPopoverOpen(false)
												navigation(`/ai/${id}?regen=1`, { replace: true })
											}}
										>
											Make Magic
										</Button>
									</div>
								</div>
							</PopoverContent>
						</Popover>
					</div>

					<div className='col-span-1 flex items-center justify-center'>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={() =>
										setUserMedia(
											userMedia === 'desktop' ? undefined : 'desktop'
										)
									}
									size='icon'
									variant='ghost'
									className={cn(
										'hover:bg-transparent',
										media === 'desktop' && 'text-primary'
									)}
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
									onClick={() => setUserMedia('tablet')}
									size='icon'
									variant='ghost'
									className={cn(
										'hidden hover:bg-transparent sm:flex',
										media === 'tablet' && 'text-primary'
									)}
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
									onClick={() => setUserMedia('mobile')}
									size='icon'
									variant='ghost'
									className={cn(
										'hidden hover:bg-transparent sm:flex',
										media === 'mobile' && 'text-primary'
									)}
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

					{/* TODO: Use a Drawer when on mobile here */}
					<div className='col-span-1 flex justify-end'>
						<Popover open={themePopoverOpen} onOpenChange={setThemePopoverOpen}>
							<PopoverTrigger asChild>
								<Button
									size='icon'
									variant='ghost'
									className={cn(
										'ml-2 rounded-full text-primary-foreground hover:bg-transparent hover:text-primary-foreground'
									)}
								>
									<span
										className='flex h-6 w-6 items-center justify-center rounded-full opacity-40 hover:opacity-100'
										style={{
											backgroundColor: `hsl(${themeColor})`
										}}
									>
										<PaintbrushIcon strokeWidth={1} className='h-4 w-4' />
									</span>
									<span className='sr-only'>Change theme</span>
								</Button>
							</PopoverTrigger>
							<PopoverContent side='top' className='w-96'>
								<div className='flex flex-col gap-2'>
									<h2 className='flex text-sm font-medium'>
										UI Theme{' '}
										<HoverCard>
											<HoverCardTrigger asChild>
												<QuestionMarkCircledIcon className='ml-1 h-3 w-3' />
											</HoverCardTrigger>
											<HoverCardContent side='top' className='w-96'>
												<p>
													We use CSS variables to define custom tailwind colors
													and instruct the LLM to prefer them over hard-coded
													colors. The approach is modelled after{' '}
													<a
														href='https://ui.shadcn.com/themes'
														rel='noreferrer'
														target='_blank'
														className='underline'
													>
														ShadCN
													</a>
													.
												</p>
												<p className='mt-2'>
													If changing the color isn&apos;t working for your UI,
													try editing the code and adding the class
													&quot;bg-primary&quot; to a button or
													&quot;text-primary&quot; to a link.
												</p>
												<HoverCardArrow />
											</HoverCardContent>
										</HoverCard>
									</h2>
									<div className='grid grid-cols-3 gap-2'>
										{themes.map(theme => {
											const isActive = uiTheme === theme.name

											return (
												<Button
													variant='outline'
													size='sm'
													key={theme.name}
													onClick={() => {
														setUiTheme(theme.name)
														setThemePopoverOpen(false)
													}}
													className={cn(
														'justify-start',
														isActive && 'border-2 border-primary'
													)}
													// TODO: handle system dark mode
													style={
														{
															'--theme-primary': `hsl(${
																theme.activeColor[
																	darkMode === 'dark' ? 'dark' : 'light'
																]
															})`
														} as React.CSSProperties
													}
												>
													<span
														className={cn(
															'flex h-5 w-5 shrink-0 -translate-x-1 items-center justify-center rounded-full bg-[--theme-primary]'
														)}
													>
														{isActive ? (
															<CheckIcon className='h-4 w-4 text-white' />
														) : undefined}
													</span>
													{theme.label}
												</Button>
											)
										})}
									</div>
								</div>
							</PopoverContent>
						</Popover>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
										if (e.shiftKey && image) {
											const newTab = window.open()
											newTab?.document.write(
												`<img src="${image.url}" alt="Image">`
											)
											newTab?.document.close()
											return
										}
										const newMode =
											previewDarkMode === 'dark' ? 'light' : 'dark'
										setPreviewDarkMode(newMode)
										if (iframeRef.current) {
											iframeRef.current.contentWindow?.postMessage(
												{
													action: 'toggle-dark-mode',
													mode: newMode
												},
												'*'
											)
										}
									}}
									size='icon'
									variant='ghost'
									className='hover:bg-transparent'
								>
									<svg
										data-toggle-icon='moon'
										className={`${
											previewDarkMode === 'light' && 'hidden'
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
										className={`${
											previewDarkMode === 'dark' && 'hidden'
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
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size='icon'
									variant='ghost'
									className={cn(
										'hover:bg-transparent',
										isCodeVisible && 'text-primary'
									)}
									onClick={() => {
										setSidebarState('closed')
										setIsCodeVisible(!isCodeVisible)
									}}
								>
									<CodeIcon strokeWidth={4} className='h-5 w-5' />
									<span className='sr-only'>Edit HTML</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Edit HTML</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>
		</div>
	)
}
