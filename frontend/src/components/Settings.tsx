import { useQuery } from '@tanstack/react-query'
import { getModels } from 'api/ollama'
import { getGroqModels } from 'api/groq'
import type { ModelList, Model } from 'groq-sdk/resources'
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
import { useAtom } from 'jotai'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import { modelAtom, systemPromptAtom, temperatureAtom } from 'state'
import { Textarea } from './ui/textarea'

export default function Settings({ trigger }: { trigger: JSX.Element }) {
	const { isPending, isError, error, data } = useQuery({
		queryKey: ['ollama-models'],
		queryFn: getModels
	})
	const { isPending: isPendingGroq, isError: isErrorGroq, error: errorGroq, data: dataGroq } = useQuery<ModelList>({
		queryKey: ['groq-models'],
		queryFn: getGroqModels
	})
	const [model, setModel] = useAtom(modelAtom)
	const [systemPrompt, setSystemPrompt] = useAtom(systemPromptAtom)
	const [temperature, setTemperature] = useAtom(temperatureAtom)

	useEffect(() => {
		if (error) {
			console.error('Error fetching ollama models', error as unknown)
		}
	}, [error])

	useEffect(() => {
		if (errorGroq) {
			console.error('Error fetching Groq models', errorGroq as unknown)
		}
	}, [errorGroq])

	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className='max-w-xl'>
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Make changes to your settings or logout
					</DialogDescription>
				</DialogHeader>
				<div className='grid gap-4 py-4'>
					<div className='grid grid-cols-4 items-center gap-4'>
						<Label className='text-right' htmlFor='model'>
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
							<SelectContent>
								<SelectGroup>
									<SelectLabel>OpenAI</SelectLabel>
									<SelectItem value='gpt-3.5-turbo'>GPT-3.5 Turbo</SelectItem>
									<SelectItem value='gpt-4-turbo-2024-04-09'>
										GPT-4 Turbo
									</SelectItem>
								</SelectGroup>
								<SelectGroup>
									{isPending || (data && data.length > 0) ? (
										<SelectLabel>Ollama</SelectLabel>
									) : undefined}
									{!!isPending && (
										<SelectItem disabled value='loading'>
											Loading...
										</SelectItem>
									)}
									{!!isError && (
										<SelectItem disabled value='error'>
											Unable to load Ollama models, see console
										</SelectItem>
									)}
									{!!data &&
										data.map(m => (
											<SelectItem key={m.digest} value={`ollama/${m.name}`}>
												{m.name}
											</SelectItem>
										))}
								</SelectGroup>
								<SelectGroup>
									{!!isPendingGroq || ((dataGroq?.data ?? []).length > 0) && (
										<SelectLabel>Groq</SelectLabel>
									)}
									{!!isPendingGroq && (
										<SelectItem disabled value='loading'>
											Loading...
										</SelectItem>
									)}
									{!!isErrorGroq && (
										<SelectItem disabled value='error'>
											Unable to load Groq models, see console
										</SelectItem>
									)}
									{(dataGroq?.data ?? []).filter((m: Model) => !!m.active).map((m: Model) => (
										<SelectItem key={m.id} value={`groq/${m.id}`}>
										        {m.id}
										</SelectItem>
										))}
									</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className='grid grid-cols-4 items-center gap-4'>
						<Label className='text-right' htmlFor='prompt'>
							System Prompt
						</Label>
						<Textarea
							className='col-span-3'
							id='prompt'
							onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
								setSystemPrompt(event.target.value)
							}
							value={systemPrompt}
						/>
					</div>
					<div className='grid grid-cols-4 items-center gap-4'>
						<Label className='text-right' htmlFor='temperature'>
							Temperature
						</Label>
						<Slider
							min={0}
							max={1}
							step={0.05}
							onValueChange={val => setTemperature(val[0])}
							value={[temperature]}
							className='col-span-3'
							id='temperature'
						/>
					</div>
					<div className='mt-3 grid grid-cols-4 items-center gap-4'>
						<div className='col-start-4 flex justify-end'>
							<Button
								variant='secondary'
								onClick={() => {
									fetch('/v1/session', { method: 'DELETE' })
										.then(() => document.location.reload())
										.catch(error_ => console.error(error_))
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
