import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import Nature, { type NatureEffect } from "../vendor/pokesleep-tool/util/Nature";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import SubSkill from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, maxSubSkillSeeds, type SubSkillLevel, subSkillLevels, toPokemonIv } from "./box";
import {
	defaultStrengthOptions,
	defaultYieldOptions,
	soloYieldDetail,
	type StrengthOptions,
	type YieldDetail,
	type YieldOptions,
} from "./yield";

/**
 * What a Pokémon is kept for, which decides what its rating measures:
 * - strength: strength from berries and the main skill (Berries specialists, strength skills like Sceptile's Berry Burst)
 * - ingredients: ingredients from helps and the main skill (Ingredients specialists, Ingredient Draw/Magnet like Sandslash)
 * - hybrid: ingredients and a team support skill, half each (Chansey's healing, Drampa's Tasty Chance)
 * - support: main skill triggers (Skills specialists whose skill gives neither strength nor ingredients)
 */
export type RatingRole = "strength" | "ingredients" | "hybrid" | "support";

type Measure = "strength" | "ingredients" | "skill";
const roleWeights: Record<RatingRole, Partial<Record<Measure, number>>> = {
	strength: { strength: 1 },
	ingredients: { ingredients: 1 },
	hybrid: { ingredients: 0.5, skill: 0.5 },
	support: { skill: 1 },
};

/** Level the rating is computed at: Lv80, where every subskill and ingredient slot is unlocked (the Pokémon's potential). */
export const ratingLevel = 80;

const maxSubSkills = subSkillLevels.length;

/**
 * Random rolls (nature and 5 subskills) sampled per species to place a Pokémon among all its possible
 * rolls. Odds of a better roll are resolved down to about 1 in this many.
 */
export const rollSampleSize = 2000;

export const grades = ["S", "A", "B", "C", "D"] as const;
export type Grade = (typeof grades)[number];

/** For each grade but the last: the share of random rolls that may be better (S: top 5%, A: top 20%…). */
const gradeThresholds: [Grade, number][] = [
	["S", 0.05],
	["A", 0.2],
	["B", 0.5],
	["C", 0.8],
];

/** The grade for a Pokémon that `better` (0–1) of random rolls beat. */
export function gradeOf(better: number): Grade {
	return gradeThresholds.find(([, max]) => better < max)?.[0] ?? "D";
}

export interface Rating {
	role: RatingRole;
	/**
	 * 0–1: the share of random rolls of the same Pokémon (any nature and 5 different subskills, all equally
	 * likely) that are better for its role, i.e. the chance that a new one would beat it. 0.03 = top 3%.
	 */
	better: number;
	grade: Grade;
	/** 0–100: the Pokémon's value as a share of the best nature and subskills it could have. */
	ofBest: number;
	/** The best nature and subskills found (as rolled, before Sub Skill Seeds), which score 100. */
	best: { nature: string; subSkills: SubSkillType[] };
	/** Main skill level the Pokémon was rated at. */
	skillLevel: number;
	/** Whether the main skill is rated at its max level (every role but ingredients). */
	skillMaxed: boolean;
}

/**
 * Whether a role is benchmarked with the main skill at its max level. Pure ingredient Pokémon keep their
 * own skill level: players tend to save Main Skill Seeds for strength and skill-trigger Pokémon.
 */
export function maxesSkill(role: RatingRole): boolean {
	return role !== "ingredients";
}

/**
 * Subskills (all unlocked) after using Sub Skill Seeds as far as they go, by the same rules as the solvers'
 * option: S → M → L, never giving a Pokémon the same subskill twice.
 */
export function seedSubSkills(subSkills: SubSkillType[]): SubSkillType[] {
	const slots: Partial<Record<SubSkillLevel, SubSkillType>> = {};
	subSkills.forEach((s, i) => {
		slots[subSkillLevels[i]] = s;
	});
	const [seeded] = maxSubSkillSeeds(
		[{ id: "", pokemonName: "", level: ratingLevel, ingredient: "AAA", nature: "Serious", subSkills: slots }],
		true,
	);
	return subSkillLevels.map((lv) => seeded.subSkills[lv]).filter((n): n is SubSkillType => !!n);
}

/**
 * Subskills that can raise the role's measures in the yield model. Berry Finding S only helps strength,
 * Ingredient Finder only ingredients (it lowers berries), and skill subskills only matter when the main
 * skill counts towards the role.
 */
