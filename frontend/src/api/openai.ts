import { OpenAI } from 'openai'
import type { ToolFinishEvent } from '../state'

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
	iframeId: string
	sessionId?: string
	html?: string
	image?: string
	action: Action
}

export const systemPrompt = `🎉 Greetings, TailwindCSS Virtuoso! 🌟

You've mastered the art of frontend design and TailwindCSS! Your mission is to transform detailed descriptions or compelling images into stunning HTML using the versatility of TailwindCSS. Ensure your creations are seamless in both dark and light modes! Your designs should be responsive and adaptable across all devices - be it desktop, tablet, or mobile.

*Design Guidelines:*
- Utilize placehold.co for placeholder images and descriptive alt text.
- For interactive elements, leverage modern ES6 JavaScript and native browser APIs for enhanced functionality.
- Inspired by shadcn, we provide the following colors which handle both light and dark mode:

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

Prefer using these colors when appropriate, for example:

<index_html>
<button class="bg-secondary text-secondary-foreground hover:bg-secondary/80">Click me</button>
<span class="text-muted-foreground">This is muted text</span>
</index_html>

*Implementation Rules:*
- Only implement elements within the <body> tag, don't bother with <html> or <head> tags.
- Wrap the page you generate in an <index_html> tag
- When provided existing <index_html> only use the edit or execScript tools if they're more efficient than rewriting the entire page.
- Avoid generating SVGs directly. Instead, use the <img> tag with a descriptive title as the alt attribute and add .svg to the placehold.co url, for example:

<index_html>
<img aria-hidden="true" alt="magic-wand" src="/icons/24x24.svg?text=🪄" />
</index_html>

If there is no <index_html> in your context, do not use tools.  Only use tools to inspect or modify an existing <index_html> when appropriate.
`

const GPT4_MAX_TOKENS = 8192

const EDIT_DESCRIPTION = `edit allows you to modify the DOM using a mode and dom selector.

# Modes

- innerHTML: Set the innerHTML of the element or elements
- outerHTML: Set the outerHTML of the element or elements
- appendHTML: Append HTML to the element or elements
- prependHTML: Prepend HTML to the element or elements
- removeHTML: Remove the element or elements
- classAdd: Add a class to the element or elements
- classRemove: Remove a class from the element or elements
- classReplace: Replace a class on the element or elements

# Examples

edit('innerHTML', 'script', 'console.log("Hello, world!")', 'Update the main script')
edit('classAdd', 'button.bg-primary', 'text-white', 'Fix button text color', true)
edit('appendHTML', 'max-w-4xl.mx-auto', '<p>Hello, world!</p>', 'Add a paragraph to the container')
edit('removeHTML', 'button.bg-primary', '', 'Remove the button')

# Notes

- When editing you need to perform all operations required to get <index_html> into the proper state.
- If you rewriting the majority of <index_html> just output a new <index_html> tag with the entire page rewritten instead of using tools.
`

/*const EXEC_SCRIPT_DESCRIPTION = `Execute a script for debuging or complex DOM manipulation.

# Examples

execScript('console.log("Hello, world!")', 'Log a message')
execScript('document.querySelector("#wrapper div:nth-child(2)").classList.add("bg-red-500")', 'Change the background color of the second div within the wrapper')

# Notes

- IMPORTANT: This script does not persist, it's run once. Use edit('innerHTML', 'script', '...', '...') to update a script in <index_html>.
- Your <index_html> context is within a <div id="wrapper"> tag.
- Any manipulation of the DOM will result in changes to your <index_html> context
- This is especially useful for changing many styles or updating text in many places
`*/

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'edit',
			description: EDIT_DESCRIPTION,
			parameters: {
				type: 'object',
				properties: {
					mode: {
						type: 'string',
						description: 'The mode to use for the edit.'
					},
					selector: {
						type: 'string',
						description: 'The selector of the element or elements to edit.'
					},
					html: {
						type: 'string',
						description:
							'The HTML or class to modify of the element or elements.'
					},
					description: {
						type: 'string',
						description: 'A description of what the JavaScript code does.'
					},
					multiple: {
						type: 'boolean',
						description:
							'Whether to edit multiple elements or a single element, defaults to false.'
					}
				},
				required: ['selector', 'html', 'description']
			}
		}
	},
	/* The models are consistently using this tool when they shouldn't be
	{
		type: "function",
		function: {
			name: "execScript",
			description: EXEC_SCRIPT_DESCRIPTION,
			parameters: {
				type: "object",
				properties: {
					script: {
						type: "string",
						description: "The JavaScript code to execute."
					},
					description: {
						type: "string",
						description: "A description of what the JavaScript code does."
					}
				},
				required: ["script", "description"]
			}
		}
	},*/
	{
		type: 'function',
		function: {
			name: 'takeScreenshot',
			description: 'Take a screenshot of the current page.',
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	}
]

