export function newChapter(prompt: string) {
	return `\n\n---\nprompt: ${prompt}\n---\n\n`
}

export function fixHTML(html: string) {
	// Replace any gray styles with zinc, fix placeholder images
	// TODO: this is kinda LAME
	let fixed = html.replaceAll('-gray-', '-zinc-')
	// Use placehold.co for images
	fixed = fixed.replaceAll('via.placeholder.com', 'placehold.co')
	fixed = fixed.replaceAll('via.placeholder.co', 'placehold.co')
	fixed = fixed.replaceAll('placehold.it', 'placehold.co')
	// Point to our own backend for mp3's / wav files
	fixed = fixed.replaceAll(
		/"[^"]*\.(mp3|wav)|'[^']*\.(mp3|wav)'/g,
		`"${document.location.origin}/openui/funky.mp3"`
	)
	// Point svg's to our own backend
	fixed = fixed.replaceAll(
		/"[^"?]+\/([^/]+)\.svg(["?])/g,
		`"${document.location.origin}/openui/$1.svg$2`
	)
	// Remove any comments in the HTML
	fixed = fixed.replaceAll(/<!--[\S\s]*?-->/g, '')
	return fixed
}

export function parseMarkdown(
	markdown: string,
	version?: string,
	rendering?: boolean
): ParsedMarkdown {
	// TODO: this is getting called ALOT
	// TODO: this already a little tricky, refactor me
	if (version?.includes('.')) {
		// Revisions don't need any parsing, just call fix html and return
		return { html: fixHTML(markdown) }
	}
	const result: ParsedMarkdown = {}
	// TODO: 1000 is arbitrary, but often LLM's return some description
	const header = markdown.slice(0, 1000)
	const name = header.split('\n').find(l => l.trim().startsWith('name: '))
	const emoji = header.split('\n').find(l => l.trim().startsWith('emoji: '))
	// Mixtral sometimes started itself with ```yaml
	// We remove double newlines to ensure html is captured as a single block
	// let cleanMarkdown = markdown.replace('```yaml\n', '').replaceAll('\n\n', '\n')
	// TODO: this seems brittle, but seems to work, we need to do this to remove
	// any comments added after the closing the HTML
	// cleanMarkdown = cleanMarkdown.replace(/^(<\/div>|<\/script>)\n/m, '$1\n\n')
	let cleanMarkdown = markdown
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
	/* This is supposed to prevent us from writing frontmatter to the UI
	TODO: this is brittle, and doesn't seem to work consistently :/
	if (rendering && cleanMarkdown.slice(0, 1000).includes('---')) {
		const offset = cleanMarkdown.split('---').slice(0, -1).join('---').length
		cleanMarkdown = cleanMarkdown.slice(offset)
		if (cleanMarkdown.slice(0, 100).includes('---')) {
			cleanMarkdown = ''
		}
		}
	*/
	if (!rendering) {
		// TODO maybe change logic?
		console.log('rendered', cleanMarkdown)
	}
	let indexHtml = ''
	let commentary = ''
	const startTag = '<index_html>'
	const endTag = '</index_html>'
	const startIdx = cleanMarkdown.indexOf(startTag)
	const endIdx = cleanMarkdown.indexOf(endTag)
	if (startIdx !== -1) {
		indexHtml = cleanMarkdown.slice(startIdx + startTag.length, endIdx).trim()
		commentary = cleanMarkdown.slice(0, startIdx).trim()
		if (endIdx !== -1) {
			commentary += cleanMarkdown.slice(endIdx + endTag.length).trim()
		}
	} else {
		// Fallback to just grabbing the first chunk of HTML
		const openTagMatch = cleanMarkdown.match(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/)
		if (openTagMatch) {
			const tagName = openTagMatch[1]
			const openTagIdx = cleanMarkdown.indexOf(openTagMatch[0])

			const closingTagRegex = new RegExp(`</${tagName}>`, 'g')
			let lastCloseTagIdx = -1
			let match
			while ((match = closingTagRegex.exec(cleanMarkdown)) !== null) {
				lastCloseTagIdx = match.index
			}

			if (lastCloseTagIdx !== -1) {
				const endOfCloseTag = lastCloseTagIdx + `</${tagName}>`.length
				indexHtml = cleanMarkdown.slice(openTagIdx, endOfCloseTag)
				commentary = (
					cleanMarkdown.slice(0, openTagIdx) +
					cleanMarkdown.slice(endOfCloseTag)
				).trim()
			} else {
				indexHtml = cleanMarkdown.slice(openTagIdx, lastCloseTagIdx).trim()
				commentary = cleanMarkdown.slice(0, openTagIdx).trim()
			}
		} else if (cleanMarkdown.length > 1000) {
			console.warn('Malformed llm response:', cleanMarkdown)
		}
	}

	// const parsed = unified().use(remarkParse).parse(commentary)

	/* TODO: not convinced this is the best way to handle this
	if (
		!rendering && indexHtml === ""
	) {
		console.warn('No HTML found, parse results:', cleanMarkdown)
		indexHtml = `<div class="p-8 prose dark:prose-invert"><h1 class=text-xl font-bold ${cleanMarkdown === '' ? 'text-red-700' : ''}">Couldn't find any HTML, LLM Response:</h1>${cleanMarkdown === '' ? `<pre class="text-xs"><code class="language-html">${escapeHTML(markdown)}</code></pre>` : cleanMarkdown}</div>`
	}*/
	//const jsBlocks = parsed.children.filter(
	//	c => c.type === 'code' && c.lang === 'javascript'
	//) as Code[]
	result.html = fixHTML(
		[
			indexHtml
			//...jsBlocks.map(j => `<script type="text/javascript">${j.value}</script>`)
		].join('\n')
	)
	result.commentary = commentary
	return result
}

interface ParsedMarkdown {
	name?: string
	emoji?: string
	html?: string
	commentary?: string
}
