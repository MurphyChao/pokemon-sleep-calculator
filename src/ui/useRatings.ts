import { useEffect, useRef, useState } from "react";
import type { BoxEntry } from "../core/box";
import { type Rating, rateEntry } from "../core/rating";
import type { StrengthOptions, YieldOptions } from "../core/yield";

/** Time spent rating per slice before letting the page update. */
const sliceMs = 30;

/**
 * Ratings of the box's Pokémon by entry id. A species' first rating takes a search and a sample of random rolls (~100–150 ms), so
 * ratings are worked out a slice at a time after rendering; entries not rated yet are missing from the map,
 * and entries that can't be rated map to null.
 */
export function useRatings(box: BoxEntry[], options: YieldOptions, strength: StrengthOptions): Map<string, Rating | null> {
	const settingsKey = JSON.stringify([
		options.inventoryLimit,
		options.campTicket,
		options.energy,
		options.sleepScore,
		strength.favorites,
		strength.fieldBonus,
	]);
	/** Ratings by everything they depend on, so unchanged entries keep theirs. */
	const cache = useRef(new Map<string, Rating | null>());
	const [ratings, setRatings] = useState(() => new Map<string, Rating | null>());

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
