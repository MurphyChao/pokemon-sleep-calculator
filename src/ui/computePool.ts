import type { ComputeResult, ComputeTask } from "./computeTasks";

/**
 * A few web workers running Rarity and Rank calculations in parallel, off the page, so it stays responsive
 * and finishes several times sooner on a multi-core device. Each worker runs one task at a time from its own
 * queue. Tasks with an affinity (a species) always go to the same worker, so the rating's per-species cache
 * there is reused; others go to the least busy worker.
 */

interface Request {
	id: number;
	task: ComputeTask;
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	cancelled: boolean;
}

interface Slot {
	worker: Worker;
	queue: Request[];
	running?: Request;
}

export interface Job<T> {
	promise: Promise<T>;
	/** Drops the task if it hasn't started; a running one finishes but its result is ignored (never settles). */
	cancel(): void;
}

export interface ComputePool {
	run<T extends ComputeTask>(task: T, affinity?: string): Job<ComputeResult<T>>;
}

/** Workers to start: one per spare core, at most 4 (more rarely helps and costs memory). */
function workerCount(): number {
	const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
	return Math.min(4, Math.max(1, cores - 1));
}

function hash(text: string): number {
	let h = 2166136261;
	for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	return h >>> 0;
}

function createPool(): ComputePool {
	let nextId = 1;
	const start = (slot: Slot) => {
		while (!slot.running && slot.queue.length > 0) {
			const request = slot.queue.shift() as Request;
			if (request.cancelled) continue;
			slot.running = request;
			slot.worker.postMessage({ id: request.id, task: request.task });
		}
	};
	const slots: Slot[] = Array.from({ length: workerCount() }, () => {
		const slot: Slot = {
			worker: new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" }),
			queue: [],
		};
		slot.worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
			const request = slot.running;
			if (!request || request.id !== event.data.id) return;
			slot.running = undefined;
			if (!request.cancelled) {
				if (event.data.error !== undefined) request.reject(new Error(event.data.error));
				else request.resolve(event.data.result);
			}
			start(slot);
		};
		slot.worker.onerror = (event) => {
			const request = slot.running;
			slot.running = undefined;
			if (request && !request.cancelled) request.reject(new Error(event.message));
			start(slot);
		};
		return slot;
	});
	const load = (slot: Slot) => slot.queue.length + (slot.running ? 1 : 0);
	return {
		run<T extends ComputeTask>(task: T, affinity?: string): Job<ComputeResult<T>> {
			let request!: Request;
			const promise = new Promise<ComputeResult<T>>((resolve, reject) => {
				request = { id: nextId++, task, resolve: resolve as (value: unknown) => void, reject, cancelled: false };
			});
			const slot =
				affinity !== undefined
					? slots[hash(affinity) % slots.length]
					: slots.reduce((a, b) => (load(b) < load(a) ? b : a));
			slot.queue.push(request);
			start(slot);
			return {
				promise,
				cancel: () => {
					request.cancelled = true;
					const i = slot.queue.indexOf(request);
					if (i >= 0) slot.queue.splice(i, 1);
				},
			};
		},
	};
}

let pool: ComputePool | null | undefined;

/** The shared pool, or undefined where web workers aren't available (then the page computes, a slice at a time). */
export function computePool(): ComputePool | undefined {
	if (pool === undefined) {
		try {
			pool = typeof Worker === "undefined" ? null : createPool();
		} catch {
			pool = null;
		}
	}
	return pool ?? undefined;
}
