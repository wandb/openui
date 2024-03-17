import type { ErrorInfo, ReactNode } from 'react'
import React from 'react'

interface ErrorBoundaryProps {
	renderError: (e: Error) => JSX.Element
	onError?: (e: Error) => void
	children?: ReactNode
}

interface ErrorBoundaryState {
	error?: Error
}

export default class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	public static getDerivedStateFromError(error: Error) {
		// Update state so the next render will show the fallback UI.
		return { error }
	}

	public static defaultProps = {
		children: undefined,
		onError: undefined
	}

	public state: ErrorBoundaryState = { error: undefined }

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('Encountered ErrorBoundary:', error, errorInfo)
		const { onError } = this.props
		onError?.(error)
	}

	public render() {
		const { error } = this.state
		if (error !== undefined) {
			const { renderError } = this.props
			return renderError(error)
		}
		const { children } = this.props
		return children
	}
}
