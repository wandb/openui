import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from 'components/ui/dialog'
import { Label } from 'components/ui/label'

import { Suspense, lazy } from 'react'
import type { Framework } from 'state'
import Scaffold from './Scaffold'

const CodeEditor = lazy(async () => import('components/CodeEditor'))

export default function CodeViewerFull({
	trigger,
	framework,
	currentCode
}: {
	trigger: JSX.Element
	framework: Framework
	currentCode: string
}) {
	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className='sm:max-w-[50vw]'>
				<DialogHeader>
					<DialogTitle>Code</DialogTitle>
					<DialogDescription>
						View the full code for this component
					</DialogDescription>
				</DialogHeader>
				<div className='grid gap-4 py-4'>
					<div className='grid gap-2'>
						<Label htmlFor='code'>Code</Label>
						<div
							className='relative overflow-x-auto rounded-md border border-zinc-100 dark:bg-zinc-900 '
							style={{ display: '-webkit-inline-box' }}
						>
							<div
								className='max-h-[80vh] overflow-scroll pb-8 text-sm'
								tabIndex={-1}
							>
								<Suspense fallback={<Scaffold loading />}>
									{/* TODO: jsx editing */}
									<CodeEditor
										code={currentCode}
										framework={framework}
										// eslint-disable-next-line react/jsx-handler-names
										// onChange={(value: string) => setEditedHTML(value)}
									/>
								</Suspense>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
