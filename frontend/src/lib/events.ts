type Listener = (data: unknown) => void

export class EventTarget {
	private events: Record<string, Listener[] | undefined>

	private buffers: Record<string, unknown[] | undefined>

	public constructor() {
		this.events = {}
		this.buffers = {}
	}

	public on(event: string, listener: Listener): void {
		if (!this.events[event]) {
			this.events[event] = []
		}
		if (this.buffers[event]) {
			for (const data of this.buffers[event] ?? []) {
				listener(data)
			}
			this.buffers[event] = undefined
		}
		this.events[event]?.push(listener)
	}

	public off(event: string, listenerToRemove: Listener): void {
		if (!this.events[event]) return

		this.events[event] = this.events[event]?.filter(
			listener => listener !== listenerToRemove
		)
	}

	public emit(event: string, data: unknown): void {
		if (!this.events[event]) {
			if (!this.buffers[event]) {
				this.buffers[event] = []
			}
			this.buffers[event]?.push(data)
			return
		}

		for (const listener of this.events[event] ?? []) listener(data)
	}
}

const eventEmitter = new EventTarget()
export default eventEmitter
