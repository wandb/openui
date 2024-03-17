import { useThrottle } from 'hooks'
import type { Plugin } from 'prettier'
// TODO: couldn't get this to import dynamically
import prettierPluginEstree from 'prettier/plugins/estree'
import { Suspense, lazy, useEffect, useState } from 'react'
import Editor from 'react-simple-code-editor'
import type { Framework } from 'state'

const SyntaxHighlighter = lazy(async () => import('./SyntaxHighlighter'))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EmptyDiv(props: { children: React.ReactNode }) {
	const { children } = props
	return children
}

export default function CodeEditor({
	code,
	framework
}: {
	code: string
	framework: Framework
}) {
	const tabWidth = 2
	const printWidth = 100
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [codeState, setCodeState] = useState(code)
	const [formattedCode, setFormattedCode] = useState<string>(codeState)
	const throttledCode = useThrottle(code)

	useEffect(() => {
		setFormattedCode(code)
	}, [code])

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
			setFormattedCode(code)
		})
	}, [throttledCode, code, framework])

	return (
		<Editor
			value={formattedCode}
			onValueChange={c => setFormattedCode(c)}
			highlight={c => (
				<Suspense fallback={<code>{c}</code>}>
					<SyntaxHighlighter PreTag={EmptyDiv} language='jsx'>
						{c}
					</SyntaxHighlighter>
				</Suspense>
			)}
			padding={20}
			textareaClassName='focus:ring-0 focus:ring-offset-0 focus:outline-none'
			style={{
				fontFamily: 'monospace',
				fontSize: '12px'
			}}
		/>
	)
}
