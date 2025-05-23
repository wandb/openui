import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// Import dotenv from 'dotenv';
// Dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './integration_tests',
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: Boolean(process.env.CI),
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 2 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: process.env.CI ? [['github'], ['html']] : 'html',
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Base URL to use in actions like `await page.goto('/')`. */
		// BaseURL: 'http://127.0.0.1:3000',

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',
		screenshot: 'on'
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'Mobile Safari',
			use: { ...devices['iPhone 12'] }
		}

		/* Other browser 
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		},

		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		} */

		/* Test against mobile viewports. */
		// {
		//   Name: 'Mobile Chrome',
		//   Use: { ...devices['Pixel 5'] },
		// },
		// {
		//   Name: 'Mobile Safari',
		//   Use: { ...devices['iPhone 12'] },
		// },

		/* Test against branded browsers. */
		// {
		//   Name: 'Microsoft Edge',
		//   Use: { ...devices['Desktop Edge'], channel: 'msedge' },
		// },
		// {
		//   Name: 'Google Chrome',
		//   Use: { ...devices['Desktop Chrome'], channel: 'chrome' },
		// },
	],

	/* Run your local dev server before starting the tests */
	webServer: {
		command: `docker run --rm --name openui -p 7979:7878 ghcr.io/wandb/openui:${process.env.DOCKER_TAG ?? 'latest'}`,
		url: 'http://127.0.0.1:7979',
		reuseExistingServer: !process.env.CI,
		timeout: 90_000
	}
})
