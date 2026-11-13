/**
 * Energy (strength) solver: the team of up to 5 that earns the most strength per day while
 * cooking one target dish at every meal.
 *
 * Daily strength = berries + strength skills + dishes, where
 * - dishes = 3 meals × coverage × dish strength × the average Extra Tasty multiplier,
 * - coverage = the share of meals the team can gather the dish's ingredients for
 *   (the scarcest ingredient's supply ÷ demand, at most 1). Leftovers are assumed to be
 *   stockpiled, so 90% of the ingredients means 90% of the meals.
 * Meals that can't be cooked, and ingredients the dish doesn't use, add nothing.
 */
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { ingredientStrength } from "../vendor/pokesleep-tool/util/PokemonRp";
import { recipeLevelBonus } from "../vendor/pokesleep-tool/util/PokemonStrength";
import { mealsPerDay, type Recipe } from "./recipes";
import { candidateThresholds, extraTasty, type SwapPolicyResult, swapPolicy, type TastySource } from "./tasty";
import type { IngredientYield } from "./yield";

export const maxRecipeLevel = Math.max(...Object.keys(recipeLevelBonus).map(Number));

export interface EnergyMember {
	id: string;
	/** Ingredients per day (all kinds; only the recipe's count). */
	yield: IngredientYield;
	/** Berry strength per day. */
	berry: number;
	/** Strength skill output per day. */
	skill: number;
	tasty?: TastySource;
}

/** Strength of one dish (not Extra Tasty), as the game computes it before rounding. */
export function dishStrength(recipe: Recipe, recipeLevel: number, fieldBonus: number): number {
	const base = (Object.entries(recipe.ingredients) as [IngredientName, number][]).reduce(
		(sum, [ing, n]) => sum + n * ingredientStrength[ing],
		0,
	);
	const level = Math.min(maxRecipeLevel, Math.max(1, Math.round(recipeLevel)));
	return base * (1 + recipe.bonus / 100) * (1 + (recipeLevelBonus[level] ?? 0) / 100) * (1 + fieldBonus / 100);
}

export interface TeamEnergy {
	berry: number;
	skill: number;
	/** Share of meals the dish can be cooked (0–1). */
	coverage: number;
	/** Expected multiplier from Extra Tasty, averaged over the week. */
	tastyMultiplier: number;
	/** Dish strength per day. */
	dish: number;
	total: number;
}

export interface EnergyProblem {
	recipe: Recipe;
	/** Strength of one regular dish. */
	dishStrength: number;
}

const tastyCache = new Map<string, number>();
function weekMultiplier(sources: TastySource[]): number {
	const key = sources
		.map((s) => `${s.perTrigger}:${s.triggersPerDay}`)
		.sort()
		.join("|");
	let v = tastyCache.get(key);
	if (v === undefined) {
		v = extraTasty(sources).weekMultiplier;
		if (tastyCache.size > 5000) tastyCache.clear();
		tastyCache.set(key, v);
	}
	return v;
}

export function teamEnergy(team: EnergyMember[], problem: EnergyProblem): TeamEnergy {
	const { recipe } = problem;
	let berry = 0;
	let skill = 0;
	for (const m of team) {
		berry += m.berry;
		skill += m.skill;
	}
	let coverage = 1;
	for (const [ing, n] of Object.entries(recipe.ingredients) as [IngredientName, number][]) {
		const supply = team.reduce((a, m) => a + (m.yield[ing] ?? 0), 0);
		coverage = Math.min(coverage, supply / (n * mealsPerDay));
	}
	const tastyMultiplier = weekMultiplier(team.flatMap((m) => (m.tasty ? [m.tasty] : [])));
	const dish = mealsPerDay * coverage * problem.dishStrength * tastyMultiplier;
	return { berry, skill, coverage, tastyMultiplier, dish, total: berry + skill + dish };
}

export interface BestTeam {
	ids: string[];
	energy: TeamEnergy;
	/** false if the search space was too large and a local search was used instead. */
	exact: boolean;
}

/** Above this many combinations, fall back to local search. */
const maxCombinations = 1_500_000;

function binom(n: number, k: number): number {
	if (k < 0 || k > n) return 0;
	let r = 1;
	for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
	return r;
}

