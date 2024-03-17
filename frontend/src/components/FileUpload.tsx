import { cn } from 'lib/utils'
import { useState } from 'react'

export default function FileUpload({
	callback
}: {
	callback: (browse: boolean, file?: File) => void
}) {
	const [dragging, setDragging] = useState(false)

	return (
		<div
			className='flex h-full items-center bg-background'
			onKeyPress={(e: React.KeyboardEvent) => {
				if (e.key === 'Enter') callback(true)
			}}
			onClick={() => callback(true)}
			role='button'
			tabIndex={0}
		>
			{/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
			<label
				htmlFor='file-input'
				className='relative mx-auto h-64 w-64 cursor-pointer rounded-lg bg-white p-4 text-center text-zinc-600 shadow-lg dark:bg-zinc-800'
				onDragEnter={() => setDragging(true)}
				onDragExit={() => setDragging(false)}
				onDrop={(e: React.DragEvent) => {
					e.preventDefault()
					setDragging(false)

					let file: File | null | undefined
					if (e.dataTransfer.items.length > 0) {
						for (const item of e.dataTransfer.items) {
							if (item.kind === 'file') {
								file = item.getAsFile()
								if (file?.type.startsWith('image/')) break
								else file = undefined
							}
						}
					} else {
						for (const f of e.dataTransfer.files) {
							if (f.type.startsWith('image/')) break
							else file = undefined
						}
					}
					e.dataTransfer.clearData()

					if (file) {
						console.log('Got file type', file.type)
						callback(false, file)
					} else {
						alert('Only images are supported')
					}
				}}
				onDragOver={(e: React.DragEvent) => {
					e.preventDefault()
				}}
			>
				<div className='mb-5 text-6xl'>📸</div>
				<span className='text-lg'>
					Drag a screenshot of UI or click me to upload one.
				</span>
				<div className='mt-2 text-sm'>
					You can also just explain what you want in the text box below.
				</div>
				<div
					className={cn(
						'absolute inset-0 h-full w-full rounded-lg border-2 border-dashed border-zinc-400 bg-transparent',
						dragging && 'border-zinc-100'
					)}
				/>
			</label>
		</div>
	)
}
