import type { BoxEntry } from "../core/box";
import type { RatingRole } from "../core/rating";
import pokemons, { type IngredientName, type PokemonType } from "../vendor/pokesleep-tool/data/pokemons";
import { slotIngredients } from "./IngredientIcons";

/** What a Pokémon can be filtered by being kept for. */
export const jobs = ["strength", "ingredients", "skill"] as const;
export type Job = (typeof jobs)[number];

/**
 * The jobs a Pokémon with this rating role does: hybrids (ingredients + a support skill, e.g. Blissey) count
 * as both ingredient and skill Pokémon.
 */
export function jobsOf(role: RatingRole | undefined): Job[] {
	switch (role) {
		case "strength":
			return ["strength"];
		case "ingredients":
			return ["ingredients"];
		case "hybrid":
			return ["ingredients", "skill"];
		case "support":
			return ["skill"];
		default:
			return [];
	}
}

/** Box table filters; an empty list means no filter (everything shown). */
export interface BoxFilter {
	types: PokemonType[];
	ingredients: IngredientName[];
	jobs: Job[];
}

export const noFilter: BoxFilter = { types: [], ingredients: [], jobs: [] };

/**
 * Clicking a filter choice: with nothing selected (all shown), the first click shows only that one;
 * later clicks add or remove choices. Removing the last one shows everything again.
 */
export function toggleChoice<T>(selected: T[], value: T): T[] {
	return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

const typeByName = new Map(pokemons.map((p) => [p.name, p.type]));

export function pokemonType(entry: BoxEntry): PokemonType | undefined {
	return typeByName.get(entry.pokemonName);
}

/** Ingredients the Pokémon has unlocked (slots at or below its level). */
export function unlockedIngredients(entry: BoxEntry): IngredientName[] {
	return slotIngredients(entry)
		.filter((s) => s.unlocked)
		.map((s) => s.name);
}

/**
 * Whether a Pokémon passes the filters: one of the selected types (if any), one of the selected
 * ingredients unlocked (if any), and one of the selected jobs (if any) for its rating role as its final
 * form. `adjusted` is the Pokémon as the numbers see it (level scaling and final evolution can unlock more
 * ingredient slots).
 */
export function matchesFilter(entry: BoxEntry, adjusted: BoxEntry, filter: BoxFilter, role?: RatingRole): boolean {
	if (filter.jobs.length > 0 && !jobsOf(role).some((j) => filter.jobs.includes(j))) return false;
	if (filter.types.length > 0) {
		const type = pokemonType(entry);
		if (!type || !filter.types.includes(type)) return false;
	}
	if (filter.ingredients.length > 0) {
		const unlocked = unlockedIngredients(adjusted);
		if (!filter.ingredients.some((i) => unlocked.includes(i))) return false;
	}
	return true;
}
