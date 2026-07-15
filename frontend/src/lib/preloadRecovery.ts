export function installPreloadErrorRecovery(
	target: EventTarget = window,
	reload: () => void = () => window.location.reload()
): () => void {
	let reloading = false
	const handlePreloadError = (event: Event) => {
		event.preventDefault()
		if (reloading) return
		reloading = true
		reload()
	}

	target.addEventListener('vite:preloadError', handlePreloadError)
	return () =>
		target.removeEventListener('vite:preloadError', handlePreloadError)
}
