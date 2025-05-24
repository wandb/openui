import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState
} from 'react'
import type { ItemWrapper } from 'state'

const defaultInterval = 500
export function useThrottle(value: unknown, interval = defaultInterval) {
	const [throttledValue, setThrottledValue] = React.useState(value)
	const lastUpdated = React.useRef<number | null>(null)

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
		return () => {}
	}, [value, interval])

	return throttledValue
}

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

export function useHash(): [string, (newHash: string) => void] {
	const [hash, setHash] = useState(() => window.location.hash)

	const hashChangeHandler = useCallback(() => {
		setHash(window.location.hash)
	}, [])

	useEffect(() => {
		window.addEventListener('hashchange', hashChangeHandler)
		return () => {
			window.removeEventListener('hashchange', hashChangeHandler)
		}
	}, [hashChangeHandler])

	const updateHash = useCallback(
		(newHash: string) => {
			if (newHash !== hash) window.location.hash = newHash
		},
		[hash]
	)

	return [hash, updateHash]
}

export function useVersion(
	item: ItemWrapper
): [number, (newVersion: number) => void] {
	const [hash, updateHash] = useHash()
	const updateVersion = useCallback(
		(newVersion: number) =>
			newVersion < 0 ? updateHash('') : updateHash(`#v${newVersion}`),
		[updateHash]
	)
	const version = useMemo(
		() =>
			hash.includes('#v')
				? Math.min(
						Number.parseInt(hash.replace('#v', ''), 10),
						item.latestVersion
					)
				: item.latestVersion,
		[hash, item.latestVersion]
	)
	useEffect(() => {
		// Correct our hash if someone overshoots
		if (version > item.latestVersion) {
			updateVersion(item.latestVersion)
		}
	}, [version, item.latestVersion, updateVersion])

	return [version, updateVersion]
}
