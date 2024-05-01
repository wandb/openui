import React, { useLayoutEffect, useState } from 'react'

const defaultInterval = 500
export function useThrottle(value: unknown, interval = defaultInterval) {
	const [throttledValue, setThrottledValue] = React.useState(value)
	const lastUpdated = React.useRef<number | null>(null)

	// eslint-disable-next-line consistent-return
	React.useEffect(() => {
		const now = Date.now()

		if (lastUpdated.current && now >= lastUpdated.current + interval) {
			lastUpdated.current = now
			setThrottledValue(value)
		} else {
			const id = window.setTimeout(() => {
				lastUpdated.current = now
				setThrottledValue(value)
			}, interval)

			return () => window.clearTimeout(id)
		}
	}, [value, interval])

	return throttledValue
}

// eslint-disable-next-line import/prefer-default-export
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => matchMedia(query).matches)

	useLayoutEffect(() => {
		const mediaQuery = matchMedia(query)

		function onMediaQueryChange(): void {
			setMatches(mediaQuery.matches)
		}

		mediaQuery.addEventListener('change', onMediaQueryChange)

		return (): void => {
			mediaQuery.removeEventListener('change', onMediaQueryChange)
		}
	}, [query])

	return matches
}
