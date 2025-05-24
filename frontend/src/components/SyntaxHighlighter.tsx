import { useAtomValue } from 'jotai'
import { PrismLight } from 'react-syntax-highlighter'
import jsx from 'react-syntax-highlighter/dist/cjs/languages/prism/jsx'
import { vsDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import vsLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light'
import { darkModeAtom } from '../state'
// Import themeDark from 'react-syntax-highlighter/dist/cjs/styles/prism/vsc-dark-plus'

PrismLight.registerLanguage('jsx', jsx)

interface SyntaxHighlighterProps {
	language?: string | undefined
	className?: string | undefined
	PreTag?: // eslint-disable-next-line @typescript-eslint/no-explicit-any
	React.ComponentType<any> | keyof React.JSX.IntrinsicElements | undefined
	children: string[] | string
}

export default function SyntaxHighlighter(props: SyntaxHighlighterProps) {
	const darkMode = useAtomValue(darkModeAtom)
	const defaultProps = { language: 'jsx', ...props }

	return (
		<PrismLight
			{...defaultProps}
			style={darkMode === 'dark' ? vsDark : vsLight}
		/>
	)
}
