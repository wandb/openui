import { atom, useAtom } from 'jotai'
import { atomFamily } from 'jotai/utils'

export type Framework =
	| 'html'
	| 'jsx'
	| 'preact'
	| 'react'
	| 'svelte'
	| 'vue'
	| 'web component'

export const FRAMEWORKS: Framework[] = ['preact', 'react', 'svelte', 'vue', 'web component'];

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
// cast createdAt load markdown and html
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
					/* hmmmm
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
						// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
						delete parsed.historyMap[largestKey]
						parsed.history = parsed.history.filter(h => h !== largestKey)
					}
					safeValue = JSON.stringify(parsed)
				}
				for (const key of Object.keys(parsed.historyMap)) {
					const item = parsed.historyMap[key] as HistoryItem
					const html = item.html ?? ''
					if (html !== '') {
						delete item.html
						localStorage.setItem(`${key}.html`, html)
					}
					const markdown = item.markdown ?? ''
					if (markdown !== '') {
						delete item.markdown
						localStorage.setItem(`${key}.md`, markdown)
					}
				}
				localStorage.setItem('serializedHistory', safeValue)
			}
		})
	}
}
