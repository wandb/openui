/**
 * Custom Vitest environment: jsdom with native AbortController/AbortSignal restored.
 *
 * Root cause of App test failure
 * ─────────────────────────────
 * jsdom replaces globalThis.AbortController (and AbortSignal) with its own
 * WebIDL-generated classes when Vitest calls `populateGlobal`.  Node.js's
 * bundled undici captures the *native* AbortSignal at its own startup—before
 * jsdom runs—and validates every Request signal with:
 *
 *   FunctionPrototypeSymbolHasInstance(capturedNativeAbortSignal, signal)
 *   // equivalent to:  signal instanceof <native AbortSignal>
 *
 * React Router's createBrowserRouter calls `new AbortController()` during
 * navigation, which—in the jsdom context—produces a jsdom AbortSignal.  When
 * MSW's recordRawHeaders proxy intercepts `new Request(url, { signal })` and
 * Reflect.constructs the native undici Request, undici rejects the jsdom signal
 * with "TypeError: RequestInit: Expected signal … to be an instance of
 * AbortSignal."  This error aborts the navigation, so the AI page never renders
 * and Testing Library cannot find role="navigation".
 *
 * Fix
 * ───
 * Capture the native AbortController/AbortSignal *before* jsdom's setup runs,
 * then write them back through Vitest's populateGlobal setter so that all code
 * running in the test uses native signals that pass undici's instanceof check.
 */

import { builtinEnvironments } from 'vitest/environments'

export default {
	...builtinEnvironments.jsdom,
	name: 'custom-jsdom',

	async setup(global: typeof globalThis, options: Record<string, unknown>) {
		// 1. Save the native implementations before jsdom overwrites them.
		//    At this point the test-worker global is still a plain Node.js
		//    global, so these are the classes undici already captured.
		const NativeAbortController = global.AbortController
		const NativeAbortSignal = global.AbortSignal

		// 2. Run the standard jsdom environment setup.
		//    Internally this calls Vitest's populateGlobal(), which installs
		//    jsdom's AbortController/AbortSignal via configurable getters:
		//
		//      Object.defineProperty(global, 'AbortController', {
		//        get() { return overrideObject.has(key) ? overrideObject.get(key) : win[key] },
		//        set(v) { overrideObject.set(key, v) },
		//        configurable: true,
		//      })
		const env = await builtinEnvironments.jsdom.setup(global, options)

		// 3. Re-install the native implementations via the setter above.
		//    overrideObject.set() takes precedence over win[key] in the getter,
		//    so every subsequent `new AbortController()` in test code returns a
		//    native instance whose .signal passes undici's instanceof check.
		global.AbortController = NativeAbortController
		global.AbortSignal = NativeAbortSignal

		return env
	}
}
