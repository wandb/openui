import type { Monaco } from '@monaco-editor/react'
import Editor, { loader } from '@monaco-editor/react'
import { useThrottle, useVersion } from 'hooks'
import { useAtom, useAtomValue } from 'jotai'
import anysphere from 'lib/anysphere'
import { mimeTypeAndExtension } from 'lib/utils'
import type { Position, editor } from 'monaco-editor'
import { configureMonacoTailwindcss, tailwindcssData } from 'monaco-tailwindcss'
import type { Plugin } from 'prettier'
import prettierPluginEstree from 'prettier/plugins/estree'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
	ItemWrapper,
	historyAtomFamily,
	uiStateAtom,
	useSaveHistory,
	type Framework
} from 'state'
import CurrentUiContext from './CurrentUiContext'

import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/editor/editor.all'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
// We only pull in the languages we use to avoid bloating the bundle
// Import * as monaco from 'monaco-editor'

// The worker loading logic is hooked up in vite.config.js
// TODO: consider adding a custom copilot like:
// https://github.com/microsoft/custom-monaco-copilot-demo/blob/main/src/components/Editor/CodeSuggester.js
monaco.languages.css.cssDefaults.setOptions({
	data: {
		dataProviders: {
			tailwindcssData
		}
	}
})
configureMonacoTailwindcss(monaco, {
	tailwindConfig: {
		darkMode: ['class'],
		theme: {
			extend: {
				colors: {
					border: 'hsl(var(--border))',
					input: 'hsl(var(--input))',
					ring: 'hsl(var(--ring))',
					background: 'hsl(var(--background))',
					foreground: 'hsl(var(--foreground))',
					primary: {
						DEFAULT: 'hsl(var(--primary))',
						foreground: 'hsl(var(--primary-foreground))'
					},
					secondary: {
						DEFAULT: 'hsl(var(--secondary))',
						foreground: 'hsl(var(--secondary-foreground))'
					},
					destructive: {
						DEFAULT: 'hsl(var(--destructive))',
						foreground: 'hsl(var(--destructive-foreground))'
					},
					muted: {
						DEFAULT: 'hsl(var(--muted))',
						foreground: 'hsl(var(--muted-foreground))'
					},
					accent: {
						DEFAULT: 'hsl(var(--accent))',
						foreground: 'hsl(var(--accent-foreground))'
					},
					popover: {
						DEFAULT: 'hsl(var(--popover))',
						foreground: 'hsl(var(--popover-foreground))'
					},
					card: {
						DEFAULT: 'hsl(var(--card))',
						foreground: 'hsl(var(--card-foreground))'
					}
				}
			}
		}
	}
})
loader.config({ monaco })

loader.init().catch((error: unknown) => {
	console.error('Unable to initialize monaco', error)
})

const handleEditorBeforeMount = (m: Monaco) => {
	anysphere.base = 'vs-dark'
	// @ts-expect-error - anysphere is not a valid theme
	m.editor.defineTheme('openui', anysphere)
}

