import { cn } from 'lib/utils'
import { useState } from 'react'

export default function FileUpload({
	onDropFile,
	onClick
}: {
	onDropFile: (file?: File) => void,
	onClick: () => void;
}) {
	const [dragging, setDragging] = useState(false)

	return (
		<div
			className='flex h-full items-center bg-background'
			onKeyUp={(e) => {
				if (e.key === 'Enter') { 
					onClick()
				}
			}}
			role='button'
			tabIndex={0}
			onClick={onClick}
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
					onDropFile(file)
				} else {
					alert('Only images are supported')
				}
			}}
			onDragOver={(e: React.DragEvent) => {
				e.preventDefault()
			}}
		>
			<label
				className='relative mx-auto h-64 w-64 cursor-pointer rounded-lg bg-white p-4 text-center text-zinc-600 shadow-lg dark:bg-zinc-800'
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