function processToolCalls(
	toolCalls?: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[],
	toolCallAccumulator: Record<
		number,
		OpenAI.Chat.Completions.ChatCompletionMessageToolCall
	> = {}
) {
	if (!toolCalls) return toolCallAccumulator
	for (const toolCall of toolCalls) {
		const { index } = toolCall

		if (!toolCallAccumulator[index] && toolCall.id) {
			toolCallAccumulator[index] =
				toolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall
		}
		// When using Gemeni it seems we ultimately get the entire args...
		if (
			toolCall.function?.arguments &&
			toolCallAccumulator[index].function.arguments !==
				toolCall.function.arguments
		) {
			toolCallAccumulator[index].function.arguments +=
				toolCall.function.arguments
		}
	}
	return toolCallAccumulator
}

type Response = {
	body: string
	toolCalls: Record<
		number,
		OpenAI.Chat.Completions.ChatCompletionMessageToolCall
	>
}

export async function respondToToolCalls(
	ctx: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
	toolCalls: ToolFinishEvent[],
	sessionId: string
) {
	//ctx.messages.push({})
	await openai.chat.completions.create(ctx, {
		headers: {
			'X-Wandb-Trace-Id': sessionId
		}
	})
}

export async function createOrRefine(
	options: CreateOptions,
	callback: (response: string) => void,
	storeContext?: (
		ctx: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
	) => void
): Promise<Response> {
	let model = options.model
	let sp = options.systemPrompt
	const { iframeId, sessionId } = options
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

		const instructions = `Given the following HTML${image ? ' and image' : ''}:`
		const content: OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content'] =
			[
				{
					type: 'text',
					text: instructions
				},
				{
					type: 'text',
					text: `<index_html>\n${html ?? ''}\n</index_html>`
				}
			]
		if (image) {
			content.push({
				type: 'image_url',
				image_url: {
					url: imageUrl
				}
			})
			// TODO: configurable
			if (model.startsWith('gpt')) {
				model = 'gpt-4o-mini'
			}
		}
		content.push({
			type: 'text',
			text: userPrompt
		})
		messages.push({
			role: 'user',
			content
		})
		console.log('Sending instructions:', messages)
	}

	// TODO: use sessionId instead, modify the DOM of jotai dev tools
	// jotai-devtools-root to include a link to weave
	console.log('Session ID:', sessionId)
	const context: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model,
		messages,
		temperature,
		stream: true,
		max_tokens: GPT4_MAX_TOKENS,
		tools
	}
	if (storeContext) {
		storeContext(context)
	}
	const response = await openai.chat.completions.create(context, {
		headers: {
			'X-Wandb-Trace-Id': iframeId
		}
	})
	let markdown = ''
	const finalToolCalls = processToolCalls(undefined, {})
	for await (const chunk of response) {
		const part = chunk.choices[0]?.delta?.content ?? ''
		markdown += part
		callback(part)
		processToolCalls(chunk.choices[0]?.delta?.tool_calls, finalToolCalls)
	}
	const toolTable = []
	for (const toolCall of Object.values(finalToolCalls)) {
		toolTable.push({
			id: toolCall.id,
			name: toolCall.function.name,
			args: toolCall.function.arguments
		})
	}
	console.table(toolTable, ['id', 'name', 'args'])
	const iframe = document.getElementById(
		`iframe-${iframeId}`
	) as HTMLIFrameElement
	let iframeWindow
	if (iframe) {
		iframeWindow = iframe.contentWindow
	}
	if (!iframeWindow) {
		console.error('No iframe found', iframeId)
		return { body: markdown, toolCalls: finalToolCalls }
	}
	// TODO: move these into UI context
	for (const toolCall of Object.values(finalToolCalls)) {
		if (toolCall.function.name === 'exec-script') {
			const { javascript, description } = JSON.parse(
				toolCall.function.arguments
			)
			iframeWindow.postMessage(
				{
					action: 'exec-script',
					id: iframeId,
					toolCallId: toolCall.id,
					javascript,
					description
				},
				'*'
			)
			console.log(
				'Sent exec-script to iframe:',
				javascript,
				description,
				iframeId
			)
		} else if (toolCall.function.name === 'edit') {
			const { mode, selector, html, description, multiple } = JSON.parse(
				toolCall.function.arguments
			)
			iframeWindow.postMessage(
				{
					action: 'edit',
					id: iframeId,
					toolCallId: toolCall.id,
					mode,
					selector,
					html,
					description,
					multiple
				},
				'*'
			)
			console.log(
				'Sent edit DOM to iframe:',
				mode,
				selector,
				html,
				description,
				multiple,
				iframeId
			)
		}
	}
	return {
		body: markdown,
		toolCalls: finalToolCalls
	}
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
	const finalToolCalls = processToolCalls(undefined, {})
	for await (const chunk of response) {
		callback(chunk.choices[0]?.delta?.content ?? '')
		processToolCalls(chunk.choices[0]?.delta?.tool_calls, finalToolCalls)
	}
	console.table(finalToolCalls, ['id', 'function.name', 'function.arguments'])
}
