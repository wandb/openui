type ContainerEnvironment = {
	[name: string]: string | undefined
	REGISTRY?: string
	IMAGE_NAME?: string
	DOCKER_TAG?: string
}

export function resolveContainerImage(
	environment: ContainerEnvironment = process.env
): string {
	const registry = environment.REGISTRY ?? 'ghcr.io'
	const imageName = (environment.IMAGE_NAME ?? 'wandb/openui').toLowerCase()
	const tag = environment.DOCKER_TAG ?? 'latest'

	return `${registry}/${imageName}:${tag}`
}