function candidateSubSkills(role: RatingRole, skillCounts: boolean, options: YieldOptions): SubSkillType[] {
	const names: SubSkillType[] = ["Helping Speed M", "Helping Speed S", "Helping Bonus"];
	if (role === "strength") names.push("Berry Finding S");
	if (role === "ingredients" || role === "hybrid") names.push("Ingredient Finder M", "Ingredient Finder S");
	if (skillCounts) names.push("Skill Trigger M", "Skill Trigger S", "Skill Level Up M", "Skill Level Up S");
	if (options.inventoryLimit) names.push("Inventory Up L", "Inventory Up M", "Inventory Up S");
	if (options.energy === "simulated") names.push("Energy Recovery Bonus");
	return names;
}

/**
 * What a nature does in the yield model: EXP gains never matter here, and energy recovery only with
 * simulated energy. Natures with the same class give the same yields.
 */
function natureClass(n: Nature, options: YieldOptions): string {
	const relevant = (effect: NatureEffect) =>
		effect !== "EXP gains" && effect !== "No effect" && (effect !== "Energy recovery" || options.energy === "simulated");
	return `${relevant(n.upEffect) ? n.upEffect : "-"}/${relevant(n.downEffect) ? n.downEffect : "-"}`;
}

/** One nature per class; the class with no effect is represented by Serious. */
function candidateNatures(options: YieldOptions): string[] {
	const seen = new Map<string, string>();
	for (const n of Nature.allNatures) {
		const key = natureClass(n, options);
		if (!seen.has(key)) seen.set(key, key === "-/-" ? "Serious" : n.name);
	}
	return [...seen.values()];
}

/**
 * What a set of subskills does in the yield model: helping speed, ingredient finder, skill trigger, Skill
 * Level Up and inventory add up (Inventory Up S + M = L), the rest are on or off. Sets with the same key
 * give the same yields.
 */
function subSkillsKey(subSkills: SubSkill[]): string {
	let speed = 0;
	let ing = 0;
	let trigger = 0;
	let levelUp = 0;
	let inventory = 0;
	for (const s of subSkills) {
		speed += s.helpingSpeed;
		ing += s.ingredientFinder;
		trigger += s.skillTrigger;
		levelUp += s.skillLevelUp;
		inventory += s.inventory;
	}
	const has = (name: SubSkillType) => (subSkills.some((s) => s.name === name) ? 1 : 0);
	return [speed, ing, trigger, levelUp, inventory, has("Berry Finding S"), has("Helping Bonus"), has("Energy Recovery Bonus")].join(",");
}

/** A small deterministic random number generator (mulberry32), so samples are the same on every load. */
function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Values of {@link rollSampleSize} random rolls, sorted: a nature and 5 different subskills, each equally
 * likely (the game doesn't publish the real odds), all unlocked as at the rating level and upgraded with
 * Sub Skill Seeds like the Pokémon being rated.
 */
export function sampleRolls(problem: RatingProblem, options: YieldOptions, count = rollSampleSize): Float64Array {
	const random = seededRandom(20261118);
	const natures = Nature.allNatures;
	const subSkills = SubSkill.allSubSkills;
	const memo = new Map<string, number>();
	const values = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		const nature = natures[Math.floor(random() * natures.length)];
		const pool = [...subSkills];
		const roll: SubSkill[] = [];
		while (roll.length < maxSubSkills) roll.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
		const key = `${natureClass(nature, options)}|${subSkillsKey(seedSubSkills(roll.map((s) => s.name)).map((n) => new SubSkill(n)))}`;
		let value = memo.get(key);
		if (value === undefined) {
			value = problem.valueOf(
				nature.name,
				roll.map((s) => s.name),
			);
			memo.set(key, value);
		}
		values[i] = value;
	}
	return values.sort();
}

/** The share of sorted `values` that are better than `value` (ignoring rounding differences). */
export function shareBetter(values: Float64Array, value: number): number {
	const threshold = value + Math.abs(value) * 1e-9;
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (values[mid] <= threshold) lo = mid + 1;
		else hi = mid;
	}
	return values.length > 0 ? (values.length - lo) / values.length : 0;
}

function skillLevelUp(names: (SubSkillType | null | undefined)[]): number {
	return names.reduce((sum, n) => sum + (n ? new SubSkill(n).skillLevelUp : 0), 0);
}

/**
 * The entry's main skill level without its subskills' Skill Level Up: the level entered (as shown in the
 * game) already includes the subskills unlocked at the entry's real level, before the solvers' level
 * scaling and Sub Skill Seeds. Older entries without one get pokesleep-tool's default for the species,
 * which doesn't.
 */
