import { useEffect, useState } from "react";
import shippedTables from "../data/rank-tables.json";
import {
	type RankTables,
	RankTableBuilder,
	rankJobs,
	rankOptions,
	rankSettingsKey,
	rankStrengthOptions,
	sampleRankJob,
} from "../core/rank";
import type { StrengthOptions, YieldOptions } from "../core/yield";

/** Random rolls per species and category when built in the browser, as many as the shipped tables. */
const browserRolls = 600;
/** Time spent building per slice before letting the page update. */
const sliceMs = 30;
/**
 * Built tables are kept here (not under "pscalc.", so Google sync leaves them alone), for the last few
 * settings, so switching back and forth or reloading doesn't build them again.
 */
const cacheKey = "pscalc-rank-tables";
const cacheSize = 3;
/** Bump when how ranks are measured changes, so old cached tables are dropped. */
const cacheVersion = 3;

const standardKey = rankSettingsKey(rankOptions, rankStrengthOptions);
const memory = new Map<string, RankTables>([[standardKey, shippedTables as RankTables]]);

interface CachedTables {
	version: number;
	key: string;
	tables: RankTables;
}

function readCache(): CachedTables[] {
	try {
		const list = JSON.parse(localStorage.getItem(cacheKey) ?? "[]");
		return Array.isArray(list) ? list.filter((c) => c?.version === cacheVersion) : [];
	} catch {
		return [];
	}
}

function writeCache(key: string, tables: RankTables) {
	try {
		const list = [{ version: cacheVersion, key, tables }, ...readCache().filter((c) => c.key !== key)].slice(0, cacheSize);
		localStorage.setItem(cacheKey, JSON.stringify(list));
	} catch {
		// Storage full or unavailable: the tables stay in memory for this visit.
	}
}

function cached(key: string): RankTables | undefined {
	let tables = memory.get(key);
	if (!tables) {
		tables = readCache().find((c) => c.key === key)?.tables;
		if (tables) memory.set(key, tables);
	}
	return tables;
}

/**
 * The rank's comparison population for these settings: the shipped tables for the app's defaults, otherwise
 * built in the browser a slice at a time (undefined until done) and cached.
 */
export function useRankTables(options: YieldOptions, strength: StrengthOptions): RankTables | undefined {
	const key = rankSettingsKey(options, strength);
	const [built, setBuilt] = useState<{ key: string; tables: RankTables } | undefined>();

	useEffect(() => {
		if (cached(key)) return;
		const jobs = rankJobs(options, strength);
		const builder = new RankTableBuilder();
		let next = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const step = () => {
			const start = performance.now();
			while (next < jobs.length && performance.now() - start < sliceMs) {
				const job = jobs[next++];
				builder.add(job, sampleRankJob(job, options, strength, browserRolls));
			}
			if (next < jobs.length) {
				timer = setTimeout(step, 0);
				return;
			}
			const tables = builder.build(`${browserRolls} random rolls per Pokémon and category, built in the browser`);
			memory.set(key, tables);
			writeCache(key, tables);
			setBuilt({ key, tables });
		};
		timer = setTimeout(step, 0);
		return () => clearTimeout(timer);
	}, [key]);

	return cached(key) ?? (built?.key === key ? built.tables : undefined);
}
