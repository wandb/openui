import { useEffect, useState } from 'react'
import { cn } from '../lib/utils'

export default function Examples({
	className,
	style,
	callback
}: {
	className?: string
	style?: React.CSSProperties
	callback: (prompt: string) => void
}) {
	const examples = [
		// 'Make me a flashy landing page for an AI SaaS startup.  Use some gradients and animations on hover.  Come up with an exciting name and create a navigation bar up top.',
		'Create a responsive navigation bar with dropdown menus, using a dark theme.',
		'I need a user profile card with an avatar, name, and social media links in Tailwind CSS.',
		'Generate a modal popup for user feedback, including text area and submit button.',
		'Can you make a pricing table with three tiers, highlighting the best value tier?',
		'Build a responsive image gallery grid that supports lightbox viewing.',
		"I'm looking for a login form with email and password fields, plus a remember me checkbox.",
		'Design a newsletter signup section with an input field and a subscribe button, featuring a minimalist aesthetic.',
		'Create a footer with columns for links, a brief about section, and social media icons.',
		'Generate a dashboard layout with a sidebar navigation, header, and content area.',
		'I need an accordion FAQ section where questions expand to show answers on click.',
		'Produce a blog post template with a featured image, title, date, author, and content area.',
		'Design a to-do list app interface with tasks, checkboxes, and an add task form.',
		'Create a progress bar component that shows percentage completion and can be styled dynamically.',
		'Generate a contact form with name, email, message fields, and a send button, with validation styles.',
		'Design a carousel slider for featured articles with previous and next controls, using a sleek, modern look.',
		'Create a set of social share buttons with icons for Facebook, Twitter, LinkedIn, and Instagram, with a hover effect.',
		'Generate a responsive table with sortable columns, row highlight on hover, and pagination.',
		"I need a card layout for product listings, including an image, title, price, and 'Add to Cart' button.",
		"Build a timeline component for displaying a project's milestones, with vertical lines and circular markers.",
		'Design a weather widget showing the current temperature, weather condition icons, and a 5-day forecast.',
		'Create an alert component with success, warning, and error variations that can be dismissed.',
		'Generate a multi-step form for a checkout process, including progress indicators.',
		"I'm looking for a tab component with horizontal navigation and dynamically loaded content.",
		'Design a search bar with autocomplete suggestions that appear as the user types.',
		'Create a sticky header that becomes visible when scrolling up and hides on scrolling down.',
		'Generate a set of animated loading spinners with different styles for asynchronous data loading.',
		'I need a grid of cards for team members, including photo, name, role, and a short bio, with a flip effect on hover.',
		'Build a testimonial slider with quotes from customers, including their names and photos.',
		'Design a date picker component that integrates with a form and supports range selection.',
		'Generate a set of badges for different status levels like New, In Progress, and Completed, with customizable colors.'
	]
	const [ids, setIds] = useState<number[]>([])

	useEffect(() => {
		const uniqRandIDs = new Set<number>()
		while (uniqRandIDs.size < 3) {
			uniqRandIDs.add(Math.floor(Math.random() * examples.length))
		}
		setIds([...uniqRandIDs])
	}, [examples.length])

	return (
		<div
			className={cn(
				className,
				'flex flex-wrap items-center justify-center gap-2 transition-all duration-500'
			)}
			style={style}
		>
			<button
				onClick={() => callback(examples[ids[0]])}
				type='button'
				className='w-xs min-w-xs max-w-xs cursor-pointer truncate rounded-full bg-gradient-to-r from-teal-400 to-blue-500 px-4 py-2 text-white transition-all hover:from-teal-500 hover:to-blue-600'
			>
				<span
					className='transition-all hover:-ml-96 hover:mr-36'
					style={{ transitionDuration: '3000ms' }}
				>
					{examples[ids[0]]}
				</span>
			</button>
			<button
				onClick={() => callback(examples[ids[1]])}
				type='button'
				className='w-xs min-w-xs max-w-xs cursor-pointer truncate rounded-full bg-gradient-to-r from-purple-400 to-pink-500 px-4 py-2 text-white transition-all hover:from-purple-500 hover:to-pink-600'
			>
				<span
					className='transition-all hover:-ml-96 hover:mr-36'
					style={{ transitionDuration: '3000ms' }}
				>
					{examples[ids[1]]}
				</span>
			</button>
			<button
				onClick={() => callback(examples[ids[2]])}
				type='button'
				className='w-xs min-w-xs max-w-xs cursor-pointer truncate rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-2 text-white transition-all hover:from-yellow-500 hover:to-orange-600'
			>
				<span
					className='transition-all hover:-ml-96 hover:mr-36'
					style={{ transitionDuration: '3000ms' }}
				>
					{examples[ids[2]]}
				</span>
			</button>
		</div>
	)
}
