import { clsx, type ClassValue } from 'clsx'
import { useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import type { Framework, Image } from '../state'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export async function calculateSHA256(message: string) {
	// Convert the message to a Uint8Array
	const msgBuffer = new TextEncoder().encode(message)

	// Calculate the SHA-256 hash
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)

	// Convert the hash to a hex string
	const hashArray = [...new Uint8Array(hashBuffer)]
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

	return hashHex
}

export function mimeTypeAndExtension(framework: Framework) {
	let ext = framework === 'html' ? '.html' : '.js'
	let mime = framework === 'html' ? 'text/html' : 'application/javascript'
	if (framework === 'streamlit') {
		ext = '.py'
		mime = 'text/python'
	}
	return [ext, mime]
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

export function useIntersectionObserver(
	elementRef: React.RefObject<Element>,
	options: IntersectionObserverInit
) {
	const [isIntersecting, setIsIntersecting] = useState(false)

	useEffect(() => {
		const observer = new IntersectionObserver(([entry]) => {
			setIsIntersecting(entry.isIntersecting)
		}, options)
		const curRef = elementRef.current
		if (elementRef.current) {
			observer.observe(elementRef.current)
		}
		return () => {
			if (curRef) {
				observer.unobserve(curRef)
			}
		}
	}, [elementRef, options])

	return isIntersecting
}

export async function resizeImage(
	dataURL: string,
	maxSize: number
): Promise<Image> {
	const img = new Image()
	const promise = new Promise<Image>((resolve, reject) => {
		img.addEventListener('load', () => {
			let { width, height } = img
			if (width > maxSize || height > maxSize) {
				if (width > height) {
					height *= maxSize / width
					width = maxSize
				} else {
					width *= maxSize / height
					height = maxSize
				}
			}
			const canvas = document.querySelector('#resizer') as HTMLCanvasElement
			const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
			canvas.width = width
			canvas.height = height
			ctx.drawImage(img, 0, 0, width, height)
			const resizedDataURL = canvas.toDataURL('image/jpeg')
			resolve({
				url: resizedDataURL,
				width,
				height,
				createdAt: new Date()
			})
		})
		img.addEventListener('error', e => {
			reject(new Error(`Failed to resize image: ${e.message}`))
		})
	})
	img.src = dataURL
	return promise
}

export const MOBILE_WIDTH = 580
