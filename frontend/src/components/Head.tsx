import { useEffect } from 'react'

interface Properties {
	title: string
}
export default function Head({ title }: Properties): null {
	useEffect(() => {
		document.title = title
	}, [title])

	return null
}
