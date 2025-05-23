import { useQuery } from '@tanstack/react-query'
import { getModels } from 'api/models'
import { Button } from 'components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from 'components/ui/dialog'
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger
} from 'components/ui/hover-card'
import { Label } from 'components/ui/label'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue
} from 'components/ui/select'
import { Slider } from 'components/ui/slider'
import { Switch } from 'components/ui/switch'
import i18n from 'i18next'
import { useAtom } from 'jotai'
import { knownImageModels } from 'lib/constants'
import { cn } from 'lib/utils'
import { ImageIcon } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
	darkModeAtom,
	modelAtom,
	modelSupportsImagesAtom,
	modelSupportsImagesOverridesAtom,
	systemPromptAtom,
	temperatureAtom
} from 'state'
import { Textarea } from './ui/textarea'

function slugToNiceName(slug?: string, float = true) {
	if (slug) {
		const niceSlug = slug.split('/').slice(1, -1).join('')
		let icon: React.ReactNode | undefined
		if (knownImageModels.some(regex => regex.test(niceSlug))) {
			icon = (
				<ImageIcon
					className={cn('mx-1 mt-1 h-3 w-3', float && 'float-left ml-0')}
				/>
			)
		}
		return (
			<>
				{icon}
				{slug
					.replace(':latest', '')
					.replace('gpt', 'GPT')
					.replaceAll(/[:-]/g, ' ')
					.replaceAll(/\b\w/g, char => char.toUpperCase())}
			</>
		)
	}

	return undefined
}

