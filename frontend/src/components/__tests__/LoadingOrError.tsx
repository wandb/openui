import { render, screen } from '@testing-library/react'
import LoadingOrError from '../LoadingOrError'

describe('<LoadingOrError />', () => {
	it('renders', () => {
		render(<LoadingOrError />)
		expect(screen.getByTestId('LoadingOrError')).toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveClass('animate-spin')
	})
	it('renders with an error message', () => {
		render(<LoadingOrError error={new Error('Failed to fetch')} />)
		expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
	})
})
