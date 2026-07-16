import { formatGenerationError } from '../errors'

describe('formatGenerationError', () => {
	it.each([
		[
			'copilot_authentication_required',
			'Reconnect your GitHub account to use Copilot.'
		],
		[
			'copilot_entitlement_required',
			'This GitHub account does not have Copilot access.'
		],
		[
			'copilot_invalid_request',
			'The selected Copilot model or input is not supported.'
		],
		[
			'copilot_model_unavailable',
			'Refresh the model list and choose another Copilot model.'
		],
		[
			'copilot_vision_unsupported',
			'Choose a vision-capable Copilot model to use a screenshot.'
		],
		[
			'copilot_rate_limit',
			'Your GitHub Copilot allowance or rate limit has been reached.'
		],
		[
			'copilot_runtime_unavailable',
			'The local GitHub Copilot runtime is unavailable.'
		],
		[
			'copilot_response_timeout',
			'GitHub Copilot did not finish the request in time.'
		],
		[
			'copilot_upstream_error',
			'GitHub Copilot could not complete the request.'
		],
		[
			'copilot_invalid_image',
			'Upload a valid screenshot data URL.'
		],
		[
			'copilot_image_type_unsupported',
			'The selected Copilot model does not accept this image type.'
		],
		[
			'copilot_image_too_large',
			"The screenshot exceeds the selected Copilot model's image limit."
		],
		[
			'copilot_too_many_images',
			'Too many screenshots were supplied for the selected Copilot model.'
		],
		[
			'copilot_empty_request',
			'Enter a prompt or upload a screenshot.'
		],
		[
			'copilot_disabled',
			'GitHub Copilot is not enabled on this OpenUI server.'
		]
	])('maps %s', (code, expected) => {
		expect(formatGenerationError({ code, message: 'raw upstream text' })).toBe(
			expected
		)
	})

	it('preserves ordinary non-Copilot errors', () => {
		expect(formatGenerationError(new Error('Ollama is offline'))).toBe(
			'Ollama is offline'
		)
	})

	it('reads an OpenAI-style nested error without exposing its raw message', () => {
		expect(
			formatGenerationError({
				error: {
					code: 'copilot_entitlement_required',
					message: 'raw upstream text'
				}
			})
		).toBe('This GitHub account does not have Copilot access.')
	})

	it('preserves a nested non-Copilot message', () => {
		expect(
			formatGenerationError({
				error: { message: 'A safe proxy error' }
			})
		).toBe('A safe proxy error')
	})

	it('stringifies primitive failures', () => {
		expect(formatGenerationError('Connection closed')).toBe('Connection closed')
	})
})
