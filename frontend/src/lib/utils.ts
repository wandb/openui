import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function downloadStringAsFile(
	content: string,
	mimeType: string,
	fileName: string
) {
	const blob = new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	document.body.append(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

export const MOBILE_WIDTH = 580