export default function CodeEditor({
	code,
	framework
}: {
	code: string
	framework: Framework
}) {
	const tabWidth = 2
	const printWidth = 200
	const params = useParams()
	const id = params.id ?? 'new'
	const uiContext = useContext(CurrentUiContext)
	const [readOnly, setReadOnly] = useState(framework !== 'html')
	const editor = useRef<editor.IStandaloneCodeEditor>()

	const [checkResumePos, setCheckResumePos] = useState<Position | undefined>()
	const [formattedCode, setFormattedCode] = useState<string>('')
	const [bufferedCode, setBufferedCode] = useState<string>('')
	const bufferTimer = useRef<NodeJS.Timeout>()
	const [editing, setEditing] = useState(false)
	const throttledCode = useThrottle(code)

	const saveHistory = useSaveHistory()
	const [rawItem, setRawItem] = useAtom(historyAtomFamily({ id }))
	const uiState = useAtomValue(uiStateAtom)
	const item = useMemo(
		() => new ItemWrapper(rawItem, setRawItem, saveHistory),
		[rawItem, setRawItem, saveHistory]
	)
	const [versionIdx, setVersionIdx] = useVersion(item)

	useEffect(() => {
		if (checkResumePos) {
			const curVersion = item.version(versionIdx)
			if (!curVersion.includes('.')) {
				const newVersionIdx = item.editChapter(formattedCode, versionIdx)
				setVersionIdx(newVersionIdx)
				// TODO: the cursor advances funky after one edit :(
				setTimeout(() => {
					editor.current?.setPosition(checkResumePos)
				}, 100)
			}
			setCheckResumePos(undefined)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [checkResumePos, setCheckResumePos, versionIdx, setVersionIdx])

	const handleEditorDidMount = (e: editor.IStandaloneCodeEditor, m: Monaco) => {
		m.editor.setTheme('openui')
		editor.current = e
		// This ensures we create a new version and maintain cursor position when
		// Editing a non-point version
		let position: Position | undefined
		let fixPosition = false
		e.onDidChangeModelContent(() => {
			if (position) {
				// E.setPosition(position)
				position = undefined
			}
		})
		e.onDidChangeCursorPosition(pos => {
			// TODO: rescroll the editor as well
			if (fixPosition) {
				position = pos.position
				fixPosition = false
				setCheckResumePos(position)
			}
		})
		e.onDidFocusEditorWidget(() => {
			fixPosition = true
		})
		editor.current.setValue(formattedCode.trim())
	}

	useEffect(() => {
		setReadOnly(framework !== 'html')
	}, [framework])

	const path = useMemo(() => {
		const [ext] = mimeTypeAndExtension(framework)
		return `${id}.${versionIdx}${ext}`
	}, [id, versionIdx, framework])

	useEffect(() => {
		setBufferedCode('')
		setEditing(false)
	}, [path])

	useEffect(() => {
		clearTimeout(bufferTimer.current)
		if (bufferedCode !== '') {
			bufferTimer.current = setTimeout(() => {
				uiContext.emit('ui-state', { editedHTML: bufferedCode })
				item.editChapter(bufferedCode, versionIdx)
			}, 2000)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bufferedCode, versionIdx])

	useEffect(() => {
		// TODO: this is busted in weird ways
		if (editor.current && !editing) {
			editor.current.setValue(formattedCode.trim())
		}
	}, [uiState.rendering, editing, formattedCode, path])

	// TODO: decide if we want to format code
	useEffect(() => {
		const format = async () => {
			const prettier = await import('prettier/standalone')
			const prettierPluginHtml = await import('prettier/plugins/html')
			const plugins: Plugin[] = [prettierPluginHtml]
			if (framework !== 'html') {
				const prettierPluginBabel = await import('prettier/plugins/babel')
				plugins.unshift(prettierPluginBabel)
				plugins.unshift(prettierPluginEstree)
			}

			const formatted = await prettier.format(code, {
				plugins,
				parser: framework === 'html' ? 'html' : 'babel',
				semi: false,
				singleQuote: true,
				trailingComma: 'all',
				jsxBracketSameLine: true,
				tabWidth,
				printWidth
			})
			setFormattedCode(formatted)
		}
		format().catch(() => {
			console.warn('Unable to format code')
			setFormattedCode(code)
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [throttledCode, framework])
	// TODO: not sure if key is the best idea here...
	return (
		<Editor
			key={path}
			defaultValue={formattedCode.trim()}
			path={path}
			options={{
				readOnly,
				lineNumbers: 'off',
				minimap: {
					enabled: false
				},
				overviewRulerLanes: 0,
				scrollBeyondLastLine: false
				// FixedOverflowWidgets: true,  // Made editing / selecting text shitty, but fixes the overflow issue
			}}
			className='h-[calc(100vh-364px)] pt-2'
			beforeMount={handleEditorBeforeMount}
			onMount={handleEditorDidMount}
			onChange={c => {
				if (
					c &&
					framework === 'html' &&
					!uiState.rendering &&
					c !== formattedCode.trim()
				) {
					console.log('Edit mode enabled for code editor')
					setEditing(true)
					setBufferedCode(c)
				}
			}}
		/>
	)
}
