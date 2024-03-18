import type { Code, Text, Yaml } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
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
	existing: ParsedMarkdown = {}
): ParsedMarkdown {
	// TODO: this already a little tricky, refactor me
	const result: ParsedMarkdown = {}
	// eslint-disable-next-line @typescript-eslint/no-magic-numbers
	const parsed = unified()
		.use(remarkParse)
		.use(remarkFrontmatter)
		// mixtral sometimes started itself with ```yaml
		.parse(markdown.replace('```yaml\n', ''))

	let frontmatter: Text | Yaml | undefined
	for (const c of parsed.children) {
		if (c.type === 'yaml') {
			frontmatter = c
			break
		}
		if (
			c.type === 'heading' &&
			c.children[0].type === 'text' &&
			c.children[0].value.includes('name: ')
		) {
			;[frontmatter] = c.children
			break
		}
	}
	if (
		!frontmatter &&
		parsed.children[0] && // Weird edgecase where the front matter is seen as a heading or a paragraph
		(parsed.children[0].type === 'heading' ||
			parsed.children[0].type === 'paragraph')
	) {
		frontmatter = parsed.children[0].children[0] as Text
	}
	if (frontmatter) {
		const fName = frontmatter.value
			.split('\n')
			.find(l => l.startsWith('name: '))
			?.replace('name: ', '')
		const fEmoji = frontmatter.value
			.split('\n')
			.find(l => l.startsWith('emoji: '))
			?.replace('emoji: ', '')
		result.name = fName
		result.emoji = fEmoji
	} else if (markdown.length > 50 && !existing.emoji) {
		// TODO: maybe set default name and emoji?
		console.warn('No frontmatter', markdown.slice(0, 100))
	}
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
