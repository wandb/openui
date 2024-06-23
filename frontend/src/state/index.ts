import type { SessionData } from 'api/openui'
import { atom } from 'jotai'
import { MiniDb } from 'jotai-minidb'
import { atomWithStorage } from 'jotai/utils'
import type { Framework } from './atoms/history'

export * from './atoms/history'
export * from './atoms/prompts'
export * from './atoms/ui'

export interface Image {
	url: string
	width: number
	height: number
	createdAt: Date
}
export const imageDB = new MiniDb<Image>({ name: 'images' })
export const historySidebarStateAtom = atom<'closed' | 'history' | 'versions'>(
	'closed'
)
export const screenshotAtom = atom('')
export const facetsAtom = atomWithStorage<string[]>('facets', [])
export const commentsAtom = atom<string[]>([])
const theme = undefined
export const uiThemeAtom = atomWithStorage<string | undefined>('uiTheme', theme)
export const darkModeAtom = atomWithStorage<string>('darkMode', 'system')
export const beastModeAtom = atom(false)
export const draggingAtom = atom(false)
export const inspectorEnabledAtom = atom(false)
const framework = undefined
export const convertFrameworkAtom = atom<Framework | undefined>(framework)
export const selectedFrameworkAtom = atom<Framework>('html')
const session = undefined
export const sessionAtom = atom<SessionData | undefined>(session)
