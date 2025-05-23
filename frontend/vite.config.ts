/// <reference types="vitest" />
import eslintPlugin from '@nabla/vite-plugin-eslint'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import { defineConfig } from 'vite'
import mkcert from 'vite-plugin-mkcert'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'
import { VitePWA } from 'vite-plugin-pwa'
import tsconfigPaths from 'vite-tsconfig-paths'

// LAME, see: https://github.com/vdesjs/vite-plugin-monaco-editor/issues/21
const isObjectWithDefaultFunction = (
	module: unknown
): module is { default: typeof monacoEditorPluginModule } =>
	module != undefined &&
	typeof module === 'object' &&
	'default' in module &&
	typeof module.default === 'function'

const monacoEditorPlugin = isObjectWithDefaultFunction(monacoEditorPluginModule)
	? monacoEditorPluginModule.default
	: monacoEditorPluginModule

const inCodespace = process.env.GITHUB_CODESPACE_TOKEN !== undefined
const plugins: PluginOption[] = [eslintPlugin()]
// Don't listen on SSL in codespaces
if (!inCodespace) {
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
		VitePWA({
			registerType: 'autoUpdate',
			workbox: {
				maximumFileSizeToCacheInBytes: 4000000,
				globIgnores: ['**/annotator/**', '**/ts.worker.bundle.js'],
				navigateFallbackDenylist: [/\/openui\/.*/, /\/v1\/.*/]
			},
			manifest: {
				name: 'OpenUI by Weights & Biases',
				short_name: 'OpenUI',
				display: 'standalone',
				background_color: '#000000',
				theme_color: '#15abbc',
				icons: [
					{
						src: '/android-chrome-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/android-chrome-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				],
				start_url: '/ai?app=pwa'
			}
		}),
		monacoEditorPlugin({
			customWorkers: [
				{ label: 'tailwindcss', entry: 'monaco-tailwindcss/tailwindcss.worker' }
			]
		}),
		react({
			babel: {
				presets: ['jotai/babel/preset']
			}
		}),
		...(mode === 'test' ? [] : plugins)
	]
}))
