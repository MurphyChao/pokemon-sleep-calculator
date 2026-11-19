/**
 * Cross-species rank: how a Pokémon's daily output compares with random rolls of the best species for the
 * same job, in a unit both share. For the best species itself it's the same as the rating (rarity), which
 * compares a Pokémon with rolls of its own species; any other species is told how close it gets to the best.
 *
 * Every Pokémon, and the comparison rolls, is measured the same way, with the user's settings (as for the
 * rating): as its final form at Lv80, with Sub Skill Seeds used and the main skill maxed except for
 * Ingredients specialists. The best species and its rolls depend on the settings, so the tables are built
 * with {@link buildRankTables}: once by `npm run build-rank-tables` for the app's default settings
 * (src/data/rank-tables.json, used as is), and in the browser for any other settings (ui/useRankTables.ts).
 *
 * The categories (a Pokémon's job decides which; hybrids are ranked in both and the better rank counts):
 * - strength:<type>: berry strength + strength-skill strength per day, against the best strength Pokémon of
 *   the same type (favorite berries and island bonuses go by type)
 * - ingredient:<name>: how much of one ingredient per day (skill ones included), against the best Pokémon
 *   kept for ingredients (Ingredients specialists, ingredient-skill users) that gathers it, with its
 *   combinations that include it; a Pokémon is ranked for each ingredient it can gather
 * - skill:<kind>: what the main skill gives per day in its own unit (energy, Extra Tasty chance, dream
 *   shards…), against the best Pokémon with the same kind of skill ("(Random)" variants count as one kind)
 * The best species of a category is the one doing the most with a neutral nature and no subskills, among
 * non-mythical fully evolved Pokémon. Helping Bonus adds 4 × 5.3% of a neutral Pokémon's output, as in the
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
	rollSampleSize,
	rollSeed,
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

/** "strength:<type>" (e.g. "strength:grass"), "ingredient:<name>" (e.g. "ingredient:apple") or "skill:<kind>" (e.g. "skill:Energy for Everyone S"). */
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
	if (category.startsWith("strength:")) return d.berryStrength + d.skillStrength;
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
			return [{ category: `strength:${pokemon.type}`, combos: all }];
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
	return value + helpingBonusTeamValue * helpingBonusBase(problem, category);
}

/**
 * What Helping Bonus's team value is measured in: a neutral Pokémon of the species with a fixed combination,
 * as for Rarity, so the bonus is the same whatever the roll's own combination (it speeds up teammates, not
 * this Pokémon): for an ingredient, the combination gathering the most of it; otherwise AAA.
 */
function helpingBonusBase(problem: RatingProblem, category: RankCategory): number {
	const ingredient = category.startsWith("ingredient:") ? category.slice("ingredient:".length) : undefined;
	const top = ingredient ? problem.goals.find((g) => g.ingredient === ingredient)?.combo : undefined;
	return categoryValue(category, problem.detailOf("Serious", [], top ?? "AAA"));
}

/** Values are stored with 6 significant digits; a Pokémon's value is rounded the same way before looking it up. */
function roundValue(v: number): number {
	return Number(v.toPrecision(6));
}

export interface RankTable {
	/** The species the rolls are of: the category's best. */
	best: string;
	/** Rolls sampled. */
	count: number;
	/** The rolls' median value. */
	median: number;
	/** The distinct values rolled, lowest first. */
	v: number[];
	/** For each value in `v`: how many rolls did better. */
	above: number[];
}

export interface RankTables {
	/** How the rolls were made (see build-rank-tables). */
	note: string;
	categories: Record<RankCategory, RankTable>;
}

/** The share (0–1) of the rolls doing better than `value` (exact, like the rating's). */
export function shareAbove(table: RankTable, value: number): number {
	const { v, above, count } = table;
	const x = roundValue(value);
	if (v.length === 0 || x < v[0]) return 1;
	let lo = 0;
	let hi = v.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (v[mid] <= x) lo = mid;
		else hi = mid - 1;
	}
	return above[lo] / count;
}

export interface Rank {
	category: RankCategory;
	/** 0–1: the share of the population that does better (0.04 = top 4%). */
	better: number;
	grade: Grade;
	/** The Pokémon's value per day in the category's unit. */
	value: number;
	/** The rolls' median value. */
	median: number;
	/** The species it's compared with: the category's best. */
	best: string;
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
		const better = shareAbove(table, value);
		if (!best || better < best.better || (better === best.better && value > best.value)) {
			best = {
				category,
				better,
				grade: gradeOf(better),
				value,
				median: table.median,
				best: table.best,
			};
		}
	}
	if (best?.category.startsWith("ingredient:")) {
		best.ingredientStrength = ingredientStrengthPerDay(problem.detailOf(entry.nature, own));
	}
	return best;
}

/** Random rolls of one species for one category. */
export interface RankJob {
	pokemon: PokemonData;
	category: RankCategory;
	combos: IngredientType[];
}

