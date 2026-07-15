import { describe, expect, test, vi } from 'vitest'

import { installPreloadErrorRecovery } from 'lib/preloadRecovery'

describe('installPreloadErrorRecovery', () => {
	test('prevents a stale dynamic import error and reloads once', () => {
		const target = new EventTarget()
		const reload = vi.fn()
		const uninstall = installPreloadErrorRecovery(target, reload)
		const first = new Event('vite:preloadError', { cancelable: true })
		const second = new Event('vite:preloadError', { cancelable: true })

		target.dispatchEvent(first)
		target.dispatchEvent(second)

		expect(first.defaultPrevented).toBe(true)
		expect(second.defaultPrevented).toBe(true)
		expect(reload).toHaveBeenCalledTimes(1)

		uninstall()
	})
})
