import { useEffect, useMemo, useState } from "react";
import {
	type RankCategory,
	type RankJob,
	type RankTable,
	type RankTables,
	rankBest,
	rankOptions,
	rankSettingsKey,
	rankStrengthOptions,
	rankTableSteps,
} from "../core/rank";
import type { StrengthOptions, YieldOptions } from "../core/yield";

/** Time spent building per slice before letting the page update. */
const sliceMs = 30;
/**
 * Built tables are kept here (not under "pscalc.", so Google sync leaves them alone), for the last few
 * settings, so switching back and forth or reloading doesn't build them again.
 */
const cacheKey = "pscalc-rank-tables";
const cacheSize = 3;
/** Bump when how ranks are measured changes, so old cached tables are dropped. */
const cacheVersion = 5;

const standardKey = rankSettingsKey(rankOptions, rankStrengthOptions);

interface Built {
	/** Each category's best species; undefined until found (or for the shipped tables, which have them all). */
	best?: Map<RankCategory, RankJob>;
	categories: Record<RankCategory, RankTable>;
}
/** What's been built or loaded this visit, by settings key. */
const memory = new Map<string, Built>();

interface CachedTables {
	version: number;
	key: string;
	categories: Record<RankCategory, RankTable>;
}

function readCache(): CachedTables[] {
	try {
		const list = JSON.parse(localStorage.getItem(cacheKey) ?? "[]");
		return Array.isArray(list) ? list.filter((c) => c?.version === cacheVersion && c.categories) : [];
	} catch {
		return [];
	}
}

function writeCache(key: string, categories: Record<RankCategory, RankTable>) {
	try {
		const list = [{ version: cacheVersion, key, categories }, ...readCache().filter((c) => c.key !== key)].slice(0, cacheSize);
		localStorage.setItem(cacheKey, JSON.stringify(list));
	} catch {
		// Storage full or unavailable: the tables stay in memory for this visit.
	}
}

function builtFor(key: string): Built {
	let built = memory.get(key);
	if (!built) {
		built = { categories: key === standardKey ? {} : (readCache().find((c) => c.key === key)?.categories ?? {}) };
		memory.set(key, built);
	}
	return built;
}

export interface RankTablesState {
	/** The tables built so far. */
	tables: RankTables;
	/** Categories asked for that are still being built (their Pokémon show "Rank…"). */
	pending: Set<RankCategory>;
}

/**
 * The rank's tables for these settings, for the categories asked for (those the box's Pokémon are ranked in).
 * For the app's defaults, all of them come shipped, loaded separately so they don't hold up the page.
 * Otherwise each category is built in the browser the first time it's needed (finding the best species is
 * quick; rolling it is the slow part), a slice at a time, and cached. Undefined until the shipped tables load.
 */
export function useRankTables(
	options: YieldOptions,
	strength: StrengthOptions,
	needed: RankCategory[],
): RankTablesState | undefined {
	const key = rankSettingsKey(options, strength);
	// In the order asked for (the box's), so the first rows get their ranks first.
	const neededKey = [...new Set(needed)].join("\n");
	const [, setTick] = useState(0);
	const built = builtFor(key);
	const shipped = key === standardKey;

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => setTick((n) => n + 1);
		if (shipped) {
			if (Object.keys(built.categories).length > 0) return;
			import("../data/rank-tables.json").then((m) => {
				if (cancelled) return;
				built.categories = (m.default as RankTables).categories;
				refresh();
			});
			return () => {
				cancelled = true;
			};
		}
		if (!built.best) {
			built.best = rankBest(options, strength);
			refresh();
		}
		const best = built.best;
		const todo = neededKey
			.split("\n")
			.filter((c) => best.has(c) && !built.categories[c])
			.map((c) => best.get(c) as RankJob);
		if (todo.length === 0) return;
		let steps = rankTableSteps(todo[0], options, strength);
		const step = () => {
			const start = performance.now();
			while (performance.now() - start < sliceMs) {
				const next = steps.next();
				if (!next.done) continue;
				const job = todo.shift() as RankJob;
				built.categories = { ...built.categories, [job.category]: next.value };
				writeCache(key, built.categories);
				refresh();
				if (todo.length === 0) return;
				steps = rankTableSteps(todo[0], options, strength);
			}
			timer = setTimeout(step, 0);
		};
		timer = setTimeout(step, 0);
		return () => clearTimeout(timer);
	}, [key, neededKey]);

	const pendingKey = neededKey
		.split("\n")
		.filter((c) => c && !shipped && !built.categories[c] && (built.best ? built.best.has(c) : true))
		.join("\n");
	const categories = built.categories;
	const state = useMemo(
		() => ({
			tables: { note: shipped ? "Shipped" : "Built in the browser for these settings", categories },
			pending: new Set(pendingKey ? pendingKey.split("\n") : []),
		}),
		[categories, pendingKey, shipped],
	);
	return shipped && Object.keys(categories).length === 0 ? undefined : state;
}
