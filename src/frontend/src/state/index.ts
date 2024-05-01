import { atom } from 'jotai'
import type { Framework } from './atoms/history'

export * from './atoms/history'
export * from './atoms/prompts'
export const annotatedHTMLAtom = atom('')
export const editedHTMLAtom = atom('')
export const screenshotAtom = atom('')
export const commentsAtom = atom<string[]>([])
export const darkModeAtom = atom(false)
const framework = undefined
export const convertFrameworkAtom = atom<Framework | undefined>(framework)
export const selectedFrameworkAtom = atom<Framework>('html')
