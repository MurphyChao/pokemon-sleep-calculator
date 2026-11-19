/// <reference lib="webworker" />
/**
 * A web worker running Rarity and Rank calculations off the page (see computePool.ts). It keeps the
 * rating's per-species cache between tasks, which is why the pool sends each species to the same worker.
 */
import { type ComputeTask, runComputeTask } from "./computeTasks";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<{ id: number; task: ComputeTask }>) => {
	const { id, task } = event.data;
	try {
		self.postMessage({ id, result: runComputeTask(task) });
	} catch (error) {
		self.postMessage({ id, error: String(error) });
	}
};
