import { expect, test } from '@playwright/test'
import { HOST } from './util'

test('test good flow', async ({ page }) => {
	await page.goto(`${HOST}/ai/new?dummy=good`)

	await expect(page).toHaveTitle(/Create a new UI/)
	await page.locator('#llm-input button[type="submit"]').click()
	// Wait for our LLM to finish generating the UI
	await page.waitForFunction(
		s => !document.querySelector(s),
		'#llm-input .rendering',
		{ timeout: 10000 }
	)
	await page
		.getByRole('button', { name: 'Toggle dark/light mode', exact: true })
		.click()
	await page.getByRole('button', { name: 'Change theme', exact: true }).click()
	await page.getByRole('button', { name: 'Orange' }).click()
	const iframe = await page.frameLocator('#version-0')
	await expect(iframe.locator('h1')).toHaveText('Hello, world!')
	await expect(iframe.locator('img')).toHaveAttribute(
		'src',
		/.*unsplash\.com.*/
	)
	const annotator = await page.$('#version-0')
	await annotator?.screenshot({
		path: 'playwright-report/annotator-screenshot.png'
	})
})
