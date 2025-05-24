import type { Framework } from 'state'
import { createApi, type Orientation } from 'unsplash-js'
import type { Basic } from 'unsplash-js/dist/methods/photos/types'
import type { Theme } from './themes'

const api = createApi({
	// You should replace this with your own key if you're using this in production
	// See https://unsplash.com/developers
	accessKey: '1inrzYXNOHwdgpiNEW6DQOjZzIfSp0X-zaTRMcgwhZo'
})

export interface Script {
	src: string
	text: string
	type?: string
}

export interface HTMLAndJS {
	html: string
	js: Script[]
	pureHTML: string
}

export function removeCommentNodes(element: HTMLElement) {
	try {
		// Get all child nodes of the current element
		const { childNodes } = element

		for (let i = childNodes.length - 1; i >= 0; i -= 1) {
			const child = childNodes[i]

			// If the child is a comment node, remove it
			if (child.nodeType === Node.COMMENT_NODE) {
				child.remove()
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				// If the child is an element node, search for comment nodes in its children
				removeCommentNodes(child as HTMLElement)
			}
		}
	} catch (error) {
		console.error(error)
	}
}

export function wrappedCode(code: string, framework: Framework, theme: Theme) {
	if (framework === 'html') {
		return `<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
		<script src="https://unpkg.com/unlazy@0.11.3/dist/unlazy.with-hashing.iife.js" defer init></script>
		<script type="text/javascript">
			window.tailwind.config = {
				darkMode: ['class'],
				theme: {
					extend: {
						colors: {
							border: 'hsl(var(--border))',
							input: 'hsl(var(--input))',
							ring: 'hsl(var(--ring))',
							background: 'hsl(var(--background))',
							foreground: 'hsl(var(--foreground))',
							primary: {
								DEFAULT: 'hsl(var(--primary))',
								foreground: 'hsl(var(--primary-foreground))'
							},
							secondary: {
								DEFAULT: 'hsl(var(--secondary))',
								foreground: 'hsl(var(--secondary-foreground))'
							},
							destructive: {
								DEFAULT: 'hsl(var(--destructive))',
								foreground: 'hsl(var(--destructive-foreground))'
							},
							muted: {
								DEFAULT: 'hsl(var(--muted))',
								foreground: 'hsl(var(--muted-foreground))'
							},
							accent: {
								DEFAULT: 'hsl(var(--accent))',
								foreground: 'hsl(var(--accent-foreground))'
							},
							popover: {
								DEFAULT: 'hsl(var(--popover))',
								foreground: 'hsl(var(--popover-foreground))'
							},
							card: {
								DEFAULT: 'hsl(var(--card))',
								foreground: 'hsl(var(--card-foreground))'
							},
						},
					}
				}
			}
		</script>
		<style type="text/tailwindcss">
			@layer base {
				:root {
					${Object.entries(theme.cssVars.light)
						.map(([key, value]) => `--${key}: ${value};`)
						.join('\n')}
				}
				.dark {
					${Object.entries(theme.cssVars.dark)
						.map(([key, value]) => `--${key}: ${value};`)
						.join('\n')}
				}
			}
		</style>
  </head>
  <body>
    ${code}
  </body>
</html>`
	}
	return code
}

interface UnsplashImage {
	url: string
	width: number
	height: number
	blurhash?: string
}

// TODO: consider making this persist
const CACHE = new Map<string, Basic[]>()

async function getRandomPhoto(
	image: HTMLImageElement,
	seed: number
): Promise<UnsplashImage | undefined> {
	let orientation: Orientation = 'landscape'
	let width = 500
	let height = 500
	// TODO: support color
	const dims = image.src.match(/\/(\d+)x(\d+)/)
	if (dims) {
		width = Number.parseInt(dims[1], 10)
		height = Number.parseInt(dims[2], 10)
		orientation = width > height ? 'landscape' : 'portrait'
		if (width === height) {
			orientation = 'squarish'
		}
	} else if (/\/(\d+)/.test(image.src)) {
		const match = image.src.match(/\/(\d+)/)
		width = Number.parseInt(match?.[1] ?? '500', 10)
		height = width
	}
	let results: Basic[] = CACHE.get(image.alt) ?? []
	let img: Basic | undefined
	if (results.length > 0) {
		img = results[Math.floor(seed * results.length)]
	}
	if (!img) {
		try {
			console.log(`Searching unsplash for ${image.alt} ${image.src}`)
			const data = await api.search.getPhotos({ query: image.alt, orientation })
			// TODO: maybe grab a random image from the results
			results = data.response?.results ?? []
			if (results.length > 0) {
				img = results[Math.floor(seed * results.length)]
				CACHE.set(image.alt, results)
			}
		} catch (error) {
			console.error(error)
		}
	}

	if (img) {
		const url = new URL(img.urls.regular)
		const params = new URLSearchParams(url.search)
		params.set('w', width.toString())
		params.set('h', height.toString())
		params.set('fit', 'crop')
		url.search = params.toString()

		return {
			url: url.toString(),
			width,
			height,
			blurhash: img.blur_hash ?? undefined
		}
	}
	return undefined
}

function deUnsplashImages(images: HTMLCollectionOf<HTMLImageElement>) {
	// TODO: not sure if we really want this...
	for (const image of images) {
		// TODO: consider an escape hatch
		delete image.dataset.src
		delete image.dataset.blurhash
		image.removeAttribute('width')
		image.removeAttribute('height')
		image.removeAttribute('loading')
	}
}

async function unsplashImages(
	images: HTMLCollectionOf<HTMLImageElement>,
	seed: number
) {
	const urlPromises = []
	let idx = 0
	for (const image of images) {
		urlPromises.push(getRandomPhoto(image, seed))
		idx += 1
		if (idx > 10) {
			console.warn('Only unsplashing the first 10 images')
			break
		}
	}
	const urls = await Promise.all(urlPromises)
	idx = 0
	for (const image of images) {
		if (!image.src.includes('.svg')) {
			const meta = urls[idx]
			if (meta) {
				// TODO: is this writing over stuff twice?
				image.dataset.src = meta.url
				image.width = meta.width
				image.height = meta.height
				image.loading = 'lazy'
				if (meta.blurhash) {
					image.dataset.blurhash = meta.blurhash
				}
			}
		}
		idx += 1
		if (idx > 10) {
			break
		}
	}
}

export function parseJs(dom: Document): Script[] {
	const scripts = dom.querySelectorAll('script')
	const scriptObs: Script[] = []
	for (const script of scripts) {
		scriptObs.push({
			text: script.innerHTML,
			src: script.src,
			type: script.type
		})
	}
	return scriptObs
}

export function escapeHTML(str: string) {
	const div = document.createElement('div')
	div.append(document.createTextNode(str))
	return div.innerHTML
}

export async function parseHTML(
	html: string,
	unsplash = false,
	seed = Math.random()
): Promise<HTMLAndJS> {
	const parser = new DOMParser()
	const dom = parser.parseFromString(html, 'text/html')
	removeCommentNodes(dom.body)
	if (unsplash) {
		console.log(`Unsplashing ${dom.images.length} images`)
		await unsplashImages(dom.images, seed)
	} else {
		// TODO: make sure this is called and setting the appropriate state
		deUnsplashImages(dom.images)
	}
	return {
		html: dom.body.innerHTML,
		js: parseJs(dom),
		pureHTML: html
	}
}
