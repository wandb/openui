import { CounterClockwiseClockIcon, DownloadIcon } from '@radix-ui/react-icons'
import { getShare } from 'api/openui'
import HTMLAnnotator from 'components/HtmlAnnotator'
import Prompt from 'components/Prompt'
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger
} from 'components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip'
import { useVersion } from 'hooks'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { wrappedCode } from 'lib/html'
import { themes } from 'lib/themes'
import {
	cn,
	downloadStringAsFile,
	mimeTypeAndExtension,
	resizeImage
} from 'lib/utils'
import { CircleUser, ImageIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import {
	ItemWrapper,
	draggingAtom,
	historyAtomFamily,
	historyIdsAtom,
	historySidebarStateAtom,
	imageDB,
	modelSupportsImagesAtom,
	screenshotAtom,
	selectedFrameworkAtom,
	uiStateAtom,
	uiThemeAtom
} from 'state'
import { CurrentUIProvider } from './CurrentUiContext'
import ShareDialog from './ShareDialog'
import { Button } from './ui/button'

export default function Chat({ isShared = false }: { isShared: boolean }) {
	const params = useParams()
	const id = params.id ?? 'new'
	const [isEditing, setIsEditing] = useState(false)
	const imageUploadRef = useRef<HTMLInputElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const [sidebarState, setSidebarState] = useAtom(historySidebarStateAtom)
	const [rawItem, setRawItem] = useAtom(historyAtomFamily({ id }))
	const [historyIds, setHistoryIds] = useAtom(historyIdsAtom)
	const framework = useAtomValue(selectedFrameworkAtom)
	const modelSupportsImages = useAtomValue(modelSupportsImagesAtom)
	const setScreenshot = useSetAtom(screenshotAtom)
	const setDragging = useSetAtom(draggingAtom)
	const item = useMemo(
		() => new ItemWrapper(rawItem, setRawItem),
		[rawItem, setRawItem]
	)

	const { t } = useTranslation()
	const [uiState, setUiState] = useAtom(uiStateAtom)
	const uiTheme = useAtomValue(uiThemeAtom)
	const theme = themes.find(th => th.name === uiTheme)
	const [versionIdx] = useVersion(item)
	const deleteImage = useSetAtom(imageDB.delete)
	const newImage = useAtomValue(imageDB.item(`image-new-0`))
	const [image, setImage] = useAtom(imageDB.item(`image-${id}-${versionIdx}`))
	const lastRender = useAtomValue(
		imageDB.item(`screenshot-${id}-${versionIdx - 1}`)
	)

	// Load shared item
	useEffect(() => {
		if (isShared) {
			;(async () => {
				const sharedItem = await getShare(id)
				setUiState(ui => ({
					...ui,
					pureHTML: sharedItem.html ?? '',
					error: undefined
				}))
				sharedItem.markdown = `---\nname: ${sharedItem.name}\nemoji: ${sharedItem.emoji}\n---\n\n${sharedItem.html}`
				setRawItem(sharedItem)
				if (!historyIds.includes(id)) {
					setHistoryIds([id, ...historyIds])
				}
				// SetItem(sharedItem)
			})().catch((error: unknown) => {
				console.error(error)
				setUiState(ui => ({
					...ui,
					error: (error as Error).toString()
				}))
			})
		}
	}, [isShared, id, setUiState, setRawItem, setHistoryIds, historyIds])

	useEffect(() => {
		setIsEditing(id !== 'new')
		// Move our new image to the current image on create
		if (id !== 'new' && newImage && !image) {
			setImage(newImage).catch((error: unknown) => {
				console.error('Error setting image', error)
			})
			deleteImage(`image-new-0`).catch((error: unknown) => {
				console.error('Error deleting image', error)
			})
		}
	}, [id, setIsEditing, newImage, image, setImage, deleteImage])

	const onDropFile = useCallback(
		(file: File) => {
			const reader = new FileReader()
			reader.addEventListener('load', () => {
				setScreenshot(reader.result as string)
				resizeImage(reader.result as string, 1024).then(setImage, () =>
					console.error('Resize failed')
				)
			})
			reader.readAsDataURL(file)
		},
		[setScreenshot, setImage]
	)

	useEffect(() => {
		const handlePaste = (e: ClipboardEvent) => {
			const items = e.clipboardData?.items
			let file: File | null | undefined
			if (items) {
				for (const it of items) {
					if (it.type.startsWith('image/')) {
						file = it.getAsFile()
						break
					}
				}
				if (file) {
					console.log('Pasted file type', file.type)
					onDropFile(file)
				} else {
					console.error('File type not supported', items[0].type)
				}
			}
		}

		window.addEventListener('paste', handlePaste)
		return () => {
			window.removeEventListener('paste', handlePaste)
		}
	}, [onDropFile])

	return (
		<CurrentUIProvider>
			<div
				ref={contentRef}
				role='button'
				tabIndex={0}
				onDragEnter={() => setDragging(true)}
				onDragExit={() => setDragging(false)}
				onDrop={(e: React.DragEvent) => {
					e.preventDefault()
					setDragging(false)
					if (!modelSupportsImages) {
						console.warn('Model does not have vision capabilities')
						return
					}

					let file: File | null | undefined
					let fileType: string | undefined
					if (e.dataTransfer.items.length > 0) {
						for (const it of e.dataTransfer.items) {
							if (it.kind === 'file') {
								file = it.getAsFile()
								fileType = file?.type
								if (file?.type.startsWith('image/')) break
								else file = undefined
							}
						}
					} else {
						for (const f of e.dataTransfer.files) {
							fileType = file?.type
							if (f.type.startsWith('image/')) break
							else file = undefined
						}
					}
					e.dataTransfer.clearData()

					if (file) {
						onDropFile(file)
					} else {
						console.warn('File type not supported', fileType)
					}
				}}
				onDragOver={(e: React.DragEvent) => {
					e.preventDefault()
				}}
				className={cn(
					'overflow-y-none relative flex h-[calc(100vh-12em)] max-h-[calc(100vh-6em)] w-full flex-col gap-3 px-[3%] pb-4 align-middle md:px-[10%]',
					sidebarState === 'closed' ? '' : 'md:px-[3%]'
				)}
			>
				{id === 'new' ? (
					<div className={sidebarState === 'history' ? 'mt-[25%]' : 'mt-[20%]'}>
						{image ? (
							<img
								src={image.url}
								alt='Screenshot'
								className='mx-auto mb-4 max-h-72 max-w-72'
							/>
						) : undefined}
						<h1 className='mb-1 flex-row text-center text-2xl font-medium text-zinc-800 dark:text-zinc-300 md:text-3xl'>
							{t('Chat Header')}
						</h1>
						{modelSupportsImages ? (
							<h2 className='mb-4 text-center text-lg font-normal text-muted-foreground md:text-xl'>
								{t('Pro Tip')}
							</h2>
						) : undefined}
					</div>
				) : (
					<div>
						{/* DANGER, SETTING MARGIN HERE IS WONKUS */}
						<div className='flex w-full items-center justify-between p-4'>
							<div className='flex items-center gap-2'>
								<CircleUser strokeWidth={1} className='flex w-4' />
								<HoverCard>
									<HoverCardTrigger className='flex'>
										<div className='flex cursor-help items-center justify-start gap-2.5 rounded-full bg-muted p-2 brightness-[.95]'>
											<span
												className={cn(
													'text-md max-w-[calc(100vw-200px)] truncate px-4 text-left font-sans font-normal leading-[20px] md:max-w-[calc(100vw-450px)]',
													sidebarState !== 'closed' &&
														'md:max-w-[calc(100vw-750px)]'
												)}
											>
												{lastRender &&
												uiState.prompt.startsWith("Let's make") ? (
													<ImageIcon
														strokeWidth={1}
														className='float-left mr-2 h-4 w-4'
													/>
												) : undefined}
												{uiState.prompt === '' ? (
													<ImageIcon strokeWidth={1} className='h-4 w-4' />
												) : (
													uiState.prompt
												)}
											</span>
										</div>
										<span className='my-auto ml-2 hidden h-4 flex-shrink-0 rounded-sm bg-muted px-2 text-xs text-zinc-500 brightness-[.95] md:block'>
											Version {item.version(versionIdx)}
										</span>
									</HoverCardTrigger>
									<HoverCardContent className='ml-36 w-[1000px] max-w-[calc(70vw)] rounded-[20px]'>
										<div className='flex'>
											{(image ?? lastRender) ? (
												<div className='mr-2 flex-shrink-0'>
													<img
														src={image?.url ?? lastRender?.url}
														alt='Screenshot'
														className='flex max-h-56 max-w-56'
													/>
												</div>
											) : undefined}
											<div className='flex-grow'>
												<p>{uiState.prompt}</p>
											</div>
										</div>
									</HoverCardContent>
								</HoverCard>
							</div>
							<div className='flex justify-end'>
								{!isShared && <ShareDialog />}
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant='ghost'
											className='-mr-4 justify-end hover:bg-transparent'
											onClick={() => {
												const [ext, mime] = mimeTypeAndExtension(framework)
												// TODO: add unsplash images to the output
												downloadStringAsFile(
													wrappedCode(
														item.pureHTML(versionIdx) ?? '<h1>Error</h1>',
														framework,
														theme ?? themes[0]
													),
													mime,
													`${item.name}${ext}`
												)
											}}
										>
											<DownloadIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent side='bottom'>
										Download the HTML
									</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant='ghost'
											className='-mr-4 hover:bg-transparent'
											onClick={() => {
												setSidebarState(
													sidebarState === 'closed' ? 'versions' : 'closed'
												)
											}}
										>
											<CounterClockwiseClockIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent side='bottom'>
										Toggle version history
									</TooltipContent>
								</Tooltip>
							</div>
						</div>
						<HTMLAnnotator id={id} error={uiState.error} />
					</div>
				)}
				<Prompt isEditing={isEditing} imageUploadRef={imageUploadRef} />
			</div>
		</CurrentUIProvider>
	)
}
