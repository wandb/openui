import { cn } from 'lib/utils'
import { useEffect, useState } from 'react'

export default function FileUpload({
	onDropFile,
	onClick
}: {
	onDropFile: (file?: File) => void
	onClick: () => void
}) {
	const [dragging, setDragging] = useState(false)

	useEffect(() => {
		const handlePaste = (e: ClipboardEvent) => {
			const items = e.clipboardData?.items
			let file: File | null | undefined
			if (items) {
				for (const item of items) {
					if (item.type.startsWith('image/')) {
						file = item.getAsFile()
						break
					}
				}
				if (file) {
					console.log('Pasted file type', file.type)
					onDropFile(file)
				} else {
					console.error('File type not supported', items[0].type)
				}
			}
		}

		window.addEventListener('paste', handlePaste)
		return () => {
			window.removeEventListener('paste', handlePaste)
		}
	}, [onDropFile])

	return (
		<div
			className='flex h-full items-center bg-background'
			onKeyUp={e => {
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
			{/* eslint jsx-a11y/label-has-associated-control: ["error", { assert: "either" } ] */}
			<label
				htmlFor='file-input'
				className='relative mx-auto h-64 w-64 cursor-pointer rounded-lg bg-white p-4 text-center text-zinc-600 shadow-lg dark:bg-zinc-800'
			>
				<div className='center -mt-3'>
					<img
						src='/android-chrome-192x192.png'
						className='inline-block w-24'
						alt='OpenUI'
					/>
				</div>
				<span className='text-lg'>
					Drag a screenshot of UI, paste it, or click me to upload one.
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