function baseSkillLevel(entry: BoxEntry): number {
	const iv = toPokemonIv({
		...entry,
		level: entry.scaledFrom ?? entry.level,
		subSkills: { ...entry.subSkills, ...entry.seededFrom },
	});
	if (entry.skillLevel === undefined) return iv.skillLevel;
	return Math.max(1, iv.skillLevel - skillLevelUp(iv.activeSubSkills.map((s) => s.name)));
}

/** The Pokémon at the rating level with the given nature and subskills (all unlocked). */
function build(entry: BoxEntry, skillLevel: number, nature: string, subSkills: SubSkillType[]): BoxEntry {
	const slots: Partial<Record<SubSkillLevel, SubSkillType | null>> = {};
	subSkillLevels.forEach((lv, i) => {
		slots[lv] = subSkills[i] ?? null;
	});
	return { ...entry, level: ratingLevel, nature, subSkills: slots, skillLevel };
}

function measures(d: YieldDetail): Record<Measure, number> {
	return {
		strength: d.berryStrength + d.skillStrength,
		ingredients: Object.values(d.total).reduce((a, b) => a + (b ?? 0), 0),
		skill: d.skillsPerDay,
	};
}

/** The role a Pokémon is rated for, from its specialty and what its main skill does. */
export function ratingRole(specialty: string, detail: YieldDetail): RatingRole {
	const givesIngredients = Object.keys(detail.skill).length > 0;
	if (specialty === "Berries") return "strength";
	if (specialty === "Ingredients") {
		const supportsTeam = detail.tasty !== undefined || (detail.heal?.team ?? 0) > 0;
		return supportsTeam && !givesIngredients ? "hybrid" : "ingredients";
	}
	if (givesIngredients) return "ingredients";
	return detail.skillStrength > 0 ? "strength" : "support";
}

/** What the search for a Pokémon's best nature and subskills works with. */
export interface RatingProblem {
	role: RatingRole;
	/**
	 * The role's value of the Pokémon at the rating level with this nature and these subskills as rolled
	 * (Sub Skill Seeds are applied, see {@link seedSubSkills}).
	 */
	valueOf: (nature: string, subSkills: SubSkillType[]) => number;
	/** Main skill level for these subskills as rolled. */
	skillLevelOf: (subSkills: SubSkillType[]) => number;
	natures: string[];
	candidates: SubSkillType[];
	/** Identifies the best build: species, ingredients, base skill level and settings. */
	key: string;
}

export function ratingProblem(
	entry: BoxEntry,
	options: YieldOptions = defaultYieldOptions,
	strength: StrengthOptions = defaultStrengthOptions,
): RatingProblem {
	const iv = toPokemonIv(entry);
	const maxSkill = getMaxSkillLevel(iv.pokemon.skill);
	const base = baseSkillLevel(entry);
	const detailAt = (skillLevel: number, nature: string, seeded: SubSkillType[]) =>
		soloYieldDetail(build(entry, skillLevel, nature, seeded), options, strength);
	// What the main skill does doesn't depend on its level, so the role can be found at any level.
	const role = ratingRole(iv.pokemon.specialty, detailAt(base, "Serious", []));
	const seededSkillLevel = (seeded: SubSkillType[]) =>
		maxesSkill(role) ? maxSkill : Math.min(maxSkill, base + skillLevelUp(seeded));
	const detailOf = (nature: string, subSkills: SubSkillType[]) => {
		const seeded = seedSubSkills(subSkills);
		return detailAt(seededSkillLevel(seeded), nature, seeded);
	};
	const baseline = detailOf("Serious", []);
	const weights = Object.entries(roleWeights[role]) as [Measure, number][];
	const baseMeasures = measures(baseline);
	const valueOf = (nature: string, subSkills: SubSkillType[]) => {
		const m = measures(detailOf(nature, subSkills));
		return weights.reduce((sum, [k, w]) => sum + (baseMeasures[k] > 0 ? (w * m[k]) / baseMeasures[k] : 0), 0);
	};
	const skillCounts =
		role === "hybrid" ||
		role === "support" ||
		(role === "strength" ? baseline.skillStrength > 0 : Object.keys(baseline.skill).length > 0);
	return {
		role,
		valueOf,
		skillLevelOf: (subSkills) => seededSkillLevel(seedSubSkills(subSkills)),
		natures: candidateNatures(options),
		candidates: candidateSubSkills(role, skillCounts, options),
		key: [entry.pokemonName, entry.ingredient, base, JSON.stringify(options), JSON.stringify(strength)].join("|"),
	};
}

