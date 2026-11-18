/**
 * Cross-species rank: how a Pokémon's daily output compares with random rolls of every (non-mythical) fully
 * evolved Pokémon doing the same job, in a unit all of them share. Unlike the rating (rarity), which only
 * compares a Pokémon with other rolls of its own species.
 *
 * Every Pokémon is measured the same way, so the comparison population can be computed once by
 * `npm run build-rank-tables` (src/data/rank-tables.json): at Lv80, with Sub Skill Seeds used and the main
 * skill maxed except for Ingredients specialists (as in the rating), under standard settings (the app's
 * defaults: full energy, inventory limit on, no camp ticket, no favorite berries, no island bonus).
 *
 * The categories (a Pokémon's job decides which; hybrids are ranked in both and the better rank counts):
 * - strength: berry strength + strength-skill strength per day
 * - ingredients: ingredient strength per day (each ingredient's base strength × count, skill ones included)
 * - skill:<kind>: what the main skill gives per day in its own unit (energy, Extra Tasty chance, dream
 *   shards…), only against Pokémon with the same kind of skill (variants like "(Random)" count as one kind)
 * Helping Bonus adds 4 × 5.3% of the Pokémon's own output with a neutral nature and no subskills, as in the
 * rating.
 */
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import type { IngredientType } from "../vendor/pokesleep-tool/util/PokemonIv";
import { ingredientStrength } from "../vendor/pokesleep-tool/util/PokemonRp";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, subSkillLevels, toPokemonIv } from "./box";
import { type Grade, gradeOf, helpingBonusTeamValue, type RatingProblem, ratingProblem } from "./rating";
import { defaultStrengthOptions, defaultYieldOptions, type YieldDetail } from "./yield";

/** Settings every rank is measured with (the app's defaults), so ranks compare across users and settings. */
export const rankOptions = defaultYieldOptions;
export const rankStrengthOptions = defaultStrengthOptions;

/** "strength", "ingredients" or "skill:<kind>" (e.g. "skill:Energy for Everyone S"). */
export type RankCategory = string;

/** A main skill's kind: its name without a variant in brackets ("Charge Strength S (Random)" → "Charge Strength S"). */
export function skillKind(skill: string): string {
	return skill.replace(/\s*\(.*\)\s*$/, "");
}

function ingredientValue(d: YieldDetail): number {
	return (Object.entries(d.total) as [IngredientName, number][]).reduce(
		(sum, [ing, n]) => sum + n * (ingredientStrength[ing] ?? 0),
		0,
	);
}

function categoryValue(category: RankCategory, d: YieldDetail): number {
	if (category === "strength") return d.berryStrength + d.skillStrength;
	if (category === "ingredients") return ingredientValue(d);
	return d.skillValue > 0 ? d.skillValue : d.skillsPerDay;
}

/** The categories a Pokémon is ranked in, from its role (see the rating) and main skill. */
export function rankCategories(problem: RatingProblem, skill: string): RankCategory[] {
	const kind = `skill:${skillKind(skill)}`;
	switch (problem.role) {
		case "strength":
			return ["strength"];
		case "ingredients":
			return ["ingredients"];
		case "support":
			return [kind];
		case "hybrid":
			return ["ingredients", kind];
	}
}

/**
 * The Pokémon's value in each of its categories with this nature, these subskills as rolled and this
 * ingredient combination, measured as described above.
 */
export function rankValues(
	problem: RatingProblem,
	skill: string,
	nature: string,
	subSkills: SubSkillType[],
	combo?: IngredientType,
): Map<RankCategory, number> {
	const detail = problem.detailOf(nature, subSkills, combo);
	const bonus = subSkills.includes("Helping Bonus");
	const baseline = bonus ? problem.detailOf("Serious", [], combo) : undefined;
	return new Map(
		rankCategories(problem, skill).map((c) => [
			c,
			categoryValue(c, detail) + (baseline ? helpingBonusTeamValue * categoryValue(c, baseline) : 0),
		]),
	);
}

export interface RankTable {
	/** Rolls in the population. */
	count: number;
	/** Pokémon species in the population. */
	species: number;
	/** Values at evenly spaced fractions of the population, lowest first (q[0] = minimum, last = maximum). */
	q: number[];
}

export interface RankTables {
	/** How many quantiles each table has and how the population was made (see build-rank-tables). */
	note: string;
	categories: Record<RankCategory, RankTable>;
}

/** The share (0–1) of the population better than `value`, interpolating between quantiles. */
export function shareAbove(table: RankTable, value: number): number {
	const { q } = table;
	const n = q.length;
	if (n === 0) return 0;
	if (value >= q[n - 1]) return 0;
	if (value < q[0]) return 1;
	let lo = 0;
	let hi = n - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (q[mid] <= value) lo = mid;
		else hi = mid;
	}
	const span = q[hi] - q[lo];
	const within = span > 0 ? (value - q[lo]) / span : 1;
	return 1 - (lo + within) / (n - 1);
}

export interface Rank {
	category: RankCategory;
	/** 0–1: the share of the population that does better (0.04 = top 4%). */
	better: number;
	grade: Grade;
	/** The Pokémon's value per day in the category's unit. */
	value: number;
	/** The population's median value. */
	median: number;
	/** Species the category's population is made of. */
	species: number;
}

/**
 * Ranks a Pokémon (as the numbers see it, e.g. evolved if Final evolution is on) against `tables`; its best
 * category counts. Undefined if none of its categories has a table (e.g. a skill only mythical Pokémon have).
 */
export function rankEntry(entry: BoxEntry, tables: RankTables): Rank | undefined {
	const problem = ratingProblem(entry, rankOptions, rankStrengthOptions);
	const skill = toPokemonIv(entry).pokemon.skill;
	const own = subSkillLevels.map((lv) => entry.subSkills[lv]).filter((n): n is SubSkillType => !!n);
	let best: Rank | undefined;
	for (const [category, value] of rankValues(problem, skill, entry.nature, own)) {
		const table = tables.categories[category];
		if (!table) continue;
		const better = shareAbove(table, value);
		if (!best || better < best.better) {
			best = {
				category,
				better,
				grade: gradeOf(better),
				value,
				median: table.q[Math.floor((table.q.length - 1) / 2)],
				species: table.species,
			};
		}
	}
	return best;
}
