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
	// TODO: once we figure out how to get unsplash to work consistently...
	await expect(iframe.locator('img')).toHaveAttribute(
		'src',
		/.*(unsplash|placehold)\.co.*/
	)
	const annotator = await page.$('#version-0')
	await annotator?.screenshot({
		path: './screenshots/annotator-screenshot.png'
	})
	await page.getByRole('button', { name: 'Edit HTML', exact: true }).click()
	const monacoEditor = page.locator('.monaco-editor').nth(0)
	await monacoEditor.click({
		position: {
			x: 300,
			y: 300
		}
	})
	await monacoEditor.click({
		position: {
			x: 300,
			y: 300
		}
	})
	/* TODO: add back when I figure out what position is relative to...
	await page.keyboard.type(
		'<div class="edited">Inserted some cool text</div>\n'
	)
	await page.getByRole('button', { name: 'Edit HTML', exact: true }).click()
	iframe = await page.frameLocator('#version-1')
	await expect(iframe.locator('div.edited')).toHaveText(
		'Inserted some cool text'
	)
	*/
})
