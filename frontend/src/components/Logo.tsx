import { cn } from 'lib/utils'

export default function Logo({ className = '' }: { className: string }) {
	return (
		<svg
			className={cn('w-16', className)}
			viewBox='0 0 750 400'
			fill='none'
			xmlns='http://www.w3.org/2000/svg'
		>
			<path
				d='M334.462 65.6873C338.978 63.08 339.833 56.9138 336.011 53.3666C300.323 20.2489 252.526 0 200 0C89.5431 0 0 89.5431 0 200C0 310.457 89.5431 400 200 400C234.733 400 267.398 391.146 295.862 375.572C300.592 372.984 301.111 366.513 297.252 362.748C285.202 350.996 274.544 337.415 265.714 322.12L188.447 188.291L188.446 188.29C179.288 172.425 184.723 152.139 200.588 142.98L334.462 65.6873Z'
				fill='url(#paint0_linear_12_2877)'
			/>
			<path
				d='M740 0H560C554.477 0 550 4.47715 550 10V390C550 395.523 554.477 400 560 400H740C745.523 400 750 395.523 750 390V10C750 4.47715 745.523 0 740 0Z'
				fill='url(#paint1_linear_12_2877)'
			/>
			<path
				d='M534 74.426C534 70.2131 532.891 66.0744 530.785 62.4259L499.701 8.58801C494.96 0.375585 484.459 -2.43819 476.246 2.30325L208.588 156.836C200.376 161.577 197.562 172.078 202.303 180.291L279.57 314.12C326.984 396.244 431.996 424.382 514.12 376.968C517.687 374.908 521.153 372.74 524.515 370.469C530.646 366.329 534 359.258 534 351.86V74.426Z'
				fill='url(#paint2_linear_12_2877)'
			/>
			<defs>
				<linearGradient
					id='paint0_linear_12_2877'
					x1='46'
					y1='20'
					x2='265'
					y2='400'
					gradientUnits='userSpaceOnUse'
				>
					<stop stopColor='#FFCF4D' />
					<stop offset='1' stopColor='#FCBA48' />
				</linearGradient>
				<linearGradient
					id='paint1_linear_12_2877'
					x1='525'
					y1='8.40053e-07'
					x2='750.5'
					y2='400'
					gradientUnits='userSpaceOnUse'
				>
					<stop stopColor='#E180FF' />
					<stop offset='1' stopColor='#C264F2' />
				</linearGradient>
				<linearGradient
					id='paint2_linear_12_2877'
					x1='331.5'
					y1='-7.71612e-06'
					x2='555'
					y2='400'
					gradientUnits='userSpaceOnUse'
				>
					<stop stopColor='#11C1D5' />
					<stop offset='1' stopColor='#13A9BA' />
				</linearGradient>
			</defs>
		</svg>
	)
}
