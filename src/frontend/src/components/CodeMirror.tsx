import { javascript } from '@codemirror/lang-javascript'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import type CodeMirror from '@uiw/react-codemirror'
import { useCodeMirror } from '@uiw/react-codemirror'
import { useThrottle } from 'hooks'
import type { Plugin } from 'prettier'
import prettierPluginBabel from 'prettier/plugins/babel'
import prettierPluginEstree from 'prettier/plugins/estree'
import prettierPluginHtml from 'prettier/plugins/html'
import * as prettier from 'prettier/standalone'
import { forwardRef, useEffect, useRef, useState } from 'react'
import type { Framework } from 'state'

// TODO: may not need forwardRef
const mdExt = markdown({ base: markdownLanguage, codeLanguages: languages })
const extensions = [javascript({ jsx: true }), mdExt]
const Editor = forwardRef<
	React.ElementRef<typeof CodeMirror>,
	React.ComponentPropsWithoutRef<typeof CodeMirror> & {
		code?: string
		framework: Framework
	}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
>(({ code, framework, ...props }, ref) => {
	const tabWidth = 2
	const printWidth = 100
	const [formattedCode, setFormattedCode] = useState<string>(code ?? '')
	const throttledCode = useThrottle(formattedCode)

	useEffect(() => {
		setFormattedCode(code ?? '')
	}, [code])

	useEffect(() => {
		const format = async () => {
			const plugins: Plugin[] = [prettierPluginHtml]
			if (framework !== 'html') {
				plugins.unshift(prettierPluginEstree)
				plugins.unshift(prettierPluginBabel)
			}

			const formatted = await prettier.format(code ?? '', {
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
			setFormattedCode(code ?? '')
		})
	}, [throttledCode, code, framework])

	const editor = useRef<HTMLDivElement>(null)
	const { setContainer } = useCodeMirror({
		container: editor.current,
		theme: vscodeDark,
		extensions: ['html', 'jsx'].includes(framework) ? extensions : [mdExt],
		value: formattedCode,
		...props
	})
	useEffect(() => {
		if (editor.current) {
			setContainer(editor.current)
		}
	}, [setContainer])

	return <div className='max-h-[20vh] min-h-[20vh]' ref={editor} />
})
Editor.displayName = 'Editor'
Editor.defaultProps = {
	code: ''
}
export default Editor
