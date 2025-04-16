import { screen } from '@testing-library/react'
import App from 'App'
import renderWithProviders from 'testUtils'

describe('<App />', () => {
	it('renders', async () => {
		window.history.pushState({}, 'Home', '/')
		renderWithProviders(<App />, false)

		// Wait for the app to load and verify the NavBar is present
		await expect(screen.findByRole('navigation')).resolves.toBeInTheDocument()
	})
})
