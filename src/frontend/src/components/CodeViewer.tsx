import { DownloadIcon, PlusCircledIcon } from '@radix-ui/react-icons'
import copyTextToClipboard from '@uiw/copy-to-clipboard'
import ShareDialog from 'components/ShareDialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from 'components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/ui/tooltip'
import { useAtom, useAtomValue } from 'jotai'
import { Suspense, lazy, useEffect, useState } from 'react'
import {
	convertFrameworkAtom,
	historyAtomFamily,
	selectedFrameworkAtom,
	FRAMEWORKS,
	type Framework
} from 'state'
import { downloadStringAsFile } from '../lib/utils'
import Scaffold from './Scaffold'

const CodeEditor = lazy(async () => import('components/CodeEditor'))

function replaceAll(str: string, mapObj: Record<string, string>) {
	const re = new RegExp(Object.keys(mapObj).join('|'), 'g')

	return str.replace(re, matched => mapObj[matched.toLowerCase()])
}

function htmlToJSX(text: string) {
	const mapObj = {
		'class=': 'className=',
		'for=': 'htmlFor=',
		'-rule': 'Rule',
		'stroke-l': 'strokeL',
		'stroke-w': 'strokeW',
		'<!--': '{/*',
		'-->': '*/}',
		tabindex: 'tabIndex',
		colspan: 'colSpan:',
		rowspan: 'rowSpan:',
		'aria-*': 'aria-*',
		'data-*': 'data-*',
		onclick: 'onClick',
		onchange: 'onChange',
		onblur: 'onBlur'
	}

	const render = replaceAll(text, mapObj)
	// TODO: it would cool to generate a name for our component
	return `export default function Widget() {
    return (
${render
	.split('\n')
	.map(line => `        ${line}`)
	.join('\n')}
    )
}`
}

interface ViewerProps {
	id: string
	code: string
	shared: boolean
}

export default function CodeViewer({ id, code, shared }: ViewerProps) {
	const item = useAtomValue(historyAtomFamily({ id }))
	const [framework, setFramework] = useAtom(selectedFrameworkAtom)
	const [convertFramework, setConvertFramework] = useAtom(convertFrameworkAtom)
	/* TODO: disabled for now
	const setEditedHTML = useSetAtom(editedHTMLAtom)
	const saveHistory = useSaveHistory()
	*/

	// local state
	const [currentCode, setCurrentCode] = useState<string>(code)

	// TODO: likely throttle / debounce
	useEffect(() => {
		if (framework === 'jsx') {
			setCurrentCode(htmlToJSX(code))
		} else if (framework === 'html') {
			setCurrentCode(code)
		} else {
			setCurrentCode(item.components?.[framework] ?? 'Loading...')
		}
	}, [framework, code, item.components])

	useEffect(() => {
		if (convertFramework) {
			setFramework(convertFramework)
		}
	}, [convertFramework, setFramework])

	// TODO: do I need an effect for components changing?
	const frameworks: Framework[] = ['html']
	if (item.components) {
		frameworks.push(...(Object.keys(item.components) as Framework[]))
	} else {
		frameworks.push('jsx')
	}

	return (
		<div className='code-syntax-wrapper'>
			<div className='code-syntax relative border'>
				<div className='grid w-full grid-cols-2 rounded-t-md border-b'>
					<ul className='flex text-center text-sm font-medium text-gray-500 dark:text-gray-400'>
						{frameworks.map(f => (
							<li key={f}>
								<button
									type='button'
									// eslint-disable-next-line react/jsx-handler-names
									onClick={() => setFramework(f)}
									className={`inline-block w-full border-r p-2 px-3 text-secondary-foreground ${
										f === framework
											? 'bg-background'
											: 'bg-secondary hover:bg-background'
									}`}
								>
									{f.toUpperCase()}
								</button>
							</li>
						))}
						<li key='new'>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type='button'
										aria-label='Convert HTML to a framework'
										className='inline-block w-full border-r bg-secondary p-[10px] text-secondary-foreground hover:bg-background'
									>
										<Tooltip>
											<TooltipTrigger asChild>
												<PlusCircledIcon />
											</TooltipTrigger>
											<TooltipContent side='bottom'>
												Convert HTML to a framework
											</TooltipContent>
										</Tooltip>
									</button>
								</DropdownMenuTrigger>

								<DropdownMenuContent side='top'>
									<DropdownMenuLabel>Convert to</DropdownMenuLabel>
									<DropdownMenuSeparator />
									{FRAMEWORKS.map(f => (
										<DropdownMenuItem
											key={f}
											onClick={() => {
												setConvertFramework(f)
											}}
										>
											{f.toLocaleUpperCase()}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</li>
					</ul>
					<div className='flex justify-end'>
						{/* TODO: disabling for now 
						<button
							type='button'
							disabled={framework !== 'html'}
							// eslint-disable-next-line react/jsx-handler-names
							onClick={() => {
								setItem(it => ({ ...it, html: code }))
								saveHistory()
							}}
							className='flex items-center border-l px-3 text-sm text-secondary-foreground hover:bg-background'
						>
							Save
						</button> */}
						{id !== 'new' && !shared && <ShareDialog />}
						<button
							type='button'
							aria-label='Download'
							// eslint-disable-next-line react/jsx-handler-names
							onClick={() => {
								const ext = framework === 'html' ? '.html' : '.js'
								downloadStringAsFile(
									code,
									framework === 'html' ? 'text/html' : 'application/javascript',
									`${item.name}${ext}`
								)
							}}
							className='flex items-center border-l px-3 text-sm text-secondary-foreground hover:bg-background'
						>
							<DownloadIcon />
						</button>
						<button
							type='button'
							// eslint-disable-next-line react/jsx-handler-names
							onClick={() => copyTextToClipboard(currentCode)}
							className='flex items-center border-l px-3 text-sm text-secondary-foreground hover:bg-background'
						>
							<svg
								className='mr-2 h-3.5 w-3.5'
								aria-hidden='true'
								xmlns='http://www.w3.org/2000/svg'
								fill='currentColor'
								viewBox='0 0 18 20'
							>
								<path d='M5 9V4.13a2.96 2.96 0 0 0-1.293.749L.879 7.707A2.96 2.96 0 0 0 .13 9H5Zm11.066-9H9.829a2.98 2.98 0 0 0-2.122.879L7 1.584A.987.987 0 0 0 6.766 2h4.3A3.972 3.972 0 0 1 15 6v10h1.066A1.97 1.97 0 0 0 18 14V2a1.97 1.97 0 0 0-1.934-2Z' />
								<path d='M11.066 4H7v5a2 2 0 0 1-2 2H0v7a1.969 1.969 0 0 0 1.933 2h9.133A1.97 1.97 0 0 0 13 18V6a1.97 1.97 0 0 0-1.934-2Z' />
							</svg>{' '}
							<span className='copy-text'>Copy</span>
						</button>
					</div>
				</div>
				<div className='relative bg-zinc-50 dark:bg-zinc-900'>
					<div
						className='max-h-[24vh] overflow-scroll pb-8 text-sm'
						tabIndex={-1}
					>
						<Suspense fallback={<Scaffold loading />}>
							{/* TODO: jsx editing */}
							{code ? (
								<CodeEditor
									code={currentCode}
									framework={framework}
									// eslint-disable-next-line react/jsx-handler-names
									// onChange={(value: string) => setEditedHTML(value)}
								/>
							) : undefined}
						</Suspense>
					</div>
				</div>
			</div>
		</div>
	)
}
