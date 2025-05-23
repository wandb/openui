import { TrashIcon } from '@radix-ui/react-icons'
import { useVersion } from 'hooks'
import { useAtomValue } from 'jotai'
import { themes } from 'lib/themes'
import { cn } from 'lib/utils'
import { nanoid } from 'nanoid'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
	darkModeAtom,
	historySidebarStateAtom,
	imageDB,
	uiStateAtom,
	uiThemeAtom,
	useSaveHistory,
	type ItemWrapper
} from 'state'
import type { IFrameEvent } from './HtmlAnnotator'
import { Button } from './ui/button'

export default function VersionPreview({
	item,
	versionIdx
}: {
	item: ItemWrapper
	versionIdx: number
}) {
	const iframeSrc = /127.0.0.1|localhost/.test(document.location.hostname)
		? 'http://localhost:7878'
		: 'https://wandb.github.io'
	const iframeRef = useRef<HTMLIFrameElement | null>(null)
	const [isFrameReady, setIsFrameReady] = useState(false)
	const isVisible = useAtomValue(historySidebarStateAtom) === 'versions'
	const uiState = useAtomValue(uiStateAtom)
	const isRendering = uiState.rendering
	const uiTheme = useAtomValue(uiThemeAtom)
	const theme = themes.find(t => t.name === uiTheme) ?? themes[0]
	const [html, setHtml] = useState<string | undefined>()
	const id = useMemo(() => nanoid(8), [])
	const saveHistory = useSaveHistory()
	const [currentVersionIdx] = useVersion(item)
	const image = useAtomValue(imageDB.item(`image-${item.id}-${versionIdx}`))

	const darkMode = useAtomValue(darkModeAtom)
	const [previewDarkMode, setPreviewDarkMode] = useState<string>(darkMode)

	useEffect(() => {
		if (darkMode === 'system') {
			if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
				setPreviewDarkMode('dark')
			} else {
				setPreviewDarkMode('light')
			}
		}
		if (['light', 'dark'].includes(previewDarkMode)) {
			iframeRef.current?.contentWindow?.postMessage(
				{ action: 'toggle-dark-mode', mode: previewDarkMode },
				'*'
			)
		}
		iframeRef.current?.contentWindow?.postMessage(
			{ action: 'theme', theme },
			'*'
		)
	}, [darkMode, previewDarkMode, theme])

	useEffect(() => {
		item
			.html(versionIdx)
			.then(hjs => setHtml(hjs?.html))
			.catch((error: unknown) => console.error('HTML parse error', error))
	}, [item, versionIdx, setHtml])

	useEffect(() => {
		const listener = (event: MessageEvent<IFrameEvent>) => {
			// Only listen to events from our iframe
			if (event.origin !== iframeSrc) return
			if (event.data.id !== id) return
			if (event.data.action === 'ready') {
				setIsFrameReady(true)
			}
		}
		window.addEventListener('message', listener)
		return () => window.removeEventListener('message', listener)
	}, [iframeSrc, setIsFrameReady, id])

	useEffect(() => {
		if (html && isFrameReady && isVisible) {
			// TODO: darkmode
			iframeRef.current?.contentWindow?.postMessage(
				{
					html,
					js: [],
					darkMode: previewDarkMode === 'dark',
					action: 'hydrate',
					rendering: isRendering
				},
				'*'
			)
			iframeRef.current?.contentWindow?.postMessage(
				{ action: 'theme', theme },
				'*'
			)
		}
	}, [isFrameReady, html, isVisible, previewDarkMode, id, isRendering, theme])

	const W = 1524
	const H = 960
	const DW = 200

	return (
		<a
			id={`v${versionIdx}`}
			className={cn(
				'flex h-[163px] justify-start whitespace-normal text-left',
				currentVersionIdx === versionIdx && 'bg-zinc-200 dark:bg-zinc-800'
			)}
			href={`#v${versionIdx}`}
		>
			<div className='group relative grid h-[163px] cursor-pointer grid-cols-2 overflow-hidden border-b py-2'>
				<div className='flex h-[143px] w-[210px] flex-col gap-2'>
					<div className='text-md m-2 max-h-[105px] overflow-hidden rounded-lg bg-muted p-2 text-sm text-zinc-700 dark:text-zinc-400'>
						{item.prompt(versionIdx)}
						{image ? (
							<img src={image.url} alt='Screenshot' className='max-w-42 flex' />
						) : undefined}
					</div>
					<div className='align-left mt-auto px-4 text-xs font-thin text-zinc-400'>
						Version {item.version(versionIdx)}
					</div>
				</div>
				<div className={`relative w-full max-w-[${DW}px] overflow-hidden`}>
					{}
					<iframe
						src={`${iframeSrc}/openui/index.html?preview=1&id=${id}`}
						className={cn(
							'pointer-events-none absolute left-0 top-2 origin-top-left rounded-[32px] border'
						)}
						style={{
							width: `${W}px`,
							height: `${H}px`,
							transform: `scale(${(DW / W).toFixed(2)})`
						}}
						title='Version Preview'
						sandbox='allow-same-origin allow-scripts'
						ref={iframeRef}
					/>
				</div>
				<Button
					variant='ghost'
					className='absolute right-2 top-2 hidden rounded-full hover:bg-red-500/30 group-hover:block'
					onClick={() => {
						item.deleteChapter(versionIdx)
						saveHistory()
					}}
				>
					<TrashIcon className='h-4 w-4' />
				</Button>
			</div>
		</a>
	)
}
