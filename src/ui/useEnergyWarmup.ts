import { useEffect } from "react";
import { type EnergyTabInput, type EnergyTabResult } from "../core/energyTab";
import { computePool, type Job } from "./computePool";
import { cacheEnergy, cachedEnergy } from "./energyCache";

/** Waits this long after the inputs last changed, so quick successive changes start only one. */
const delayMs = 400;

/**
 * Works out the energy solver's results ahead, in a web worker, while another tab is shown: whenever the box,
 * settings, dish, pins or exclusions change, so opening the energy solver shows them at once. Does nothing when
 * they're cached already, or where there are no web workers (the page then works them out when it's opened).
 */
export function useEnergyWarmup(input: EnergyTabInput, key: string, active: boolean) {
	useEffect(() => {
		if (!active || input.box.length === 0 || cachedEnergy(key)) return;
		const pool = computePool();
		if (!pool) return;
		let job: Job<EnergyTabResult> | undefined;
		const timer = setTimeout(() => {
			job = pool.run({ kind: "energyTab", input });
			job.promise.then(
				(result) => {
					if (!cachedEnergy(key)) cacheEnergy(key, result);
				},
				() => {},
			);
		}, delayMs);
		return () => {
			clearTimeout(timer);
			job?.cancel();
		};
	}, [key, active]);
}
