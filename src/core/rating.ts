import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import Nature, { type NatureEffect } from "../vendor/pokesleep-tool/util/Nature";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import SubSkill from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, type SubSkillLevel, subSkillLevels, toPokemonIv } from "./box";
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

export const grades = ["S", "A", "B", "C", "D"] as const;
export type Grade = (typeof grades)[number];

/** Lowest score (0–100) for each grade but the last. */
const gradeThresholds: [Grade, number][] = [
	["S", 90],
	["A", 75],
	["B", 60],
	["C", 40],
];

export function gradeOf(score: number): Grade {
	return gradeThresholds.find(([, min]) => score >= min)?.[0] ?? "D";
}

export interface Rating {
	role: RatingRole;
	/** 0–100: the Pokémon's value for its role as a share of the best nature and subskills it could have. */
	score: number;
	grade: Grade;
	/** The best nature and subskills found, which score 100. */
	best: { nature: string; subSkills: SubSkillType[] };
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
 * One nature per distinct effect: EXP gains never matter here, and energy recovery only with simulated
 * energy, so e.g. all neutral-for-us natures collapse into Serious.
 */
function candidateNatures(options: YieldOptions): string[] {
	const relevant = (effect: NatureEffect) =>
		effect !== "EXP gains" && effect !== "No effect" && (effect !== "Energy recovery" || options.energy === "simulated");
	const seen = new Map<string, string>();
	for (const n of Nature.allNatures) {
		const key = `${relevant(n.upEffect) ? n.upEffect : "-"}/${relevant(n.downEffect) ? n.downEffect : "-"}`;
		if (!seen.has(key)) seen.set(key, key === "-/-" ? "Serious" : n.name);
	}
	return [...seen.values()];
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
function build(entry: BoxEntry, base: number, maxSkill: number, nature: string, subSkills: SubSkillType[]): BoxEntry {
	const slots: Partial<Record<SubSkillLevel, SubSkillType | null>> = {};
	subSkillLevels.forEach((lv, i) => {
		slots[lv] = subSkills[i] ?? null;
	});
	return {
		...entry,
		level: ratingLevel,
		nature,
		subSkills: slots,
		skillLevel: Math.min(maxSkill, base + skillLevelUp(subSkills)),
	};
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
	/** The role's value of the Pokémon at the rating level with this nature and subskills. */
	valueOf: (nature: string, subSkills: SubSkillType[]) => number;
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
	const detailOf = (nature: string, subSkills: SubSkillType[]) =>
		soloYieldDetail(build(entry, base, maxSkill, nature, subSkills), options, strength);

	const baseline = detailOf("Serious", []);
	const role = ratingRole(iv.pokemon.specialty, baseline);
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
		natures: candidateNatures(options),
		candidates: candidateSubSkills(role, skillCounts, options),
		key: [entry.pokemonName, entry.ingredient, base, JSON.stringify(options), JSON.stringify(strength)].join("|"),
	};
}

/** Best builds by {@link RatingProblem.key}. */
const bestCache = new Map<string, { value: number; nature: string; subSkills: SubSkillType[] }>();

/**
 * Rates a Pokémon's nature and subskills for its role, at its potential (every subskill unlocked, see
 * {@link ratingLevel}), with the yield model and settings the solvers use. Each measure is taken relative
 * to the same Pokémon with a neutral nature and no subskills, so a hybrid's ingredients and skill triggers
 * can be added up; 100 is the best nature and subskills found by {@link searchBest}.
 */
export function rateEntry(
	entry: BoxEntry,
	options: YieldOptions = defaultYieldOptions,
	strength: StrengthOptions = defaultStrengthOptions,
): Rating {
	const problem = ratingProblem(entry, options, strength);
	let best = bestCache.get(problem.key);
	if (!best) {
		best = searchBest(problem.valueOf, problem.natures, problem.candidates);
		bestCache.set(problem.key, best);
	}
	const own = subSkillLevels.map((lv) => entry.subSkills[lv]).filter((n): n is SubSkillType => !!n);
	const current = problem.valueOf(entry.nature, own);
	const score = best.value > 0 ? Math.min(100, (current / best.value) * 100) : 0;
	return {
		role: problem.role,
		score,
		grade: gradeOf(score),
		best: { nature: best.nature, subSkills: best.subSkills },
	};
}

const maxSubSkills = subSkillLevels.length;

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
