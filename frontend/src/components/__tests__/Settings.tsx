import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDefaultStore } from 'jotai'
import server from 'mocks/server'
import renderWithProviders from 'testUtils'
import {
	modelAtom,
	modelSupportsImagesAtom,
	modelSupportsImagesOverridesAtom
} from 'state'
import Settings from '../Settings'

const catalog = {
	models: {
		openai: [],
		groq: [],
		ollama: [],
		litellm: [],
		copilot: [
			{
				id: 'copilot/gpt-test',
				name: 'GPT Test',
				capabilities: {
					vision: true,
					supported_media_types: ['image/png'],
					max_prompt_images: 1,
					max_prompt_image_size: 1024
				}
			}
		]
	},
	copilot_status: { state: 'connected', message: null }
}

describe('<Settings /> Copilot', () => {
	beforeEach(() => {
		localStorage.clear()
		const store = getDefaultStore()
		store.set(modelAtom, 'gpt-3.5-turbo')
		store.set(modelSupportsImagesAtom, false)
		store.set(modelSupportsImagesOverridesAtom, {})
	})

	it('prefers the first Copilot model when OpenAI is unavailable', async () => {
		server.use(http.get('/v1/models', () => HttpResponse.json(catalog)))
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))

		await waitFor(() => {
			expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent(
				'GPT Test'
			)
		})
	})

	it('lists Copilot models and marks provider vision metadata read-only', async () => {
		server.use(http.get('/v1/models', () => HttpResponse.json(catalog)))
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))
		await user.click(screen.getByRole('combobox', { name: 'Model' }))

		expect(await screen.findByText('GitHub Copilot')).toBeInTheDocument()
		expect(screen.getByRole('option', { name: 'GPT Test' })).toBeInTheDocument()

		await user.click(screen.getByRole('option', { name: 'GPT Test' }))
		expect(
			screen.getByRole('switch', { name: 'Supports Vision' })
		).toBeChecked()
		expect(
			screen.getByRole('switch', { name: 'Supports Vision' })
		).toBeDisabled()
		expect(
			screen.getByText('Vision capability is reported by GitHub Copilot.')
		).toBeInTheDocument()
	})

	it('shows a reconnect action for expired authentication', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					...catalog,
					models: { ...catalog.models, copilot: [] },
					copilot_status: {
						state: 'reauthenticate',
						message: 'Reconnect your GitHub account.'
					}
				})
			)
		)
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))

		const reconnect = await screen.findByRole('link', {
			name: 'Reconnect GitHub'
		})
		expect(reconnect).toHaveAttribute('href', '/v1/login?redirect=%2Fai%2Fnew')
	})

	it.each([
		['no_entitlement', 'This account has no Copilot entitlement.'],
		['rate_limited', 'The Copilot allowance has been reached.'],
		['unavailable', 'The local Copilot runtime is unavailable.']
	])('shows the %s provider state', async (state, message) => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					...catalog,
					models: { ...catalog.models, copilot: [] },
					copilot_status: { state, message }
				})
			)
		)
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))

		expect(await screen.findByText(message)).toBeInTheDocument()
	})
})

describe('<Settings /> Device Mode', () => {
	beforeEach(() => {
		localStorage.clear()
		const store = getDefaultStore()
		store.set(modelAtom, 'gpt-3.5-turbo')
		store.set(modelSupportsImagesAtom, false)
		store.set(modelSupportsImagesOverridesAtom, {})
	})

	it('renders the device login component when auth_mode is device and state is signed_out', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					models: {
						openai: [],
						groq: [],
						ollama: [],
						litellm: [],
						copilot: []
					},
					copilot_status: {
						state: 'signed_out',
						message: null,
						auth_mode: 'device'
					}
				})
			)
		)
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))

		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Connect GitHub Copilot' })
			).toBeInTheDocument()
		)
	})

	it('renders the device login component when auth_mode is device and state is reauthenticate', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					models: {
						openai: [],
						groq: [],
						ollama: [],
						litellm: [],
						copilot: []
					},
					copilot_status: {
						state: 'reauthenticate',
						message: 'Please reconnect.',
						auth_mode: 'device'
					}
				})
			)
		)
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))

		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Connect GitHub Copilot' })
			).toBeInTheDocument()
		)
		// Must NOT show the OAuth reconnect link
		expect(
			screen.queryByRole('link', { name: 'Reconnect GitHub' })
		).not.toBeInTheDocument()
	})

	it('keeps the OAuth reconnect link when auth_mode is not device', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					models: {
						openai: [],
						groq: [],
						ollama: [],
						litellm: [],
						copilot: []
					},
					copilot_status: {
						state: 'reauthenticate',
						message: 'Reconnect your GitHub account.'
						// no auth_mode → OAuth
					}
				})
			)
		)
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))

		const reconnect = await screen.findByRole('link', {
			name: 'Reconnect GitHub'
		})
		expect(reconnect).toHaveAttribute('href', '/v1/login?redirect=%2Fai%2Fnew')
		expect(
			screen.queryByRole('button', { name: 'Connect GitHub Copilot' })
		).not.toBeInTheDocument()
	})

	it('lists models normally when connected in device mode', async () => {
		server.use(
			http.get('/v1/models', () =>
				HttpResponse.json({
					models: {
						openai: [],
						groq: [],
						ollama: [],
						litellm: [],
						copilot: [
							{
								id: 'copilot/gpt-device',
								name: 'GPT Device',
								capabilities: {
									vision: false,
									supported_media_types: [],
									max_prompt_images: null,
									max_prompt_image_size: null
								}
							}
						]
					},
					copilot_status: {
						state: 'connected',
						message: null,
						auth_mode: 'device'
					}
				})
			)
		)
		const user = userEvent.setup()
		renderWithProviders(
			<Settings trigger={<button type='button'>Open settings</button>} />
		)

		await user.click(screen.getByRole('button', { name: 'Open settings' }))
		await user.click(screen.getByRole('combobox', { name: 'Model' }))

		expect(await screen.findByText('GitHub Copilot')).toBeInTheDocument()
		expect(
			screen.getByRole('option', { name: 'GPT Device' })
		).toBeInTheDocument()
		// No device login button when connected
		expect(
			screen.queryByRole('button', { name: 'Connect GitHub Copilot' })
		).not.toBeInTheDocument()
	})
})
