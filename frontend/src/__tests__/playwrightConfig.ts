import { resolveContainerImage } from '../lib/playwrightContainer'

describe('Playwright container configuration', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('uses the image built by the current repository workflow', () => {
		expect(
			resolveContainerImage({
				REGISTRY: 'ghcr.io',
				IMAGE_NAME: 'Example/OpenUI',
				DOCKER_TAG: 'sha-abcdef0'
			})
		).toBe('ghcr.io/example/openui:sha-abcdef0')
	})

	it('keeps the upstream latest image as the local default', () => {
		expect(resolveContainerImage({})).toBe('ghcr.io/wandb/openui:latest')
	})

	it('reads the workflow image from the process environment by default', () => {
		vi.stubEnv('REGISTRY', 'ghcr.io')
		vi.stubEnv('IMAGE_NAME', 'example/openui')
		vi.stubEnv('DOCKER_TAG', 'sha-1234567')

		expect(resolveContainerImage()).toBe('ghcr.io/example/openui:sha-1234567')
	})
})
