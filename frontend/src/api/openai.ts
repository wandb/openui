import { OpenAI } from 'openai'

function host() {
	const { hostname, protocol } = window.location
	const port = window.location.port ? `:${window.location.port}` : ''
	return `${protocol}//${hostname}${port}`
}
/* I patched OpenAI here so that users can use basic auth behind a proxy if they want */
class MyOpenAI extends OpenAI {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
	protected override authHeaders(_opts: any) {
		return {}
	}
}
const openai = new MyOpenAI({
	apiKey: 'sk-fake',
	baseURL: `${host()}/v1`,
	dangerouslyAllowBrowser: true
})

export type Action = 'create' | 'refine'
interface CreateOptions {
	model: string
	systemPrompt: string
	query: string
	temperature: number
	html?: string
	image?: string
	action: Action
}

export const systemPrompt = `🎉 Greetings, TailwindCSS Virtuoso! 🌟

You've mastered the art of frontend design and TailwindCSS! Your mission is to transform detailed descriptions or compelling images into stunning HTML using the versatility of TailwindCSS. Ensure your creations are seamless in both dark and light modes! Your designs should be responsive and adaptable across all devices – be it desktop, tablet, or mobile.

*Design Guidelines:*
- Utilize placehold.co for placeholder images and descriptive alt text.
- For interactive elements, leverage modern ES6 JavaScript and native browser APIs for enhanced functionality.
- Inspired by shadcn, we provide the following colors which handle both light and dark mode:

\`\`\`css
  --background
  --foreground
  --primary
	--border
  --input
  --ring
  --primary-foreground
  --secondary
  --secondary-foreground
  --accent
  --accent-foreground
  --destructive
  --destructive-foreground
  --muted
  --muted-foreground
  --card
  --card-foreground
  --popover
  --popover-foreground
\`\`\`

Prefer using these colors when appropriate, for example:

\`\`\`html
<button class="bg-secondary text-secondary-foreground hover:bg-secondary/80">Click me</button>
<span class="text-muted-foreground">This is muted text</span>
\`\`\`

*Implementation Rules:*
- Only implement elements within the \`<body>\` tag, don't bother with \`<html>\` or \`<head>\` tags.
- Avoid using SVGs directly. Instead, use the \`<img>\` tag with a descriptive title as the alt attribute and add .svg to the placehold.co url, for example:

\`\`\`html
<img aria-hidden="true" alt="magic-wand" src="/icons/24x24.svg?text=🪄" />
\`\`\`
`

const GPT4_MAX_TOKENS = 4096

export async function createOrRefine(
	options: CreateOptions,
	callback: (response: string) => void
) {
	let { model, systemPrompt: sp } = options
	const { temperature, query, html, image, action } = options
	// Add instructions for frontmatter unless we're iterating on existing html
	// Some models don't support this being in a separate system message so we append
	if (!html) {
		sp += `\n\nAlways start your response with frontmatter wrapped in ---.  Set name: with a 2 to 5 word description of the component. Set emoji: with an emoji for the component, i.e.:
---
name: Fancy Button
emoji: 🎉
---

<button class="bg-blue-500 text-white p-2 rounded-lg">Click me</button>\n\n`
	}
	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{
			role: 'system',
			content: sp
		}
	]

	let imageUrl = image ?? ''
	// OpenAI wants a data url, ollama just wants base64 bytes
	// TODO: this can be removed once Ollama OpenAI compat is fixed
	if (image && model.startsWith('ollama/')) {
		const parts = image.toString().split(',')
		imageUrl = parts.pop() ?? ''
	}

	if (action === 'create') {
		// Call the vision models only for creating action
		if (image) {
			// TODO: configurable
			if (model.startsWith('gpt')) {
				model = 'gpt-4o-mini'
			}
			const textImageRequirements = query
				? `The following are some special requirements: \n ${query}`
				: ''
			messages.push({
				role: 'user',
				content: [
					{
						type: 'text',
						text: `This is a screenshot of a web component I want to replicate.  Please generate HTML for it.\n ${textImageRequirements}`
					},
					{
						type: 'image_url',
						image_url: {
							url: imageUrl
						}
					}
				]
			})
		} else {
			messages.push({
				role: 'user',
				content: query
			})
		}
	} else {
		// Annotation comments should like <!--FIX (1): make the image larger-->
		const hasAnnotationComments = /<!--FIX (\(\d+\)): (.+)-->/g.test(
			html as string
		)
		let userPrompt = hasAnnotationComments ? 'Address the FIX comments.' : query
		if (userPrompt === '') {
			userPrompt = 'Lets make this look more professional'
		}

		const instructions = `Given the following HTML${image ? ' and image' : ''}:\n\n${html}\n\n${userPrompt}`
		console.log('Sending instructions:', instructions)
		if (image) {
			// TODO: configurable
			if (model.startsWith('gpt')) {
				model = 'gpt-4o-mini'
			}
			messages.push({
				role: 'user',
				content: [
					{
						type: 'text',
						text: instructions
					},
					{
						type: 'image_url',
						image_url: {
							url: imageUrl
						}
					}
				]
			})
		} else {
			messages.push({
				role: 'user',
				content: instructions
			})
		}
	}

	const response = await openai.chat.completions.create({
		model, // Can change to "gpt-4" if you fancy
		messages,
		temperature,
		stream: true,
		max_tokens: GPT4_MAX_TOKENS
	})
	let markdown = ''
	for await (const chunk of response) {
		const part = chunk.choices[0]?.delta?.content ?? ''
		markdown += part
		callback(part)
	}
	return markdown
}

interface ConvertOptions {
	model: string
	temperature: number
	framework: string
	html: string
}

const systemPromptConvert = `You're a frontend web developer that specializes in $FRAMEWORK.
Given html and javascript, generate a $FRAMEWORK component. Factor the code into smaller
components if necessary. Keep all code in one file. Use hooks and put tailwind class strings
that are repeated atleast 3 times into a shared constant. Leave comments when necessary.`

export async function convert(
	options: ConvertOptions,
	callback: (response: string) => void
) {
	const { framework, model, temperature, html } = options

	const systemPromptCompiled = systemPromptConvert.replaceAll(
		'$FRAMEWORK',
		framework
	)
	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{
			role: 'system',
			content: systemPromptCompiled
		}
	]
	/*
  Let inputTok = ''
  const encoder = encoding_for_model('gpt-3.5-turbo')
  inputTok += systemPromptCompiled + '\n'
  */
	const userPrompt = `Please turn this into a ${framework} component.`
	const instructions = `Given the following HTML:\n\n${html}\n\n${userPrompt}`
	// InputTok += instructions + '\n'
	messages.push({
		role: 'user',
		content: instructions
	})
	/*
  Const tokens = encoder.encode(inputTok)
  encoder.free()
  // TODO: use a bigger model if we're length limited
  */
	const response = await openai.chat.completions.create({
		model,
		messages,
		temperature,
		stream: true
	})
	for await (const chunk of response) {
		callback(chunk.choices[0]?.delta?.content ?? '')
	}
}
