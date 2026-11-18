/**
 * Cross-species rank: how a Pokémon's daily output compares with random rolls of every (non-mythical) fully
 * evolved Pokémon doing the same job, in a unit all of them share. Unlike the rating (rarity), which only
 * compares a Pokémon with other rolls of its own species.
 *
 * Every Pokémon, and the comparison population, is measured the same way, with the user's settings (as for
 * the rating): at Lv80, with Sub Skill Seeds used and the main skill maxed except for Ingredients specialists.
 * The population depends on the settings, so it's built with {@link buildRankTables}: once by
 * `npm run build-rank-tables` for the app's default settings (src/data/rank-tables.json, used as is), and in
 * the browser for any other settings (see ui/useRankTables.ts).
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
import pokemons, { getPokemonRarity, type IngredientName, type PokemonData } from "../vendor/pokesleep-tool/data/pokemons";
import Nature from "../vendor/pokesleep-tool/util/Nature";
import SubSkill from "../vendor/pokesleep-tool/util/SubSkill";
import { type IngredientType, IngredientTypes } from "../vendor/pokesleep-tool/util/PokemonIv";
import { ingredientStrength } from "../vendor/pokesleep-tool/util/PokemonRp";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, subSkillLevels, toPokemonIv } from "./box";
import {
	type Grade,
	gradeOf,
	helpingBonusTeamValue,
	natureClass,
	type RatingProblem,
	ratingProblem,
	seededRandom,
	seedSubSkills,
	subSkillsKey,
} from "./rating";
import {
	defaultStrengthOptions,
	defaultYieldOptions,
	type StrengthOptions,
	type YieldDetail,
	type YieldOptions,
} from "./yield";

/** The settings the shipped tables (src/data/rank-tables.json) are built with: the app's defaults. */
export const rankOptions = defaultYieldOptions;
export const rankStrengthOptions = defaultStrengthOptions;

/** Identifies the settings a population is built with (only what changes yields or strength). */
export function rankSettingsKey(options: YieldOptions, strength: StrengthOptions): string {
	return JSON.stringify([
		options.inventoryLimit,
		options.campTicket,
		options.energy,
		options.sleepScore,
		strength.favorites,
		strength.fieldBonus,
	]);
}

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
	detail = problem.detailOf(nature, subSkills, combo),
): number {
	const value = categoryValue(category, detail);
	if (!subSkills.includes("Helping Bonus")) return value;
	return value + helpingBonusTeamValue * helpingBonusBase(problem, category, combo);
}

/**
 * What Helping Bonus's team value is measured in: a neutral Pokémon of the species. For an ingredient, as
 * for Rarity, the one with the combination gathering the most of it, so the bonus is the same whatever the
 * roll's own combination (it speeds up teammates, not this Pokémon); otherwise with the roll's combination.
 */
function helpingBonusBase(problem: RatingProblem, category: RankCategory, combo?: IngredientType): number {
	const ingredient = category.startsWith("ingredient:") ? category.slice("ingredient:".length) : undefined;
	const top = ingredient ? problem.goals.find((g) => g.ingredient === ingredient)?.combo : undefined;
	return categoryValue(category, problem.detailOf("Serious", [], top ?? combo));
}

