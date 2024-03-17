import { useEffect } from 'react'

interface Properties {
	title: string
}
export default function Head({ title }: Properties): null {
	useEffect(() => {
		document.title = title
	}, [title])

	// eslint-disable-next-line unicorn/no-null
	return null
}
