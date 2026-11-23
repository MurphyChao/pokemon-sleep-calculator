import { useEffect, useRef, useState } from "react";
import type { BoxEntry } from "../core/box";
import { type Rating, rateEntry } from "../core/rating";
import { eventKey } from "../core/event";
import type { StrengthOptions, YieldOptions } from "../core/yield";
import { computePool, type Job } from "./computePool";

/** Time spent rating per slice before letting the page update. */
const sliceMs = 30;

/**
 * Ratings of the box's Pokémon by entry id. A species' first rating takes a search and a sample of random
 * rolls (~100 ms to a second), so ratings are worked out after rendering: in web workers, in parallel (each
 * species on one worker, see computePool.ts), or where there are none, on the page a slice at a time.
 * Entries not rated yet are missing from the map, and entries that can't be rated map to null.
 */
export function useRatings(box: BoxEntry[], options: YieldOptions, strength: StrengthOptions): Map<string, Rating | null> {
	const settingsKey = JSON.stringify([
		options.inventoryLimit,
		options.campTicket,
		options.energy,
		options.sleepScore,
		strength.favorites,
		strength.fieldBonus,
		eventKey(options),
	]);
	/** Ratings by everything they depend on, so unchanged entries keep theirs. */
	const cache = useRef(new Map<string, Rating | null>());
	const [ratings, setRatings] = useState(() => new Map<string, Rating | null>());
	/** Ratings being worked out by the workers, by key. */
	const inflight = useRef(new Map<string, Job<Rating | null>>());
	/** Shows the ratings worked out so far for the current box (set by the latest effect). */
	const publish = useRef(() => {});

	useEffect(() => {
		const keyOf = (e: BoxEntry) =>
			JSON.stringify([
				settingsKey,
				e.pokemonName,
				e.level,
				e.skillLevel,
				e.ingredient,
				e.nature,
				e.subSkills,
				e.scaledFrom,
				e.seededFrom,
			]);
		const settings = { options, strength };
		let timer: ReturnType<typeof setTimeout> | undefined;
		const pool = computePool();
		if (pool) {
			const wanted = new Set(box.map(keyOf));
			for (const [key, job] of inflight.current) {
				if (!wanted.has(key)) {
					job.cancel();
					inflight.current.delete(key);
				}
			}
			publish.current = () => {
				const next = new Map<string, Rating | null>();
				for (const e of box) {
					const key = keyOf(e);
					if (cache.current.has(key)) next.set(e.id, cache.current.get(key) ?? null);
				}
				setRatings(next);
			};
			// Results arriving close together are shown together.
			const schedule = () => {
				timer ??= setTimeout(() => {
					timer = undefined;
					publish.current();
				}, 16);
			};
			for (const e of box) {
				const key = keyOf(e);
				if (cache.current.has(key) || inflight.current.has(key)) continue;
				const job = pool.run(
					{ kind: "rate", entry: e, options: settings.options, strength: settings.strength },
					`${e.pokemonName}|${settingsKey}`,
				);
				inflight.current.set(key, job);
				const done = (rating: Rating | null) => {
					cache.current.set(key, rating);
					inflight.current.delete(key);
					schedule();
				};
				job.promise.then(done, () => done(null));
			}
			publish.current();
			return () => clearTimeout(timer);
		}
		const step = () => {
			const start = performance.now();
			const next = new Map<string, Rating | null>();
			let pending = false;
			for (const e of box) {
				const key = keyOf(e);
				if (!cache.current.has(key)) {
					if (performance.now() - start > sliceMs) {
						pending = true;
						continue;
					}
					let rating: Rating | null;
					try {
						rating = rateEntry(e, settings.options, settings.strength);
					} catch {
						rating = null;
					}
					cache.current.set(key, rating);
				}
				next.set(e.id, cache.current.get(key) ?? null);
			}
			setRatings(next);
			if (pending) timer = setTimeout(step, 0);
		};
		step();
		return () => clearTimeout(timer);
	}, [box, settingsKey]);

	return ratings;
}
