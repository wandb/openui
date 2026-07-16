const copilotMessages: Record<string, string> = {
	copilot_authentication_required:
		'Reconnect your GitHub account to use Copilot.',
	copilot_entitlement_required:
		'This GitHub account does not have Copilot access.',
	copilot_invalid_request:
		'The selected Copilot model or input is not supported.',
	copilot_model_unavailable:
		'Refresh the model list and choose another Copilot model.',
	copilot_vision_unsupported:
		'Choose a vision-capable Copilot model to use a screenshot.',
	copilot_invalid_image: 'Upload a valid screenshot data URL.',
	copilot_image_type_unsupported:
		'The selected Copilot model does not accept this image type.',
	copilot_image_too_large:
		"The screenshot exceeds the selected Copilot model's image limit.",
	copilot_too_many_images:
		'Too many screenshots were supplied for the selected Copilot model.',
	copilot_empty_request: 'Enter a prompt or upload a screenshot.',
	copilot_rate_limit:
		'Your GitHub Copilot allowance or rate limit has been reached.',
	copilot_runtime_unavailable:
		'The local GitHub Copilot runtime is unavailable.',
	copilot_response_timeout:
		'GitHub Copilot did not finish the request in time.',
	copilot_upstream_error:
		'GitHub Copilot could not complete the request.',
	copilot_disabled: 'GitHub Copilot is not enabled on this OpenUI server.'
}

interface ErrorLike {
	code?: unknown
	message?: unknown
	error?: unknown
}

function asErrorLike(value: unknown): ErrorLike | undefined {
	if (typeof value !== 'object' || value === null) return undefined
	return value as ErrorLike
}

export function formatGenerationError(error: unknown): string {
	const outer = asErrorLike(error)
	const nested = asErrorLike(outer?.error)
	for (const value of [outer, nested]) {
		if (!value) continue
		if (typeof value.code === 'string' && copilotMessages[value.code]) {
			return copilotMessages[value.code]
		}
	}
	if (typeof outer?.message === 'string') return outer.message
	if (typeof nested?.message === 'string') return nested.message
	return String(error)
}