/** Best builds and sampled rolls by {@link RatingProblem.key}. */
const speciesCache = new Map<string, { best: { value: number; nature: string; subSkills: SubSkillType[] }; rolls: Float64Array }>();

/**
 * Rates a Pokémon's nature and subskills for its role, at its potential (every subskill unlocked, see
 * {@link ratingLevel}), with the yield model and settings the solvers use: where it ranks among random
 * rolls of the same Pokémon ({@link sampleRolls}), and how close it comes to the best nature and subskills
 * ({@link searchBest}). Each measure is taken relative to the same Pokémon with a neutral nature and no
 * subskills, so a hybrid's ingredients and skill triggers can be added up. Every build is benchmarked with
 * Sub Skill Seeds used as far as they go, and with the main skill at its max level except for pure
 * ingredient Pokémon, which keep their own skill level plus Skill Level Up ({@link maxesSkill}).
 */
export function rateEntry(
	entry: BoxEntry,
	options: YieldOptions = defaultYieldOptions,
	strength: StrengthOptions = defaultStrengthOptions,
): Rating {
	const problem = ratingProblem(entry, options, strength);
	let species = speciesCache.get(problem.key);
	if (!species) {
		species = {
			best: searchBest(problem.valueOf, problem.natures, problem.candidates),
			rolls: sampleRolls(problem, options),
		};
		speciesCache.set(problem.key, species);
	}
	const { best, rolls } = species;
	const own = subSkillLevels.map((lv) => entry.subSkills[lv]).filter((n): n is SubSkillType => !!n);
	const current = problem.valueOf(entry.nature, own);
	const better = shareBetter(rolls, current);
	return {
		role: problem.role,
		better,
		grade: gradeOf(better),
		ofBest: best.value > 0 ? Math.min(100, (current / best.value) * 100) : 0,
		best: { nature: best.nature, subSkills: best.subSkills },
		skillLevel: problem.skillLevelOf(own),
		skillMaxed: maxesSkill(problem.role),
	};
}

/**
 * Local search, with the nature as one more thing to change: starting from a neutral nature and no
 * subskills, repeatedly make the single change (add a subskill, replace one, or change the nature) that
 * helps most; when none does, also try changing the nature together with one subskill, then replacing two
 * subskills at once. Exhaustive search is too slow to run for a whole box; on every Pokémon this finds the
 * same best value (checked once against an exhaustive search, and for a few Pokémon in rating.test.ts).
 */
export function searchBest(
	valueOf: (nature: string, subSkills: SubSkillType[]) => number,
	natures: string[],
	candidates: SubSkillType[],
): { value: number; nature: string; subSkills: SubSkillType[] } {
	let current = { value: valueOf("Serious", []), nature: "Serious", subSkills: [] as SubSkillType[] };
	for (;;) {
		let next = current;
		const consider = (nature: string, subSkills: SubSkillType[]) => {
			const value = valueOf(nature, subSkills);
			if (value > next.value + 1e-9) next = { value, nature, subSkills };
		};
		for (const n of natures) if (n !== current.nature) consider(n, current.subSkills);
		for (const s of candidates) {
			if (current.subSkills.includes(s)) continue;
			if (current.subSkills.length < maxSubSkills) consider(current.nature, [...current.subSkills, s]);
			for (let i = 0; i < current.subSkills.length; i++) {
				consider(current.nature, current.subSkills.map((x, j) => (j === i ? s : x)));
			}
		}
		if (next === current) {
			// Stuck: also try changing the nature together with one subskill (adding or replacing one).
			for (const n of natures) {
				if (n === current.nature) continue;
				for (const s of candidates) {
					if (current.subSkills.includes(s)) continue;
					if (current.subSkills.length < maxSubSkills) consider(n, [...current.subSkills, s]);
					for (let i = 0; i < current.subSkills.length; i++) {
						consider(n, current.subSkills.map((x, j) => (j === i ? s : x)));
					}
				}
			}
		}
		if (next === current) {
			// Still stuck: try replacing two subskills at once.
			const free = candidates.filter((s) => !current.subSkills.includes(s));
			for (let i = 0; i < current.subSkills.length; i++) {
				for (let j = i + 1; j < current.subSkills.length; j++) {
					for (let a = 0; a < free.length; a++) {
						for (let b = a + 1; b < free.length; b++) {
							consider(current.nature, current.subSkills.map((x, k) => (k === i ? free[a] : k === j ? free[b] : x)));
						}
					}
				}
			}
		}
		if (next === current) return current;
		current = next;
	}
}