/** Every non-mythical fully evolved Pokémon, with each category it's ranked in under these settings, and its probe. */
function candidates(options: YieldOptions, strength: StrengthOptions): (RankJob & { probe: RatingProblem })[] {
	return pokemons
		.filter((p) => p.isFullyEvolved && getPokemonRarity(p) !== "mythical" && p.frequency > 0)
		.flatMap((pokemon) => {
			const probe = ratingProblem(
				{ id: "", pokemonName: pokemon.name, level: 80, ingredient: "AAA", nature: "Serious", subSkills: {} },
				options,
				strength,
			);
			return rankCategories(probe, pokemon).map(({ category, combos }) => ({ pokemon, category, combos, probe }));
		});
}

/** What a candidate does in its category with a neutral nature and no subskills, with its best combination for it. */
function neutralValue(job: RankJob & { probe: RatingProblem }): number {
	const ingredient = job.category.startsWith("ingredient:") ? job.category.slice("ingredient:".length) : undefined;
	const top = ingredient ? job.probe.goals.find((g) => g.ingredient === ingredient)?.combo : undefined;
	const combos = top ? [top] : job.category.startsWith("ingredient:") ? job.combos : ["AAA" as IngredientType];
	return Math.max(...combos.map((c) => rankValue(job.probe, job.category, "Serious", [], c)));
}

/**
 * The values of `rolls` random rolls of a job, drawn as the rating draws them (same seed and order: an
 * ingredient combination from the job's, a nature and 5 different subskills, each equally likely), so the best
 * species' rank equals its rarity. Rolls that do the same in the yield model share one calculation. Yields
 * now and then so the browser can build a slice at a time.
 */
function* sampleRolls(job: RankJob, options: YieldOptions, strength: StrengthOptions, rolls: number): Generator<void, number[]> {
	const random = seededRandom(rollSeed);
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
			yield;
		}
		values.push(value);
	}
	return values;
}

/** A table from a job's rolled values. */
function tableOf(job: RankJob, values: number[]): RankTable {
	const sorted = values.map(roundValue).sort((a, b) => a - b);
	const v: number[] = [];
	const above: number[] = [];
	for (let i = 0; i < sorted.length; i++) {
		if (i + 1 < sorted.length && sorted[i + 1] === sorted[i]) continue;
		v.push(sorted[i]);
		above.push(sorted.length - 1 - i);
	}
	return { best: job.pokemon.name, count: sorted.length, median: sorted[Math.floor((sorted.length - 1) / 2)], v, above };
}

/**
 * Each category's best species under these settings: the one doing the most there with a neutral nature and no
 * subskills. Quick (one calculation per species and category).
 */
export function rankBest(options: YieldOptions, strength: StrengthOptions): Map<RankCategory, RankJob> {
	const best = new Map<RankCategory, { job: RankJob; value: number }>();
	for (const job of candidates(options, strength)) {
		const value = neutralValue(job);
		const current = best.get(job.category);
		if (!current || value > current.value) best.set(job.category, { job, value });
	}
	return new Map([...best].sort((x, y) => x[0].localeCompare(y[0])).map(([category, { job }]) => [category, { pokemon: job.pokemon, category, combos: job.combos }]));
}

/**
 * Builds one category's table from its best species' rolls, step by step: yields after each calculation (a
 * fraction of a millisecond to a few) so the browser can build a slice at a time; returns the table. This is
 * the slow part (2,000 rolls, nearly all different), so the browser only builds the categories it needs.
 */
export function rankTableSteps(job: RankJob, options: YieldOptions, strength: StrengthOptions, rolls = rollSampleSize): Generator<void, RankTable> {
	return (function* () {
		return tableOf(job, yield* sampleRolls(job, options, strength, rolls));
	})();
}

/** Builds one category's table in one go (a web worker, the build script and tests). */
export function buildRankTable(job: RankJob, options: YieldOptions, strength: StrengthOptions, rolls = rollSampleSize): RankTable {
	const steps = rankTableSteps(job, options, strength, rolls);
	for (;;) {
		const next = steps.next();
		if (next.done) return next.value;
	}
}

/** Builds every category's table for these settings in one go (the build script and tests). */
export function buildRankTables(options: YieldOptions, strength: StrengthOptions, note: string, rolls = rollSampleSize): RankTables {
	const categories: Record<RankCategory, RankTable> = {};
	for (const [category, job] of rankBest(options, strength)) categories[category] = buildRankTable(job, options, strength, rolls);
	return { note, categories };
}

/** A job as sent to a web worker (plain data; the species by name). */
export interface RankJobMessage {
	pokemonName: string;
	category: RankCategory;
	combos: IngredientType[];
}

export function rankJobMessage(job: RankJob): RankJobMessage {
	return { pokemonName: job.pokemon.name, category: job.category, combos: job.combos };
}

export function rankJobOfMessage(message: RankJobMessage): RankJob {
	const pokemon = pokemons.find((p) => p.name === message.pokemonName);
	if (!pokemon) throw new Error(`Unknown Pokémon: ${message.pokemonName}`);
	return { pokemon, category: message.category, combos: message.combos };
}

/** The categories a Pokémon is ranked in under these settings (its tables must be there for {@link rankEntry}). */
export function rankEntryCategories(
	entry: BoxEntry,
	options: YieldOptions = rankOptions,
	strength: StrengthOptions = rankStrengthOptions,
): RankCategory[] {
	return rankCategories(ratingProblem(entry, options, strength), toPokemonIv(entry).pokemon).map((c) => c.category);
}
