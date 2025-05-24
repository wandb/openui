import { atom, useAtom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import { parseHTML, type HTMLAndJS } from 'lib/html'
import { parseMarkdown } from 'lib/markdown'

export type Framework =
	| 'angular'
	| 'html'
	| 'jsx'
	| 'preact'
	| 'react'
	| 'streamlit'
	| 'svelte'
	| 'vue'
	| 'web component'

export const FRAMEWORKS: Framework[] = [
	'preact',
	'react',
	'svelte',
	'vue',
	'web component',
	'angular',
	'streamlit'
]

export type FrameworkMap = {
	[K in Framework]?: string
}

export interface HistoryItem {
	// TODO: Deprecate
	prompt: string
	createdAt?: Date
	prompts?: string[]
	emoji?: string
	name?: string
	markdown?: string
	// TODO: Deprecate
	react?: string
	components?: FrameworkMap
	html?: string
	comments?: string[]
}

interface Chapter {
	version: string
	prompt: string
	markdown: string
}

// For debugging we set _chapters
declare global {
	interface Window {
		_chapters: Chapter[]
	}
}

// TODO: add image
export class ItemWrapper {
	public readonly item: HistoryItem

	private readonly setItem: (item: HistoryItem) => void

	private readonly saveHistory?: () => void

	private readonly pureHTMLMemo: (string | undefined)[]

	public chapters: Chapter[]

	public id?: string

	public readonly name: string

	public readonly emoji: string

	public readonly createdAt: Date

	public constructor(
		item: HistoryItem,
		setItem: (item: HistoryItem) => void,
		saveHistory?: () => void
	) {
		this.item = item
		this.setItem = setItem
		this.saveHistory = saveHistory
		this.name = item.name ?? 'pending'
		this.emoji = item.emoji ?? '❓'
		this.createdAt = item.createdAt ?? new Date()
		this.chapters = this.parseChapters()
		this.pureHTMLMemo = Array.from({ length: this.chapters.length })
	}

	private parseChapters(): Chapter[] {
		if (this.item.markdown) {
			const chapters = []
			let idx = 0
			let versionOffset = 0
			// TODO: this is lame
			let lastIdx = 0
			let { prompt } = this.item
			const { markdown } = this.item
			let editedVersion: string | undefined
			for (const chapter of markdown.split('---')) {
				if (chapter.split('\n').some(l => l.trim().startsWith('version:'))) {
					editedVersion = chapter
						.split('\n')
						.find(l => l.trim().startsWith('version: '))
						?.replace(/\s*version: /, '')
					if (editedVersion?.includes('.') && idx !== lastIdx) {
						// TODO: not sure why this is getting called twice in the same iteration but it is
						lastIdx = idx
						versionOffset += 1
					}
				}
				if (
					chapter
						.split('\n')
						.slice(0, 4)
						.some(l => /^(name:|prompt:)/.test(l.trim()))
				) {
					const newPrompt = chapter
						.split('\n')
						.find(l => l.trim().startsWith('prompt: '))
					if (newPrompt) {
						prompt = newPrompt.replace(/\s*prompt: /, '')
					}
				} else if (chapter.trim() !== '') {
					/* Console.log(
						'Pushing version',
						idx,
						versionOffset,
						editedVersion ?? idx - versionOffset
					) */
					chapters.push({
						version: `${editedVersion ?? idx - versionOffset}`,
						prompt,
						markdown: chapter
					})
					editedVersion = undefined
					idx += 1
				}
			}
			// TODO: not sure if we really want this
			if (chapters.length === 0) {
				chapters.push({
					version: '0',
					prompt,
					markdown: markdown.split('---').at(-1) ?? ''
				})
			}

			window._chapters = chapters
			return chapters
		}
		return []
	}

	public chaptersToMarkdown(): string {
		let versionOffset = 0
		let lastVersionStr = '0'
		return this.chapters
			.map((c, i) => {
				let markdown = ''
				let versionStr = c.version
				if (versionStr.includes('.')) {
					versionOffset += 1
					if (lastVersionStr.includes('.')) {
						versionStr = (Number.parseFloat(lastVersionStr) + 0.1).toFixed(1)
					}
					lastVersionStr = versionStr
				} else {
					versionStr = (i - versionOffset).toString()
				}
				markdown += `---\n`
				if (i === 0) {
					markdown += `name: ${this.name}\n`
					markdown += `emoji: ${this.emoji}\n`
				}
				markdown += `version: ${versionStr}\n`
				markdown += `prompt: ${this.prompt(i)}\n`
				markdown += `---\n`
				markdown += c.markdown
				return markdown
			})
			.join('\n')
	}

	// TODO: change to latestIdx
	public get latestVersion(): number {
		return Math.max(this.chapters.length - 1, 0)
	}

	public get latestPrompt(): string {
		return this.prompt(this.latestVersion) ?? ''
	}

	public get markdown(): string {
		return this.item.markdown ?? ''
	}

	// TODO: not sure if this is working
	public version(idx = 0): string {
		const idxOffset = this.chapters.filter(
			(c, i) => i <= idx && c.version.indexOf('.') > 0
		).length
		return this.chapters[idx]?.version ?? `${idx - idxOffset}`
	}

	public prompt(idx = 0): string | undefined {
		if (idx > this.latestVersion) {
			return undefined
		}
		return this.chapters[idx]?.prompt ?? this.item.prompt
	}

	public pureHTML(idx = 0, rendering = false) {
		if (this.pureHTMLMemo[idx] !== undefined) {
			return this.pureHTMLMemo[idx]
		}
		const { html } = parseMarkdown(
			this.chapters[idx]?.markdown ??
				'<h1 class="text-red-800">Unknown Error, unable to parse LLM Response</h1>',
			this.version(idx),
			rendering
		)
		if (!rendering) {
			this.pureHTMLMemo[idx] = html
		}
		return html
	}

	public async html(
		idx = 0,
		unsplash = false,
		rendering = false
	): Promise<HTMLAndJS | undefined> {
		if (idx > this.latestVersion) {
			return undefined
		}
		let html: string | undefined
		if (this.pureHTMLMemo[idx] === undefined) {
			;({ html } = parseMarkdown(
				this.chapters[idx]?.markdown ?? '',
				this.version(idx),
				rendering
			))
		} else {
			html = this.pureHTMLMemo[idx]
		}

		if (html) {
			return parseHTML(html, unsplash)
		}

		return undefined
	}

	public deleteChapter(versionIdx: number): string {
		this.chapters = this.chapters.filter((c, i) => i !== versionIdx)
		const markdown = this.chaptersToMarkdown()
		this.setItem({
			...this.item,
			markdown
		})
		return markdown
	}

	private withFrontmatter(
		html: string,
		prompt: string,
		version: string
	): string {
		return `\n\n---\nprompt: ${prompt}\nversion: ${version}\n---\n\n${html}\n`
	}

	public editChapter(html: string, versionIdx: number): number {
		const { latestPrompt, chapters, item, saveHistory } = this
		let newVersionIdx = versionIdx
		const version = this.version(versionIdx)
		const editing = version.indexOf('.') > 0
		let versionString = editing ? version : `${version}.1`

		if (chapters.length === 0) {
			return 0
		}
		let markdown = ''
		// TODO: decide if we want to be smart enough to edit the next item in line or not
		if (editing) {
			const prompt = this.prompt(versionIdx) ?? latestPrompt
			this.chapters = [
				...chapters.slice(0, versionIdx),
				{
					version: versionString,
					prompt,
					markdown: this.withFrontmatter(html, prompt, versionString)
				},
				...chapters.slice(versionIdx + 1)
			]
			markdown = this.chaptersToMarkdown()
		} else {
			newVersionIdx = chapters.findIndex(
				(ch, i) => i > versionIdx && !ch.version.includes('.')
			)
			if (newVersionIdx === -1) {
				newVersionIdx = chapters.length
			}
			// TODO: this is likely messed up, was causing out of order numbers
			if (newVersionIdx > 0) {
				const versionBump =
					Number.parseFloat(chapters[newVersionIdx - 1].version) + 0.1
				versionString = versionBump.toFixed(1)
			}
			const prompt = this.prompt(versionIdx) ?? ''
			this.chapters = [
				...chapters.slice(0, newVersionIdx),
				{
					version: versionString,
					prompt,
					markdown: this.withFrontmatter(html, prompt, versionString)
				},
				...chapters.slice(newVersionIdx)
			]
			markdown = this.chaptersToMarkdown()
		}
		this.setItem({
			...item,
			markdown
		})
		if (saveHistory) {
			saveHistory()
		}
		return newVersionIdx
	}
}

let savedHistValue
if (typeof localStorage !== 'undefined') {
	savedHistValue = localStorage.getItem('serializedHistory')
}
interface SavedHistory {
	history: string[]
	historyMap: Record<string, HistoryItem | undefined>
}
type Callback = (value: HistoryItem) => HistoryItem
const savedHist: SavedHistory = savedHistValue
	? (JSON.parse(savedHistValue) as SavedHistory)
	: { history: [], historyMap: {} }
// Cast createdAt load markdown and html
for (const k of Object.keys(savedHist.historyMap)) {
	const item = savedHist.historyMap[k] as HistoryItem
	if (item.createdAt) {
		item.createdAt = new Date(item.createdAt)
	}
	if (!item.html) {
		item.html = localStorage.getItem(`${k}.html`) ?? undefined
	}
	if (!item.markdown) {
		item.markdown = localStorage.getItem(`${k}.md`) ?? undefined
	}
}

interface Param {
	prompt?: string
	id: string
	createdAt?: Date
	markdown?: string
}
export const historyIdsAtom = atom<string[]>(savedHist.history)
export const historyAtomFamily = atomFamily(
	(param: Param) => {
		const hist: HistoryItem = savedHist.historyMap[param.id] ?? { prompt: '' }
		const histAtom = atom<HistoryItem>({
			...hist,
			prompt: param.prompt ?? hist.prompt,
			createdAt: param.createdAt ?? hist.createdAt
		})
		return atom(
			get => get(histAtom),
			(get, set, newHist: Callback | HistoryItem) => {
				if (param.id === 'new') {
					throw new Error("Can't set state for id: new")
				}
				set(histAtom, newHist)
				/* TODO: this is a bit silly and can probably go away, I thought it would be cool
				// to write stuff to the OPFS file system but it's all in localStorage anyway...
				const item = get(histAtom)
				if (item.name && item.markdown) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call
					;(async function save() {
						const opfsRoot = await navigator.storage.getDirectory()
						const components = await opfsRoot.getDirectoryHandle('components', {
							create: true
						})
						const dir = await components.getDirectoryHandle(param.id, {
							create: true
						})
						const file = await dir.getFileHandle('docs.md', {
							create: true
						})
						const writable = await file.createWritable()
						await writable.write(item.markdown as string)
						await writable.close()
						if (item.html) {
							const htmlFile = await dir.getFileHandle('index.html', {
								create: true
							})
							const htmlWritable = await htmlFile.createWritable()
							await htmlWritable.write(item.html)
							await htmlWritable.close()
						}
						if (item.components !== undefined) {
							const comps = Object.keys(item.components).map(async type => {
								const htmlFile = await dir.getFileHandle(`${type}.tsx`, {
									create: true
								})
								// Annoying I have to do this to make TS happy
								if (item.components !== undefined) {
									const comp = item.components[type as Framework] as string
									const htmlWritable = await htmlFile.createWritable()
									await htmlWritable.write(comp)
									await htmlWritable.close()
								}
							})
							await Promise.all(comps)
						}
					})().catch((error: Error) => console.error(error))
				} */
			}
		)
	},
	(a: Param, b: Param) => a.id === b.id
)

type Action =
	| { type: 'deserialize'; value: string }
	| { type: 'serialize'; callback: (value: string) => void }

export const serializeHistoryAtom = atom(
	undefined,
	(get, set, action: Action) => {
		if (action.type === 'serialize') {
			const history = get(historyIdsAtom)
			const historyMap: Record<string, HistoryItem> = {}
			for (const id of history) {
				historyMap[id] = get(historyAtomFamily({ id }))
			}
			const obj = {
				history,
				historyMap
			}
			action.callback(JSON.stringify(obj))
		} else {
			const obj = JSON.parse(action.value) as SavedHistory
			for (const id of obj.history) {
				const item = obj.historyMap[id]
				if (item) {
					/* Hmmmm
					for (const framework of Object.keys(item.components ?? {})) {
						if (item.components) {
							item.components[framework as Framework] = atom(item.components[framework as Framework])
						}
					} */
					set(historyAtomFamily({ id, ...item }), item)
				}
			}
			set(historyIdsAtom, obj.history)
		}
	}
)

export const useSaveHistory = () => {
	const [, dispatch] = useAtom(serializeHistoryAtom)
	return () => {
		dispatch({
			type: 'serialize',
			callback: value => {
				let safeValue = value
				const parsed = JSON.parse(value) as SavedHistory
				// TODO: get rid of this lameness
				if (value.length > 4_000_000) {
					console.warn('History too large, removing largest payload')
					let largestKey = ''
					let largestLen = 0
					for (const key of Object.keys(parsed.historyMap)) {
						const html = parsed.historyMap[key]?.html ?? ''
						if (html.length > largestLen) {
							largestLen = html.length
							largestKey = key
						}
					}
					if (parsed.historyMap[largestKey]) {
						delete parsed.historyMap[largestKey]
						parsed.history = parsed.history.filter(h => h !== largestKey)
					}
					safeValue = JSON.stringify(parsed)
				}
				// TODO: move this shit to indexed DB!!!
				for (const key of Object.keys(parsed.historyMap)) {
					const item = parsed.historyMap[key] as HistoryItem
					const html = item.html ?? ''
					if (html !== '') {
						delete item.html
						try {
							localStorage.setItem(`${key}.html`, html)
						} catch (error) {
							console.error('Error saving HTML', error)
						}
					}
					const markdown = item.markdown ?? ''
					if (markdown !== '') {
						delete item.markdown
						try {
							localStorage.setItem(`${key}.md`, markdown)
						} catch (error) {
							console.error('Error saving markdown', error)
						}
					}
				}
				console.log('Saving history', safeValue)
				try {
					localStorage.setItem('serializedHistory', safeValue)
				} catch (error) {
					console.error('Error saving history', error)
				}
			}
		})
	}
}
