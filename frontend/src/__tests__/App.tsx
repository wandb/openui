import { screen } from '@testing-library/react'
import App from 'App'
import renderWithProviders from 'testUtils'

describe('<App />', () => {
	it('renders', async () => {
		window.history.pushState({}, 'Home', '/')
		renderWithProviders(<App />, false)

		// Wait for the app to load and verify the NavBar is present
		// Per-query timeout: Istanbul coverage instrumentation adds ~150 ms of
		// module-transform overhead to the lazy-loaded pages/AI chunk, pushing
		// the covered render past the 1 s default.  5 s is evidence-based
		// headroom; the assertion still fires as soon as the element appears.
		await expect(
			screen.findByRole('navigation', {}, { timeout: 5000 })
		).resolves.toBeInTheDocument()
	})
})
