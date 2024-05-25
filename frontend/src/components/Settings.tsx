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
import { useAtom } from 'jotai'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import {
	beastModeAtom,
	modelAtom,
	systemPromptAtom,
	temperatureAtom
} from 'state'
import { Textarea } from './ui/textarea'

export default function Settings({ trigger }: { trigger: JSX.Element }) {
	const { isPending, isError, error, data } = useQuery({
		queryKey: ['models'],
		queryFn: getModels
	})
	const [beastMode, setBeastMode] = useAtom(beastModeAtom)
	const [model, setModel] = useAtom(modelAtom)
	const [systemPrompt, setSystemPrompt] = useAtom(systemPromptAtom)
	const [temperature, setTemperature] = useAtom(temperatureAtom)

	useEffect(() => {
		if (error) {
			console.error('Error fetching models', error)
		}
	}, [error])

	useEffect(() => {
		if (data && data.groq.length > 0 && data.openai.length === 0) {
			setModel(`groq/${data.groq[2].id}`)
		}
	}, [data, setModel])

	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
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
									{data.openai.length > 0 && (
										<SelectGroup>
											<SelectLabel>OpenAI</SelectLabel>
											<SelectItem value='gpt-3.5-turbo'>
												GPT-3.5 Turbo
											</SelectItem>
											<SelectItem value='gpt-4o'>GPT-4o</SelectItem>
											{import.meta.env.MODE !== 'hosted' && (
												<SelectItem value='gpt-4-turbo'>GPT-4 Turbo</SelectItem>
											)}
										</SelectGroup>
									)}
									{data.groq.length > 0 && (
										<SelectGroup>
											<SelectLabel>Groq</SelectLabel>
											{data.groq.map(m => (
												<SelectItem key={m.id} value={`groq/${m.id}`}>
													{m.id}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{data.ollama.length > 0 && (
										<SelectGroup>
											<SelectLabel>Ollama</SelectLabel>
											{data.ollama.map(m => (
												<SelectItem key={m.digest} value={`ollama/${m.name}`}>
													{m.name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
								</SelectContent>
							) : undefined}
						</Select>
					</div>
					<div className='grid grid-cols-8 items-center gap-4'>
						<Label className='col-span-2 text-right' htmlFor='prompt'>
							System Prompt
						</Label>
						<Textarea
							className='col-span-6 whitespace-nowrap'
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
						<Label className='col-span-2 text-right' htmlFor='beast'>
							Agent Mode
						</Label>
						<Switch
							className='-zoom-1 col-span-1'
							name='beast'
							disabled
							checked={beastMode}
							onCheckedChange={checked => setBeastMode(checked)}
						/>
						<div className='-ml-15 col-span-5 text-xs italic'>
							Coming soon! Agent mode will make multiple calls to an LLM with
							vision capabilities to iterate on a design.
						</div>
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
