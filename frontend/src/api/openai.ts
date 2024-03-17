import { OpenAI } from 'openai'

function host() {
	const { hostname, protocol } = window.location
	const port = window.location.port ? `:${window.location.port}` : ''
	return `${protocol}//${hostname}${port}`
}

const openai = new OpenAI({
	apiKey: 'sk-fake',
	baseURL: `${host()}/v1`,
	dangerouslyAllowBrowser: true
})

interface CreateOptions {
	model: string
	systemPrompt: string
	query: string
	temperature: number
	html?: string
	image?: string
}

export const systemPrompt = `You're a frontend web developer that specializes in tailwindcss. Given a description, generate HTML with tailwindcss. You should support both dark and light mode. It should render nicely on desktop, tablet, and mobile. Keep your responses concise and just return HTML that would appear in the <body> no need for <head>. Use placehold.co for placeholder images. If the user asks for interactivity, use modern ES6 javascript and native browser apis to handle events.`

const GPT4_MAX_TOKENS = 4096

export async function createOrRefine(
	options: CreateOptions,
	callback: (response: string) => void
) {
	let { model, systemPrompt: sp } = options
	const { temperature, query, html, image } = options
	// Add instructions for frontmatter unless we're iterating on existing html
	// Some models don't support this being in a seperate system message so we append
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

	if (image) {
		// TODO: configurable
		if (model === 'gpt-3.5-turbo') {
			model = 'gpt-4-vision-preview'
		}
		let imageUrl = image
		// OpenAI wants a data url, ollama just wants base64 bytes
		if (model.startsWith('ollama/')) {
			const parts = image.toString().split(',')
			imageUrl = parts.pop() ?? ''
		}
		messages.push({
			role: 'user',
			content: [
				{
					type: 'text',
					text: 'This is a screenshot of a web component I want to replicate.  Please generate HTML for it.'
				},
				{
					type: 'image_url',
					image_url: {
						url: imageUrl,
						detail: 'auto'
					}
				}
			]
		})
	}

	if (html === undefined || html === '') {
		if (query !== 'image-upload') {
			messages.push({
				role: 'user',
				content: query
			})
		}
	} else {
		let userPrompt = 'Address the FIX comments.'
		if (query !== 'html-comments-only') {
			userPrompt = query
		}
		const instructions = `Given the following HTML:\n\n${html}\n\n${userPrompt}`
		console.log('Providing instructions:\n', instructions)
		messages.push({
			role: 'user',
			content: instructions
		})
	}

	const response = await openai.chat.completions.create({
		model, // can change to "gpt-4" if you fancy
		messages,
		temperature,
		stream: true,
		max_tokens: GPT4_MAX_TOKENS
	})
	for await (const chunk of response) {
		callback(chunk.choices[0]?.delta?.content ?? '')
	}
}

const systemPromptConvert = `You're a frontend web developer that specializes in $FRAMEWORK.
Given html and javascript, generate a $FRAMEWORK component. Factor the code into smaller
components if necessary. Keep all code in one file. Use hooks and put tailwind class strings
that are repeated atleast 3 times into a shared constant. Leave comments when necessary.`

interface ConvertOptions {
	model: string
	temperature: number
	framework: string
	html: string
}

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
  let inputTok = ''
  const encoder = encoding_for_model('gpt-3.5-turbo')
  inputTok += systemPromptCompiled + '\n'
  */
	const userPrompt = `Please turn this into a ${framework} component.`
	const instructions = `Given the following HTML:\n\n${html}\n\n${userPrompt}`
	// inputTok += instructions + '\n'
	messages.push({
		role: 'user',
		content: instructions
	})
	/*
  const tokens = encoder.encode(inputTok)
  encoder.free()
  console.log('Model: ', model)
  // TODO: use a bigger model if we're length limited
  console.log('Tokens: ', tokens.length)
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
