/// <reference types="vitest" />
import eslintPlugin from '@nabla/vite-plugin-eslint'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

const inCodespace = process.env.GITHUB_CODESPACE_TOKEN !== undefined
const plugins: PluginOption[] = [eslintPlugin()]
// Don't listen on SSL in codespaces
if (!inCodespace) {
	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	plugins.push(mkcert())
}
export default defineConfig(({ mode }) => ({
	test: {
		css: false,
		include: ['src/**/__tests__/*'],
		globals: true,
		environment: 'jsdom',
		setupFiles: 'src/setupTests.ts',
		clearMocks: true,
		coverage: {
			include: ['src/**/*'],
			exclude: ['src/main.tsx'],
			thresholds: {
				'100': true
			},
			provider: 'istanbul',
			enabled: true,
			reporter: ['text', 'lcov'],
			reportsDirectory: 'coverage'
		}
	},
	server: {
		proxy: {
			'/v1': 'http://localhost:7878',
			// TODO: Currently having this proxy to /annotator, kinda lame
			'/openui': 'http://localhost:7878'
		}
	},
	plugins: [
		tsconfigPaths(),
		VitePWA(),
		react(),
		...(mode === 'test' ? [] : plugins)
	]
}))
