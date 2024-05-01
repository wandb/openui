import { useMediaQuery } from 'hooks'
import { PrismLight } from 'react-syntax-highlighter'
import jsx from 'react-syntax-highlighter/dist/cjs/languages/prism/jsx'
import vsLight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light'
import vsDark from 'react-syntax-highlighter/dist/cjs/styles/prism/vs-dark'
// import themeDark from 'react-syntax-highlighter/dist/cjs/styles/prism/vsc-dark-plus'

PrismLight.registerLanguage('jsx', jsx)

interface SyntaxHighlighterProps {
	language?: string | undefined
	className?: string | undefined
	PreTag?: // eslint-disable-next-line @typescript-eslint/no-explicit-any
	React.ComponentType<any> | keyof React.JSX.IntrinsicElements | undefined
	children: string[] | string
}

export default function SyntaxHighlighter(props: SyntaxHighlighterProps) {
	const darkMode = useMediaQuery('(prefers-color-scheme: dark)')
	// eslint-disable-next-line react/jsx-props-no-spreading
	return <PrismLight {...props} style={darkMode ? vsDark : vsLight} />
}

SyntaxHighlighter.defaultProps = {
	PreTag: undefined,
	className: undefined,
	language: 'jsx'
}
