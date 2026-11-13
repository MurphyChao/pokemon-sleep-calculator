/**
 * Energy (strength) solver: the team that earns the most strength per day while cooking one target
 * dish at every meal, within 5 team slots. As in the slot solver, a Pokémon can use part of a slot:
 * it is on the team that share of the time (swapped with others), so more than 5 Pokémon can take part.
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
import { simplexMax } from "./slots";
import { candidateThresholds, extraTasty, type SwapPolicyResult, swapPolicy, type TastySource } from "./tasty";
import { type Heal, type HealSource, healFor, type IngredientYield } from "./yield";

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
	/** Set if the main skill restores energy. */
	heal?: HealSource;
	/**
	 * With simulated energy: this member's output when it receives `heal` during the day.
	 * Absent when energy is always full (healing changes nothing).
	 */
	at?: (heal: Heal | undefined) => EnergyMember;
}

const healsTeam = (m: EnergyMember) => !!m.at && !!m.heal && m.heal.team > 0;

/** Members as they perform on a team whose team-wide healers are `healers` (plus their own self-healing). */
export function resolveMembers(members: EnergyMember[], healers: HealSource[]): EnergyMember[] {
	return members.map((m) => (m.at ? m.at(healFor(healers, m.heal)) : m));
}

/** Team-wide heal sources among `team`. */
export function teamHealSources(team: EnergyMember[]): HealSource[] {
	return team.filter(healsTeam).map((m) => m.heal as HealSource);
}

