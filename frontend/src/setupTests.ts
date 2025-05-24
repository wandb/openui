import '@testing-library/jest-dom'
import mediaQuery from 'css-mediaquery'
import server from 'mocks/server'
import { DESKTOP_RESOLUTION_HEIGHT, DESKTOP_RESOLUTION_WIDTH } from 'testUtils'
import 'whatwg-fetch'

// Mock indexedDB
const indexedDB = {
	open: () => ({
		onupgradeneeded: undefined,
		onsuccess: undefined,
		onerror: undefined,
		result: {
			createObjectStore: () => ({
				createIndex: () => {},
				transaction: () => {}
			}),
			transaction: () => ({
				objectStore: () => ({
					put: () => {},
					get: () => {},
					getAll: () => {},
					delete: () => {}
				})
			})
		}
	})
}

Object.defineProperty(window, 'indexedDB', {
	value: indexedDB
})

beforeAll(() => {
	server.listen({ onUnhandledRequest: 'error' })

	Object.defineProperty(window, 'IS_REACT_ACT_ENVIRONMENT', {
		writable: true,
		value: true
	})
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: (query: string) => {
			function matchQuery(): boolean {
				return mediaQuery.match(query, {
					width: window.innerWidth,
					height: window.innerHeight
				})
			}

			const listeners: (() => void)[] = []
			const instance = {
				matches: matchQuery(),
				addEventListener: (_: 'change', listener: () => void): void => {
					listeners.push(listener)
				},
				removeEventListener: (_: 'change', listener: () => void): void => {
					const index = listeners.indexOf(listener)
					if (index >= 0) {
						listeners.splice(index, 1)
					}
				}
			}
			window.addEventListener('resize', () => {
				const change = matchQuery()
				if (change !== instance.matches) {
					instance.matches = change
					for (const listener of listeners) listener()
				}
			})

			return instance
		}
	})
	Object.defineProperty(window, 'scrollTo', {
		writable: true,
		value: () => {}
	})
	Object.defineProperty(window, 'resizeTo', {
		writable: true,
		value: (width: number, height: number) => {
			Object.assign(window, {
				innerWidth: width,
				innerHeight: height
			}).dispatchEvent(new Event('resize'))
		}
	})
})

beforeEach(() => {
	window.resizeTo(DESKTOP_RESOLUTION_WIDTH, DESKTOP_RESOLUTION_HEIGHT)
})

afterEach(() => {
	server.resetHandlers()
})

afterAll(() => {
	server.close()
})