/**
 * Indices of members that can't be in any best team: some `free` other members are at least as good
 * in every respect (berries + skills, each recipe ingredient, Extra Tasty), so one of them is always
 * available to swap in without losing strength.
 */
function prune(cands: EnergyMember[], ings: IngredientName[], free: number): EnergyMember[] {
	const score = (m: EnergyMember) => m.berry + m.skill;
	const geq = (a: EnergyMember, b: EnergyMember) => {
		if (score(a) < score(b)) return false;
		for (const i of ings) if ((a.yield[i] ?? 0) < (b.yield[i] ?? 0)) return false;
		if (!b.tasty) return true;
		return !!a.tasty && a.tasty.perTrigger >= b.tasty.perTrigger && a.tasty.triggersPerDay >= b.tasty.triggersPerDay;
	};
	return cands.filter((b, bi) => {
		let dominators = 0;
		for (let ai = 0; ai < cands.length && dominators < free; ai++) {
			if (ai === bi) continue;
			const a = cands[ai];
			// Ties are broken by position so that identical members don't eliminate each other.
			if (geq(a, b) && (!geq(b, a) || ai < bi)) dominators++;
		}
		return dominators < free;
	});
}

/**
 * Best team of up to `size` members: `pinned` are always in, `excluded` never.
 * Exhaustive over the members that survive dominance pruning; local search if that is still too many.
 */
export function bestEnergyTeam(
	members: EnergyMember[],
	problem: EnergyProblem,
	pinned: string[] = [],
	excluded: string[] = [],
	size = 5,
): BestTeam {
	const ings = Object.keys(problem.recipe.ingredients) as IngredientName[];
	const fixed = members.filter((m) => pinned.includes(m.id)).slice(0, size);
	const free = size - fixed.length;
	const pool = prune(
		members.filter((m) => !pinned.includes(m.id) && !excluded.includes(m.id)),
		ings,
		free,
	);
	const k = Math.min(free, pool.length);

	const evaluate = (team: EnergyMember[]) => teamEnergy(team, problem);
	if (binom(pool.length, k) <= maxCombinations) {
		const ids = exhaustive(fixed, pool, k, problem, ings);
		return { ids, energy: evaluate(members.filter((m) => ids.includes(m.id))), exact: true };
	}
	return localSearch(fixed, pool, k, evaluate);
}

/** Tries every k-subset of `pool`, accumulating sums incrementally (no allocation per team). */
function exhaustive(
	fixed: EnergyMember[],
	pool: EnergyMember[],
	k: number,
	problem: EnergyProblem,
	ings: IngredientName[],
): string[] {
	const m = ings.length;
	const demand = ings.map((i) => (problem.recipe.ingredients[i] ?? 0) * mealsPerDay);
	const dishPerDay = mealsPerDay * problem.dishStrength;
	const all = [...fixed, ...pool];
	const scalar = all.map((x) => x.berry + x.skill);
	const supply = all.map((x) => ings.map((i) => x.yield[i] ?? 0));
	// Extra Tasty multiplier for each subset of the members that have a source, keyed by bitmask.
	const tastyIdx = all.map(() => -1);
	const sources: TastySource[] = [];
	all.forEach((x, i) => {
		if (x.tasty && sources.length < 24) {
			tastyIdx[i] = sources.length;
			sources.push(x.tasty);
		}
	});
	const tastyByMask = new Map<number, number>();
	const tastyOf = (mask: number) => {
		let v = tastyByMask.get(mask);
		if (v === undefined) {
			v = weekMultiplier(sources.filter((_, i) => mask & (1 << i)));
			tastyByMask.set(mask, v);
		}
		return v;
	};

	const sums = new Float64Array(m * (k + 1));
	let base = 0;
	let baseMask = 0;
	for (let f = 0; f < fixed.length; f++) {
		base += scalar[f];
		for (let j = 0; j < m; j++) sums[j] += supply[f][j];
		if (tastyIdx[f] >= 0) baseMask |= 1 << tastyIdx[f];
	}
	const offset = fixed.length;
	const chosen = new Int32Array(k);
	let bestTotal = Number.NEGATIVE_INFINITY;
	let bestChosen: number[] = [];

	const rec = (depth: number, start: number, score: number, mask: number) => {
		if (depth === k) {
			let coverage = 1;
			for (let j = 0; j < m; j++) {
				const c = sums[depth * m + j] / demand[j];
				if (c < coverage) coverage = c;
			}
			const total = score + dishPerDay * coverage * tastyOf(mask);
			if (total > bestTotal + 1e-9) {
				bestTotal = total;
				bestChosen = Array.from(chosen);
			}
			return;
		}
		for (let i = start; i <= pool.length - (k - depth); i++) {
			const a = offset + i;
			for (let j = 0; j < m; j++) sums[(depth + 1) * m + j] = sums[depth * m + j] + supply[a][j];
			chosen[depth] = i;
			rec(depth + 1, i + 1, score + scalar[a], tastyIdx[a] >= 0 ? mask | (1 << tastyIdx[a]) : mask);
		}
	};
	rec(0, 0, base, baseMask);
	return [...fixed.map((x) => x.id), ...bestChosen.map((i) => pool[i].id)];
}