/** Values are stored with 4 significant digits; a Pokémon's value is rounded the same way before looking it up. */
function roundValue(v: number): number {
	return Number(v.toPrecision(4));
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
export function rankEntry(
	entry: BoxEntry,
	tables: RankTables,
	options: YieldOptions = rankOptions,
	strength: StrengthOptions = rankStrengthOptions,
): Rank | undefined {
	const problem = ratingProblem(entry, options, strength);
	const pokemon = toPokemonIv(entry).pokemon;
	const own = subSkillLevels.map((lv) => entry.subSkills[lv]).filter((n): n is SubSkillType => !!n);
	let best: Rank | undefined;
	for (const { category } of rankCategories(problem, pokemon)) {
		const table = tables.categories[category];
		if (!table) continue;
		const value = rankValue(problem, category, entry.nature, own);
		// Rounded like the table, so a value tied with many rolls (subskills that don't change it) isn't
		// put just below them by the rounding.
		const better = shareAbove(table, roundValue(value));
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

/** One part of building a population: random rolls of one species for one category. */
export interface RankJob {
	pokemon: PokemonData;
	category: RankCategory;
	combos: IngredientType[];
}

/** Every non-mythical fully evolved Pokémon, with each category it's ranked in under these settings. */
export function rankJobs(options: YieldOptions, strength: StrengthOptions): RankJob[] {
	return pokemons
		.filter((p) => p.isFullyEvolved && getPokemonRarity(p) !== "mythical" && p.frequency > 0)
		.flatMap((pokemon) => {
			const probe = ratingProblem(
				{ id: "", pokemonName: pokemon.name, level: 80, ingredient: "AAA", nature: "Serious", subSkills: {} },
				options,
				strength,
			);
			return rankCategories(probe, pokemon).map(({ category, combos }) => ({ pokemon, category, combos }));
		});
}

/** A seed from a job's species and category, so each job's rolls don't depend on the order jobs run in. */
function jobSeed(job: RankJob): number {
	let h = 2166136261;
	for (const c of `${job.pokemon.name}|${job.category}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	return h >>> 0;
}

/**
 * The values of `rolls` random rolls of a job: an ingredient combination from the job's, a nature and 5
 * different subskills, each equally likely. Rolls that do the same in the yield model share one calculation.
 */
export function sampleRankJob(job: RankJob, options: YieldOptions, strength: StrengthOptions, rolls: number): number[] {
	const random = seededRandom(jobSeed(job));
	const natures = Nature.allNatures;
	const subSkills = SubSkill.allSubSkills;
	const problems = new Map<IngredientType, RatingProblem>();
	const memo = new Map<string, number>();
	const values: number[] = [];
	for (let i = 0; i < rolls; i++) {
		const combo = job.combos[Math.floor(random() * job.combos.length)];
		const nature = natures[Math.floor(random() * natures.length)];
		const pool = [...subSkills];
		const roll: SubSkill[] = [];
		while (roll.length < 5) roll.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
		const names = roll.map((x) => x.name);
		const key = `${combo}|${natureClass(nature, options)}|${subSkillsKey(seedSubSkills(names).map((n) => new SubSkill(n)))}`;
		let value = memo.get(key);
		if (value === undefined) {
			let problem = problems.get(combo);
			if (!problem) {
				problem = ratingProblem(
					{ id: "", pokemonName: job.pokemon.name, level: 80, ingredient: combo, nature: "Serious", subSkills: {} },
					options,
					strength,
				);
				problems.set(combo, problem);
			}
			value = rankValue(problem, job.category, nature.name, names, combo);
			memo.set(key, value);
		}
		values.push(value);
	}
	return values;
}

/** Quantiles stored per category (0%, 0.25%, …, 100%). */
const quantiles = 401;

/** Collects job samples into tables. */
export class RankTableBuilder {
	private values = new Map<RankCategory, number[]>();
	private species = new Map<RankCategory, Set<string>>();

	add(job: RankJob, values: number[]) {
		if (!this.values.has(job.category)) {
			this.values.set(job.category, []);
			this.species.set(job.category, new Set());
		}
		(this.values.get(job.category) as number[]).push(...values);
		this.species.get(job.category)?.add(job.pokemon.name);
	}

	build(note: string): RankTables {
		const round = roundValue;
		const categories: Record<RankCategory, RankTable> = {};
		for (const [category, list] of [...this.values].sort((x, y) => x[0].localeCompare(y[0]))) {
			list.sort((x, y) => x - y);
			const q = Array.from({ length: quantiles }, (_, i) => round(list[Math.round((i / (quantiles - 1)) * (list.length - 1))]));
			categories[category] = { count: list.length, species: this.species.get(category)?.size ?? 0, q };
		}
		return { note, categories };
	}
}

/** Builds the whole population for these settings in one go (the build script; the browser goes job by job). */
export function buildRankTables(options: YieldOptions, strength: StrengthOptions, rolls: number, note: string): RankTables {
	const builder = new RankTableBuilder();
	for (const job of rankJobs(options, strength)) builder.add(job, sampleRankJob(job, options, strength, rolls));
	return builder.build(note);
}
