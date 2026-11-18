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
 * - ingredient:<name>: how much of one ingredient per day (skill ones included), only against Pokémon kept for
 *   ingredients (Ingredients specialists, ingredient-skill users) that can gather it, with combinations that
 *   include it; a Pokémon is ranked for each ingredient it can gather, so a top apple gatherer ranks high even
 *   though apples are worth little
 * - skill:<kind>: what the main skill gives per day in its own unit (energy, Extra Tasty chance, dream
 *   shards…), only against Pokémon with the same kind of skill (variants like "(Random)" count as one kind)
 * Helping Bonus adds 4 × 5.3% of the Pokémon's own output with a neutral nature and no subskills, as in the
 * rating.
 */
import type { IngredientName, PokemonData } from "../vendor/pokesleep-tool/data/pokemons";
import { type IngredientType, IngredientTypes } from "../vendor/pokesleep-tool/util/PokemonIv";
import { ingredientStrength } from "../vendor/pokesleep-tool/util/PokemonRp";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, subSkillLevels, toPokemonIv } from "./box";
import { type Grade, gradeOf, helpingBonusTeamValue, type RatingProblem, ratingProblem } from "./rating";
import { defaultStrengthOptions, defaultYieldOptions, type YieldDetail } from "./yield";

/** Settings every rank is measured with (the app's defaults), so ranks compare across users and settings. */
export const rankOptions = defaultYieldOptions;
export const rankStrengthOptions = defaultStrengthOptions;

/** "strength", "ingredient:<name>" (e.g. "ingredient:apple") or "skill:<kind>" (e.g. "skill:Energy for Everyone S"). */
export type RankCategory = string;

/** A main skill's kind: its name without a variant in brackets ("Charge Strength S (Random)" → "Charge Strength S"). */
export function skillKind(skill: string): string {
	return skill.replace(/\s*\(.*\)\s*$/, "");
}

/** Ingredient strength per day: each ingredient's base strength × count (shown with ingredient ranks). */
export function ingredientStrengthPerDay(d: YieldDetail): number {
	return (Object.entries(d.total) as [IngredientName, number][]).reduce(
		(sum, [ing, n]) => sum + n * (ingredientStrength[ing] ?? 0),
		0,
	);
}

function categoryValue(category: RankCategory, d: YieldDetail): number {
	if (category === "strength") return d.berryStrength + d.skillStrength;
	if (category.startsWith("ingredient:")) return d.total[category.slice("ingredient:".length) as IngredientName] ?? 0;
	return d.skillValue > 0 ? d.skillValue : d.skillsPerDay;
}

/** A category a Pokémon is ranked in, and the ingredient combinations it's measured with in the population. */
export interface RankCategoryOf {
	category: RankCategory;
	/** Combinations random rolls can have: for an ingredient, those that include it; otherwise all. */
	combos: IngredientType[];
}

/** The categories a Pokémon is ranked in, from its role (see the rating) and species. */
export function rankCategories(problem: RatingProblem, pokemon: PokemonData): RankCategoryOf[] {
	const all = IngredientTypes.filter((c) => (pokemon.ing2 || !c.includes("B")) && (pokemon.ing3 || !c.includes("C")));
	const slot = { A: pokemon.ing1?.name, B: pokemon.ing2?.name, C: pokemon.ing3?.name } as Record<string, string | undefined>;
	const ingredients = () =>
		[...new Set([pokemon.ing1?.name, pokemon.ing2?.name, pokemon.ing3?.name])]
			.filter((n): n is IngredientName => !!n)
			.map((name) => ({ category: `ingredient:${name}`, combos: all.filter((c) => [...c].some((l) => slot[l] === name)) }));
	const skill = { category: `skill:${skillKind(pokemon.skill)}`, combos: all };
	switch (problem.role) {
		case "strength":
			return [{ category: "strength", combos: all }];
		case "ingredients":
			return ingredients();
		case "support":
			return [skill];
		case "hybrid":
			return [...ingredients(), skill];
	}
}

/**
 * The Pokémon's value in a category with this nature, these subskills as rolled and this ingredient
 * combination, measured as described above.
 */
export function rankValue(
	problem: RatingProblem,
	category: RankCategory,
	nature: string,
	subSkills: SubSkillType[],
	combo?: IngredientType,
): number {
	const value = categoryValue(category, problem.detailOf(nature, subSkills, combo));
	if (!subSkills.includes("Helping Bonus")) return value;
	return value + helpingBonusTeamValue * categoryValue(category, problem.detailOf("Serious", [], combo));
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
	/** For ingredient ranks: the Pokémon's ingredient strength per day, all its ingredients together. */
	ingredientStrength?: number;
}

/**
 * Ranks a Pokémon (as the numbers see it, e.g. evolved if Final evolution is on) against `tables`; its best
 * category counts. Undefined if none of its categories has a table (e.g. a skill only mythical Pokémon have).
 */
export function rankEntry(entry: BoxEntry, tables: RankTables): Rank | undefined {
	const problem = ratingProblem(entry, rankOptions, rankStrengthOptions);
	const pokemon = toPokemonIv(entry).pokemon;
	const own = subSkillLevels.map((lv) => entry.subSkills[lv]).filter((n): n is SubSkillType => !!n);
	let best: Rank | undefined;
	for (const { category } of rankCategories(problem, pokemon)) {
		const table = tables.categories[category];
		if (!table) continue;
		const value = rankValue(problem, category, entry.nature, own);
		const better = shareAbove(table, value);
		if (!best || better < best.better || (better === best.better && value > best.value)) {
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
	if (best?.category.startsWith("ingredient:")) {
		best.ingredientStrength = ingredientStrengthPerDay(problem.detailOf(entry.nature, own));
	}
	return best;
}
