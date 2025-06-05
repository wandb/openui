interface ParsedMarkdown {
        name?: string
        emoji?: string
        html?: string
        commentary?: string
}

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
	let cleanMarkdown = markdown.replace('```yaml\n', '').replaceAll('\n\n', '\n')
	// TODO: this seems brittle, but seems to work, we need to do this to remove
	// Any comments added after the closing the HTML
	cleanMarkdown = cleanMarkdown.replace(/^(<\/div>|<\/script>)\n/m, '$1\n\n')
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

        // First, prefer <index_html> tags if present
        const indexMatch = cleanMarkdown.match(/<index_html>([\s\S]*?)<\/index_html>/i)
        const jsRegex = /```javascript\n([\s\S]*?)```/gi
        let jsBlocks: string[] = []

        let commentary = cleanMarkdown

        if (indexMatch) {
                commentary = commentary.replace(indexMatch[0], '')
                let match
                while ((match = jsRegex.exec(commentary))) {
                        jsBlocks.push(match[1])
                }
                commentary = commentary.replace(jsRegex, '').trim()
                result.commentary = commentary
                result.html = fixHTML(
                        [
                                indexMatch[1].trim(),
                                ...jsBlocks.map(j => `<script type="text/javascript">${j}</script>`)
                        ].join('\n')
                )
                return result
        }

        // Fall back to parsing markdown for code fences
        const htmlFence = cleanMarkdown.match(/```html\n([\s\S]*?)```/i)
        if (htmlFence) {
                commentary = commentary.replace(htmlFence[0], '')
        }

        let match
        while ((match = jsRegex.exec(commentary))) {
                jsBlocks.push(match[1])
        }
        commentary = commentary.replace(jsRegex, '').trim()

        result.commentary = commentary
        const htmlContent = htmlFence ? htmlFence[1].trim() : ''

        if (!htmlContent && !rendering) {
                console.warn('No HTML found in markdown')
        }

        result.html = fixHTML(
                [
                        htmlContent,
                        ...jsBlocks.map(j => `<script type="text/javascript">${j}</script>`)
                ].join('\n')
        )

        return result
}
