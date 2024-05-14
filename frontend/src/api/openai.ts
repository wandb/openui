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

export type Action = 'create' | 'refine'
interface CreateOptions {
	model: string
	systemPrompt: string
	query: string
	temperature: number
	html?: string
	image?: string
	action: Action
	history?: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
}

export const systemPrompt = `You are a web frontend developer specializing in $FRAMEWORK.
Given a description or an image, generate HTML with $FRAMEWORK. You must support
dark and light mode. It should render very well on desktop, tablet and mobile.
Keep your answers concise and just return HTML that would appear in '<body>'
there is no need for '<head>' or '<body>'. Use 'placehold.co' for placespace images. 
If the user asks for interactivity, use the modern ES6 javascript and the native Apis browser to handle events. 
Do not generate SVG’s, instead use an image tag with an alt attribute of the same descriptive name, i.e.: '<img aria-Hidden="true" alt="check" src="/icons/check.svg" />'. 
!IMPORTANT: Do not return suggestions or explanations about the code.`

const GPT4_MAX_TOKENS = 4096

export async function createOrRefine(
	options: CreateOptions,
	callback: (response: string) => void
) {
	let { model, systemPrompt: sp } = options
	const { temperature, query, html, image, action, history } = options
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
		},
		...(history ?? [])
	]

	if (action === 'create') {
		// Call the vision models only for creating action
		if (image) {
			// TODO: configurable
			if (model.startsWith('gpt')) {
				model = 'gpt-4-turbo-2024-04-09'
			}

			let imageUrl = image
			// OpenAI wants a data url, ollama just wants base64 bytes
			if (model.startsWith('ollama/')) {
				const parts = image.toString().split(',')
				imageUrl = parts.pop() ?? ''
			}
			if (model.startsWith('blackbox')) {
				const parts = image.toString().split(',')
				imageUrl = parts.pop() ?? ''
			}

			const textImageRequirements = query
				? `The following are some special requirements: \n ${query}`
				: ''

			messages.push({
				role: 'user',
				content: [
					{
						type: 'text',
						text: `This is a screenshot of a web component I want to replicate. Please generate HTML for it.\n ${textImageRequirements}`
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

		const userPrompt = hasAnnotationComments
			? 'Address the FIX comments.'
			: query

		const instructions = `Given the following HTML:\n\n${html}\n\n${userPrompt}`

		console.debug('Instruções Fornecidas:\n', instructions)

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

	let markdown = ''

	for await (const chunk of response) {
		const part = chunk.choices[0]?.delta?.content ?? ''
		markdown += part
		callback(part)
	}

	console.log('Got markdown:', markdown)

	return markdown
}

const systemPromptConvert = `You're a frontend web developer that specializes in $FRAMEWORK.
Given html and javascript, generate a $FRAMEWORK component. Factor the code into smaller
components if necessary. Keep all code in one file. if necessary use hooks and put tailwind class strings
that are repeated atleast 3 times into a shared constant. Leave comments when necessary. !IMPORTANT: Do not return suggestions or explanations about the code.`

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
	const instructions = `Given the following HTML: \n\n${html}\n\n${userPrompt}`

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
