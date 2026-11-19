import type { BoxEntry } from "../core/box";
import { buildRankTable, type RankJobMessage, type RankTable, rankJobOfMessage } from "../core/rank";
import { type Rating, rateEntry } from "../core/rating";
import type { StrengthOptions, YieldOptions } from "../core/yield";

/** The slow calculations, as run by the web workers (compute.worker.ts) or, without them, on the page. */
export type ComputeTask =
	| { kind: "rate"; entry: BoxEntry; options: YieldOptions; strength: StrengthOptions }
	| { kind: "rankTable"; job: RankJobMessage; options: YieldOptions; strength: StrengthOptions };

export type ComputeResult<T extends ComputeTask> = T extends { kind: "rate" } ? Rating | null : RankTable;

/** Runs a task. A Pokémon that can't be rated gets null; a rank table that can't be built throws. */
export function runComputeTask(task: ComputeTask): Rating | RankTable | null {
	if (task.kind === "rate") {
		try {
			return rateEntry(task.entry, task.options, task.strength);
		} catch {
			return null;
		}
	}
	return buildRankTable(rankJobOfMessage(task.job), task.options, task.strength);
}