/** Greedy start, then single swaps until no swap improves. */
function localSearch(
	fixed: EnergyMember[],
	pool: EnergyMember[],
	k: number,
	evaluate: (team: EnergyMember[]) => TeamEnergy,
): BestTeam {
	const chosen: EnergyMember[] = [];
	while (chosen.length < k) {
		let pick: EnergyMember | undefined;
		let pickTotal = Number.NEGATIVE_INFINITY;
		for (const m of pool) {
			if (chosen.includes(m)) continue;
			const t = evaluate([...fixed, ...chosen, m]).total;
			if (t > pickTotal) {
				pick = m;
				pickTotal = t;
			}
		}
		chosen.push(pick as EnergyMember);
	}
	let current = evaluate([...fixed, ...chosen]);
	for (let improved = true; improved; ) {
		improved = false;
		for (let i = 0; i < chosen.length; i++) {
			for (const m of pool) {
				if (chosen.includes(m)) continue;
				const trial = [...chosen];
				trial[i] = m;
				const e = evaluate([...fixed, ...trial]);
				if (e.total > current.total + 1e-9) {
					chosen.splice(0, chosen.length, ...trial);
					current = e;
					improved = true;
				}
			}
		}
	}
	return { ids: [...fixed, ...chosen].map((m) => m.id), energy: current, exact: false };
}

export interface SwapOption {
	policy: SwapPolicyResult;
	energy: TeamEnergy;
}

export interface SwapAnalysis {
	/** Best threshold rule. */
	best: SwapOption;
	/** Every threshold tried, lowest first (the first is "never", the last "always"). */
	options: SwapOption[];
}

/**
 * `swapIn` (an Extra Tasty Pokémon) and `partner` share one slot next to `others`, swapped after each
 * meal by a bonus threshold (see swapPolicy). Time on the team scales each one's berries, skill and
 * ingredients; ingredients are stockpiled, so coverage uses the time-averaged supply.
 */
export function swapAnalysis(
	others: EnergyMember[],
	swapIn: EnergyMember,
	partner: EnergyMember,
	problem: EnergyProblem,
): SwapAnalysis | undefined {
	if (!swapIn.tasty) return undefined;
	const fixedSources = others.flatMap((m) => (m.tasty ? [m.tasty] : []));
	const all = [...fixedSources, swapIn.tasty, ...(partner.tasty ? [partner.tasty] : [])];
	const ings = Object.entries(problem.recipe.ingredients) as [IngredientName, number][];
	const options = candidateThresholds(all).map((threshold) => {
		const policy = swapPolicy(fixedSources, swapIn.tasty as TastySource, partner.tasty, threshold);
		const s = policy.share;
		const mix = (f: (m: EnergyMember) => number) => others.reduce((a, m) => a + f(m), 0) + s * f(swapIn) + (1 - s) * f(partner);
		let coverage = 1;
		for (const [ing, n] of ings) coverage = Math.min(coverage, mix((m) => m.yield[ing] ?? 0) / (n * mealsPerDay));
		const berry = mix((m) => m.berry);
		const skill = mix((m) => m.skill);
		const dish = mealsPerDay * coverage * problem.dishStrength * policy.weekMultiplier;
		return { policy, energy: { berry, skill, coverage, tastyMultiplier: policy.weekMultiplier, dish, total: berry + skill + dish } };
	});
	const best = options.reduce((a, b) => (b.energy.total > a.energy.total + 1e-9 ? b : a));
	return { best, options };
}
