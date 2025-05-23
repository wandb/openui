import { PlusCircledIcon } from '@radix-ui/react-icons'
import copyTextToClipboard from '@uiw/copy-to-clipboard'
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
import { themes } from 'lib/themes'
import { Suspense, lazy, useEffect, useState } from 'react'
import {
	FRAMEWORKS,
	convertFrameworkAtom,
	historyAtomFamily,
	selectedFrameworkAtom,
	uiThemeAtom,
	type Framework
} from 'state'
import { wrappedCode } from '../lib/html'
import { cn } from '../lib/utils'
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
}

function stripCodeblocks(code: string) {
	return code.replaceAll(/```(.*)\n?/g, '')
}

export default function CodeViewer({ id, code }: ViewerProps) {
	const item = useAtomValue(historyAtomFamily({ id }))
	const uiTheme = useAtomValue(uiThemeAtom)
	const theme = themes.find(t => t.name === uiTheme)
	const [framework, setFramework] = useAtom(selectedFrameworkAtom)
	const [convertFramework, setConvertFramework] = useAtom(convertFrameworkAtom)

	// Local state
	const [currentCode, setCurrentCode] = useState<string>(code)

	// TODO: likely throttle / debounce
	useEffect(() => {
		if (framework === 'jsx') {
			setCurrentCode(htmlToJSX(code))
		} else if (framework === 'html') {
			setCurrentCode(code)
		} else {
			setCurrentCode(
				stripCodeblocks(item.components?.[framework] ?? 'Loading...')
			)
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
			<div className='code-syntax relative rounded-lg border'>
				<div className='grid w-full grid-cols-4 rounded-t-md border-b'>
					<ul className='z-10 col-span-3 flex max-h-9 w-full overflow-x-auto overflow-y-hidden rounded-tl-lg bg-background text-center text-sm font-medium text-gray-500 dark:text-gray-400'>
						{frameworks.map((f, i) => (
							<li key={f}>
								<button
									type='button'
									onClick={() => setFramework(f)}
									className={cn(
										'inline-block w-full whitespace-nowrap border-r p-2 px-3 text-secondary-foreground',
										f === framework
											? 'bg-background'
											: 'bg-secondary hover:bg-background',
										i === 0 && 'rounded-tl-lg'
									)}
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
						<button
							type='button'
							onClick={() =>
								copyTextToClipboard(
									wrappedCode(currentCode, framework, theme ?? themes[0])
								)
							}
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
				<div className='relative rounded-b-lg bg-zinc-900'>
					<div
						className='h-[calc(100vh-354px)] max-w-[78vw] pb-8 text-sm'
						tabIndex={-1}
					>
						<Suspense fallback={<Scaffold isLoading />}>
							{/* TODO: jsx editing */}
							{code ? (
								<CodeEditor code={currentCode} framework={framework} />
							) : undefined}
						</Suspense>
					</div>
				</div>
			</div>
		</div>
	)
}
