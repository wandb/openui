import type { Code } from 'mdast'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

interface ParsedMarkdown {
	name?: string
	emoji?: string
	html?: string
}

// eslint-disable-next-line import/prefer-default-export
export function parseMarkdown(
	markdown: string,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	existing: ParsedMarkdown = {}
): ParsedMarkdown {
	// TODO: this already a little tricky, refactor me
	const result: ParsedMarkdown = {}
	const header = markdown.slice(0, 100)
	const name = header.split('\n').find(l => l.trim().startsWith('name: '))
	const emoji = header.split('\n').find(l => l.trim().startsWith('emoji: '))
	// mixtral sometimes started itself with ```yaml
	let cleanMarkdown = markdown.replace('```yaml\n', '')
	if (name) {
		result.name = name.replace(/\s*name: /, '')
	}
	if (emoji) {
		result.emoji = emoji.replace(/\s*emoji: /, '')
		const split = markdown.indexOf('---', 10)
		if (split > 0) {
			cleanMarkdown = markdown.slice(Math.max(0, split + 3))
		}
	}
	const parsed = unified().use(remarkParse).parse(cleanMarkdown)

	const htmlBlocks = parsed.children.filter(
		c => c.type === 'code' || c.type === 'html'
	) as Code[]
	// TODO: maybe do this first and only if the first paragraph is chill
	for (const c of parsed.children) {
		if (c.type === 'paragraph') {
			let html = ''
			if (c.children[0].type === 'html') {
				for (const c2 of c.children) {
					html = html + (c2 as unknown as Code).value || ''
				}
			}
			htmlBlocks.push({ type: 'code', lang: 'html', value: html })
		}
	}
	const jsBlocks = parsed.children.filter(
		c => c.type === 'code' && c.lang === 'javascript'
	) as Code[]
	result.html = [
		...htmlBlocks.map(h => h.value),
		...jsBlocks.map(j => `<script type="text/javascript">${j.value}</script>`)
	].join('\n')
	return result
}
