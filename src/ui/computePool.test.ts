import { afterEach, expect, test, vi } from "vitest";
import { runComputeTask } from "./computeTasks";
import { defaultStrengthOptions, defaultYieldOptions } from "../core/yield";
import type { BoxEntry } from "../core/box";

/** A stand-in for a web worker: runs tasks like compute.worker.ts does, and records which worker got what. */
class FakeWorker {
	static all: FakeWorker[] = [];
	received: string[] = [];
	onmessage?: (event: { data: unknown }) => void;
	onerror?: (event: { message: string }) => void;
	constructor() {
		FakeWorker.all.push(this);
	}
	postMessage({ id, task }: { id: number; task: Parameters<typeof runComputeTask>[0] }) {
		this.received.push(task.kind === "rate" ? task.entry.pokemonName : task.kind === "rankTable" ? task.job.category : task.kind);
		setTimeout(() => this.onmessage?.({ data: { id, result: runComputeTask(task) } }), 0);
	}
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	FakeWorker.all = [];
});

const entry = (pokemonName: string): BoxEntry => ({ id: pokemonName, pokemonName, level: 60, ingredient: "AAA", nature: "Serious", subSkills: {} });
const rate = (pokemonName: string) => ({ kind: "rate" as const, entry: entry(pokemonName), options: defaultYieldOptions, strength: defaultStrengthOptions });

async function pool(cores: number) {
	vi.stubGlobal("Worker", FakeWorker);
	vi.stubGlobal("navigator", { hardwareConcurrency: cores });
	const { computePool } = await import("./computePool");
	return computePool();
}

test("without web workers there's no pool (the page computes instead)", async () => {
	vi.stubGlobal("Worker", undefined);
	const { computePool } = await import("./computePool");
	expect(computePool()).toBeUndefined();
});

test("one worker per spare core, at most 4; a species always goes to the same worker", async () => {
	const p = await pool(8);
	expect(FakeWorker.all).toHaveLength(4);
	const jobs = ["Sceptile", "Crustle", "Sceptile", "Crustle", "Sceptile"].map((n) => p?.run(rate(n), n));
	const ratings = await Promise.all(jobs.map((j) => j?.promise));
	expect(ratings.every((r) => r && r.grade)).toBe(true);
	for (const name of ["Sceptile", "Crustle"]) {
		expect(FakeWorker.all.filter((w) => w.received.includes(name))).toHaveLength(1);
	}
});

test("a 2-core device gets one worker", async () => {
	await pool(2);
	expect(FakeWorker.all).toHaveLength(1);
});

test("a cancelled task that hasn't started is dropped", async () => {
	const p = await pool(2);
	const first = p?.run(rate("Sceptile"), "same");
	const second = p?.run(rate("Crustle"), "same");
	second?.cancel();
	await first?.promise;
	await new Promise((r) => setTimeout(r, 10));
	expect(FakeWorker.all[0].received).toEqual(["Sceptile"]);
});