export default function Settings({ trigger }: { trigger: JSX.Element }) {
	const { isPending, isError, error, data } = useQuery({
		queryKey: ['models'],
		queryFn: getModels
	})
	const [language, setLanguage] = useState(i18n.language)
	const [searchParams] = useSearchParams()
	const [model, setModel] = useAtom(modelAtom)
	const [systemPrompt, setSystemPrompt] = useAtom(systemPromptAtom)
	const [temperature, setTemperature] = useAtom(temperatureAtom)
	const [darkMode, setDarkMode] = useAtom(darkModeAtom)
	const [modelSupportsImages, setModelSupportsImages] = useAtom(
		modelSupportsImagesAtom
	)
	const [modelSupportsImagesOverrides, setModelSupportsImagesOverrides] =
		useAtom(modelSupportsImagesOverridesAtom)

	useEffect(() => {
		if (error) {
			console.error('Error fetching models', error)
		}
	}, [error])

	// Default to another model if no OpenAI models are available
	useEffect(() => {
		if (searchParams.get('dummy')) {
			const available = ['bad']
			setModel(
				`dummy/${available.includes(searchParams.get('dummy') ?? '') ? searchParams.get('dummy') : 'good'}`
			)
		} else if (data && data.openai.length === 0 && model.startsWith('gpt')) {
			if (data.groq.length > 0) {
				// Defaulting to the 3rd model which is currently llama3-70b
				setModel(`groq/${data.groq[2].id}`)
			} else if (data.ollama.length > 0) {
				setModel(`ollama/${data.ollama[0].model}`)
			} else if (data.litellm.length > 0) {
				setModel(`litellm/${data.litellm[0].id}`)
			}
		}
		const override = modelSupportsImagesOverrides[model]
		if (override === undefined) {
			setModelSupportsImages(
				knownImageModels.some(regex => {
					let cleanName = model
					if (cleanName.includes('/')) {
						cleanName = model.split('/').slice(1).join('/')
					}
					return regex.test(cleanName)
				})
			)
		} else {
			setModelSupportsImages(override)
		}
	}, [
		data,
		setModel,
		model,
		searchParams,
		setModelSupportsImages,
		modelSupportsImagesOverrides
	])

	return (
		<Dialog>
			<HoverCard>
				<DialogTrigger asChild>
					<HoverCardTrigger>{trigger}</HoverCardTrigger>
				</DialogTrigger>

				<HoverCardContent className='border text-sm'>
					<h2 className='font-bold'>Settings</h2>
					<p className='flex'>
						<span className='font-semibold'>Model:</span>{' '}
						{slugToNiceName(model.split('/').at(-1), false)}
					</p>
					<p>
						<span className='font-semibold'>Temperature:</span> {temperature}
					</p>
				</HoverCardContent>
			</HoverCard>
			<DialogContent className='max-w-3xl'>
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Choose a different model, adjust settings, or logout
					</DialogDescription>
				</DialogHeader>
				<div className='grid gap-4 py-4'>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='model'>
							Model
						</Label>
						<Select
							value={model}
							name='model'
							onValueChange={val => {
								setModel(val)
							}}
						>
							<SelectTrigger className='min-w-[200px]'>
								<SelectValue placeholder='Switch models' />
							</SelectTrigger>
							{isPending ? (
								<SelectContent>Loading...</SelectContent>
							) : undefined}
							{isError ? (
								<SelectContent>Error, see console...</SelectContent>
							) : undefined}
							{data ? (
								<SelectContent>
									{searchParams.get('dummy') ? (
										<SelectGroup>
											<SelectLabel>Dummy</SelectLabel>
											<SelectItem value='dummy/good'>Good dummy</SelectItem>
											<SelectItem value='dummy/bad'>Bad dummy</SelectItem>
										</SelectGroup>
									) : undefined}
									{data.openai.length > 0 && (
										<SelectGroup>
											<SelectLabel>OpenAI</SelectLabel>
											{data.openai
												.filter(
													m =>
														m !== 'gpt-4-turbo' ||
														import.meta.env.MODE !== 'hosted'
												)
												.map(m => (
													<SelectItem key={m} value={m}>
														{slugToNiceName(m)}
													</SelectItem>
												))}
										</SelectGroup>
									)}
									{data.groq.length > 0 && (
										<SelectGroup>
											<SelectLabel>Groq</SelectLabel>
											{data.groq.map(m => (
												<SelectItem key={m.id} value={`groq/${m.id}`}>
													{slugToNiceName(m.id)}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{data.litellm.length > 0 && (
										<SelectGroup>
											<SelectLabel>LiteLLM</SelectLabel>
											{data.litellm.map(m => (
												<SelectItem key={m.id} value={`litellm/${m.id}`}>
													{slugToNiceName(m.id)}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{data.ollama.length > 0 && (
										<SelectGroup>
											<SelectLabel>Ollama</SelectLabel>
											{data.ollama.map(m => (
												<SelectItem key={m.digest} value={`ollama/${m.model}`}>
													{slugToNiceName(m.model)}
												</SelectItem>
											))}
										</SelectGroup>
									)}
								</SelectContent>
							) : undefined}
						</Select>
					</div>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='vision'>
							Supports Vision
						</Label>
						<Switch
							className='-zoom-1 col-span-1'
							name='vision'
							checked={modelSupportsImages}
							onClick={() => {
								setModelSupportsImagesOverrides({
									...modelSupportsImagesOverrides,
									[model]: !modelSupportsImages
								})
							}}
							onCheckedChange={checked => setModelSupportsImages(checked)}
						/>
						<div className='-ml-15 col-span-5 text-xs'>
							We attempt to detect if the model has vision capabilities. You can
							override this if you&apos;re sure it does.
							{model === 'gpt-3.5-turbo' && (
								<span className='italic'>
									{' '}
									We&apos;ll automatically use gpt-4o for any requests with
									images.
								</span>
							)}
						</div>
					</div>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='prompt'>
							System Prompt
						</Label>
						<Textarea
							className='col-span-6 whitespace-nowrap'
							rows={5}
							id='prompt'
							onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
								setSystemPrompt(event.target.value)
							}
							value={systemPrompt}
						/>
					</div>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='temperature'>
							Temperature
						</Label>
						<Slider
							min={0}
							max={1}
							step={0.05}
							onValueChange={val => setTemperature(val[0])}
							value={[temperature]}
							className='col-span-2'
							id='temperature'
						/>
						<div className='col-span-1'>{temperature.toFixed(2)}</div>
					</div>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='dark-mode'>
							UI Mode
						</Label>
						<Select
							value={darkMode}
							name='dark-mode'
							onValueChange={val => {
								setDarkMode(val)
							}}
						>
							<SelectTrigger className='min-w-[200px]'>
								<SelectValue placeholder='Change mode' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='system'>System</SelectItem>
								<SelectItem value='dark'>Dark</SelectItem>
								<SelectItem value='light'>Light</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='language'>
							Language
						</Label>
						<Select
							value={language}
							name='language'
							onValueChange={val => {
								setLanguage(val)
								i18n
									.changeLanguage(val)
									.catch((error_: unknown) => console.error(error_))
							}}
						>
							<SelectTrigger className='min-w-[200px]'>
								<SelectValue placeholder='Select Language' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='en'>English</SelectItem>
								<SelectItem value='ja'>Japanese</SelectItem>
								<SelectItem value='kr'>Korean</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className='mt-3 grid grid-cols-4 items-center gap-4'>
						<div className='col-start-4 flex justify-end'>
							<Button
								variant='secondary'
								onClick={() => {
									fetch('/v1/session', { method: 'DELETE' })
										.then(() => document.location.reload())
										.catch((error_: unknown) => console.error(error_))
								}}
							>
								Logout
							</Button>
							<DialogClose asChild>
								<Button type='button' className='ml-2'>
									Update
								</Button>
							</DialogClose>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