/** A team's members as they perform together, healed by the team's own healers. */
export function resolveTeam(team: EnergyMember[]): EnergyMember[] {
	return resolveMembers(team, teamHealSources(team));
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

/** A team member and the share of the time it is on the team (its slot used, 0–1). */
export interface TeamEntry {
	member: EnergyMember;
	share: number;
}

/** A skill source active only `share` of the time: its triggers scale down accordingly. */
function scaled<T extends { triggersPerDay: number }>(source: T, share: number): T {
	return { ...source, triggersPerDay: source.triggersPerDay * share };
}

/** Strength per day of a team whose members are on it for the given shares of the time. */
export function weightedEnergy(team: TeamEntry[], problem: EnergyProblem): TeamEnergy {
	let berry = 0;
	let skill = 0;
	for (const { member, share } of team) {
		berry += share * member.berry;
		skill += share * member.skill;
	}
	let coverage = 1;
	for (const [ing, n] of Object.entries(problem.recipe.ingredients) as [IngredientName, number][]) {
		const supply = team.reduce((a, { member, share }) => a + share * (member.yield[ing] ?? 0), 0);
		coverage = Math.min(coverage, supply / (n * mealsPerDay));
	}
	const tastyMultiplier = weekMultiplier(
		team.flatMap(({ member, share }) => (member.tasty && share > 0 ? [scaled(member.tasty, share)] : [])),
	);
	const dish = mealsPerDay * coverage * problem.dishStrength * tastyMultiplier;
	return { berry, skill, coverage, tastyMultiplier, dish, total: berry + skill + dish };
}

/** Strength per day of a team whose members are all on it full time. */
export function teamEnergy(team: EnergyMember[], problem: EnergyProblem): TeamEnergy {
	return weightedEnergy(
		team.map((member) => ({ member, share: 1 })),
		problem,
	);
}

export interface BestTeam {
	/** Members with a share above 0, pinned first, then by share. */
	ids: string[];
	/** Share of the time each member is on the team (slot used, 0–1). */
	usage: Map<string, number>;
	/** Slots used in total (at most the slot limit). */
	slots: number;
	energy: TeamEnergy;
	/** The team's members as they perform together (healing applied), with their shares. */
	entries: TeamEntry[];
}

/** Shares tried for Extra Tasty Pokémon and healers, whose effect isn't linear in their share. */
const specialLevels = [0, 0.5, 1];
/** Above this many combinations of those levels, only 0 and 1 are tried. */
const maxSpecialCombos = 81;
const eps = 1e-7;

/**
 * Drops members whose share can always move to others without losing strength: at least `free`
 * other members are at least as good in berries + skills and every recipe ingredient, so together
 * they always have room (shares ≤ 1, at most `free` slots in total) to take over its share.
 */
function prune(pool: EnergyMember[], ings: [IngredientName, number][], free: number): EnergyMember[] {
	const need = Math.ceil(free - eps);
	const score = (m: EnergyMember) => m.berry + m.skill;
	const geq = (a: EnergyMember, b: EnergyMember) => {
		if (score(a) < score(b)) return false;
		for (const [i] of ings) if ((a.yield[i] ?? 0) < (b.yield[i] ?? 0)) return false;
		return true;
	};
	return pool.filter((b, bi) => {
		let dominators = 0;
		for (let ai = 0; ai < pool.length && dominators < need; ai++) {
			if (ai === bi) continue;
			const a = pool[ai];
			// Ties are broken by position so that identical members don't eliminate each other.
			if (geq(a, b) && (!geq(b, a) || ai < bi)) dominators++;
		}
		return dominators < need;
	});
}

function levelCombos(count: number, levels: number[], budget: number): number[][] {
	let out: number[][] = [[]];
	for (let i = 0; i < count; i++) {
		const next: number[][] = [];
		for (const combo of out) {
			const used = combo.reduce((a, b) => a + b, 0);
			for (const l of levels) if (used + l <= budget + eps) next.push([...combo, l]);
		}
		out = next;
	}
	return out;
}

/**
 * Best use of `slots` team slots: `pinned` members always take a full slot, `excluded` never play.
 *
 * Linear program over each member's share (0–1) of a slot: maximize berries + skills + dish, where the
 * dish is cooked for the share of meals the scarcest ingredient allows. Extra Tasty Pokémon and (with
 * simulated energy) team healers aren't linear in their share, so they are tried at 0, ½ and full time,
 * with every other member's output recomputed for that healing; the LP fills the remaining slots.
 */
export function bestEnergyTeam(
	members: EnergyMember[],
	problem: EnergyProblem,
	pinned: string[] = [],
	excluded: string[] = [],
	slots = 5,
): BestTeam {
	const ings = Object.entries(problem.recipe.ingredients) as [IngredientName, number][];
	const candidates = members.filter((m) => pinned.includes(m.id) || !excluded.includes(m.id));
	const isSpecial = (m: EnergyMember) => !!m.tasty || healsTeam(m);
	const pinnedMembers = candidates.filter((m) => pinned.includes(m.id)).slice(0, slots);
	const pinnedIds = pinnedMembers.map((m) => m.id);
	const special = candidates.filter((m) => isSpecial(m) && !pinnedIds.includes(m.id));
	const regular = candidates.filter((m) => !isSpecial(m) && !pinnedIds.includes(m.id));
	const budget = slots - pinnedMembers.length;
	const levels = specialLevels.length ** special.length <= maxSpecialCombos ? specialLevels : [0, 1];
	const combos = levelCombos(special.length, levels, budget);

	let best: { energy: TeamEnergy; entries: TeamEntry[] } | undefined;
	for (const combo of combos) {
		const fixedRaw: { member: EnergyMember; share: number }[] = [
			...pinnedMembers.map((member) => ({ member, share: 1 })),
			...special.map((member, i) => ({ member, share: combo[i] })).filter((e) => e.share > 0),
		];
		const heals = fixedRaw.filter((e) => healsTeam(e.member)).map((e) => scaled(e.member.heal as HealSource, e.share));
		const fixed = fixedRaw.map((e) => ({ member: resolveMembers([e.member], heals)[0], share: e.share }));
		const free = budget - combo.reduce((a, b) => a + b, 0);
		const pool = prune(resolveMembers(regular, heals), ings, free);
		const tastyMultiplier = weekMultiplier(
			fixed.flatMap(({ member, share }) => (member.tasty ? [scaled(member.tasty, share)] : [])),
		);
		const dishPerDay = mealsPerDay * problem.dishStrength * tastyMultiplier;
		const shares = solveShares(fixed, pool, free, dishPerDay, ings);
		const entries = [...fixed, ...pool.map((member, i) => ({ member, share: shares[i] })).filter((e) => e.share > eps)];
		const energy = weightedEnergy(entries, problem);
		if (!best || energy.total > best.energy.total + 1e-6) best = { energy, entries };
	}
	const result = best as { energy: TeamEnergy; entries: TeamEntry[] };
	const entries = [...result.entries].sort(
		(a, b) =>
			Number(pinnedIds.includes(b.member.id)) - Number(pinnedIds.includes(a.member.id)) || b.share - a.share,
	);
	return {
		ids: entries.map((e) => e.member.id),
		usage: new Map(entries.map((e) => [e.member.id, e.share])),
		slots: entries.reduce((a, e) => a + e.share, 0),
		energy: result.energy,
		entries,
	};
}

/**
 * LP: shares x (0–1) of `pool` members within `free` slots, maximizing Σ x·(berry + skill) + dishPerDay·c,
 * where c ≤ 1 and c·demand_j ≤ fixed supply_j + Σ x·yield_j for every recipe ingredient.
 */
function solveShares(
	fixed: TeamEntry[],
	pool: EnergyMember[],
	free: number,
	dishPerDay: number,
	ings: [IngredientName, number][],
): number[] {
	const n = pool.length;
	if (n === 0 || free <= eps) return pool.map(() => 0);
	// Variables: x_0..x_{n-1}, c.
	const c = [...pool.map((m) => m.berry + m.skill), dishPerDay];
	const A: number[][] = [];
	const b: number[] = [];
	for (const [ing, need] of ings) {
		A.push([...pool.map((m) => -(m.yield[ing] ?? 0)), need * mealsPerDay]);
		b.push(fixed.reduce((a, e) => a + e.share * (e.member.yield[ing] ?? 0), 0));
	}
	A.push([...pool.map(() => 0), 1]);
	b.push(1);
	A.push([...pool.map(() => 1), 0]);
	b.push(free);
	pool.forEach((_, i) => {
		A.push([...pool.map((__, j) => (j === i ? 1 : 0)), 0]);
		b.push(1);
	});
	const { solution } = simplexMax(c, A, b, n + 1);
	return solution.slice(0, n).map((x) => Math.min(1, Math.max(0, x)));
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
 * `swapIn` (an Extra Tasty Pokémon) and `partner` share one slot of size `slotSize` (0–1) next to
 * `others`, swapped after each meal by a bonus threshold (see swapPolicy). Time on the team scales
 * each one's berries, skill, ingredients and skill triggers; ingredients are stockpiled, so coverage
 * uses the time-averaged supply.
 */
export function swapAnalysis(
	others: TeamEntry[],
	swapIn: EnergyMember,
	partner: EnergyMember,
	problem: EnergyProblem,
	slotSize = 1,
): SwapAnalysis | undefined {
	if (!swapIn.tasty || slotSize <= eps) return undefined;
	const fixedSources = others.flatMap(({ member, share }) => (member.tasty ? [scaled(member.tasty, share)] : []));
	const inSource = scaled(swapIn.tasty, slotSize);
	const partnerSource = partner.tasty ? scaled(partner.tasty, slotSize) : undefined;
	const all = [...fixedSources, inSource, ...(partnerSource ? [partnerSource] : [])];
	const ings = Object.entries(problem.recipe.ingredients) as [IngredientName, number][];
	const options = candidateThresholds(all).map((threshold) => {
		const policy = swapPolicy(fixedSources, inSource, partnerSource, threshold);
		const s = policy.share;
		const mix = (f: (m: EnergyMember) => number) =>
			others.reduce((a, { member, share }) => a + share * f(member), 0) +
			slotSize * (s * f(swapIn) + (1 - s) * f(partner));
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
