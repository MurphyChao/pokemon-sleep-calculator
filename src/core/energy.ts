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
import { helperLevels, simplexMax, simplexMaxGeneral } from "./slots";
import { candidateThresholds, extraTasty, type SwapPolicyResult, swapPolicy, type TastySource } from "./tasty";
import { type Heal, type HealSource, healFor, type IngredientYield, maxHelpers } from "./yield";

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
	/** Set if it has Helping Bonus: every teammate helps 5% faster. */
	helpingBonus?: boolean;
	/** This member's output with this many teammates' worth of Helping Bonus (0–4, can be fractional). */
	withHelpers?: (helpers: number) => EnergyMember;
}

/** A member's output when the team's Helping Bonus Pokémon fill `helpers` slots (its own doesn't count). */
export function helpedMember(m: EnergyMember, helpers: number): EnergyMember {
	if (!m.withHelpers || helpers <= 0) return m;
	return m.withHelpers(Math.min(maxHelpers, m.helpingBonus ? Math.max(0, helpers - 1) : helpers));
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

/** Team-wide heal sources of a team whose members are on it part of the time (triggers scaled by share). */
export function weightedHealSources(team: { member: EnergyMember; share: number }[]): HealSource[] {
	return team
		.filter((e) => healsTeam(e.member) && e.share > 0)
		.map((e) => ({ ...(e.member.heal as HealSource), triggersPerDay: (e.member.heal as HealSource).triggersPerDay * e.share }));
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
	/** The team's members as they perform together (healing and Helping Bonus applied), with their shares. */
	entries: TeamEntry[];
	/** Helping Bonus the team counts on: slots its Helping Bonus members fill at least (see bestEnergyTeam). */
	helpers: number;
}

/** Shares tried for Extra Tasty Pokémon and healers, whose effect isn't linear in their share. */
const specialLevels = [0, 0.5, 1];
/** Shares tried when refining the best combination one member at a time. */
const refineLevels = [0, 0.25, 0.5, 0.75, 1];
/** Above this many combinations of those levels, only 0 and 1 are tried (then refined). */
const maxSpecialCombos = 243;
const eps = 1e-7;
/** Shares below this are dropped (they'd show as 0.00 and change nothing visible). */
const minShare = 0.005;

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
		// Helping Bonus's value to the team isn't in the score, so those members are always kept.
		if (b.helpingBonus) return true;
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

/** Level combinations within the budget, with at most `maxOn` members above 0. */
function levelCombos(count: number, levels: number[], budget: number, maxOn = count): number[][] {
	let out: number[][] = [[]];
	for (let i = 0; i < count; i++) {
		const next: number[][] = [];
		for (const combo of out) {
			const used = combo.reduce((a, b) => a + b, 0);
			const on = combo.filter((l) => l > 0).length;
			for (const l of levels) if (used + l <= budget + eps && (l === 0 || on < maxOn)) next.push([...combo, l]);
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
 * simulated energy) team healers aren't linear in their share, so they are tried at 0, ½ and full time
 * (only 0 and full with more than 5 of them), with every other member's output recomputed for that
 * healing and the LP filling the remaining slots; the best combination is then refined in quarter steps.
 *
 * Helping Bonus makes everyone's output depend on the team, so with members that have it, each team
 * total H of helperLevels is tried: every member's output is counted with H's worth of Helping Bonus
 * (members with it count the others only), the Helping Bonus members must fill at least H slots between
 * them, and the strongest result over all H wins. Using more Helping Bonus than H only helps, so every
 * result is achievable.
 */
export function bestEnergyTeam(
	members: EnergyMember[],
	problem: EnergyProblem,
	pinned: string[] = [],
	excluded: string[] = [],
	slots = 5,
): BestTeam {
	const withBonus = members.filter(
		(m) => m.helpingBonus && m.withHelpers && (pinned.includes(m.id) || !excluded.includes(m.id)),
	).length;
	// Every combination of Extra Tasty and healer shares is tried without Helping Bonus; with it, the
	// search starts from the best combinations found so far and refines them, which is much faster.
	const first = bestEnergyTeamWith(members, problem, pinned, excluded, slots, 0) as BestTeamWithCombo;
	let best = first;
	for (const helpers of helperLevels(withBonus).slice(1)) {
		const starts = best === first ? [first.combo] : [first.combo, best.combo];
		const team = bestEnergyTeamWith(members, problem, pinned, excluded, slots, helpers, starts);
		if (team && team.energy.total > best.energy.total + 1e-6) best = team;
	}
	const { combo: _, ...team } = best;
	return team;
}

type BestTeamWithCombo = BestTeam & { combo: number[] };

/**
 * {@link bestEnergyTeam} for one Helping Bonus total `helpers`; undefined if the Helping Bonus members
 * can't fill that many slots. With `starts`, only those combinations of special members' shares are
 * tried before refining, instead of all of them.
 */
function bestEnergyTeamWith(
	members: EnergyMember[],
	problem: EnergyProblem,
	pinned: string[],
	excluded: string[],
	slots: number,
	helpers: number,
	starts?: number[][],
): BestTeamWithCombo | undefined {
	const ings = Object.entries(problem.recipe.ingredients) as [IngredientName, number][];
	const candidates = members.filter((m) => pinned.includes(m.id) || !excluded.includes(m.id));
	const isSpecial = (m: EnergyMember) => !!m.tasty || healsTeam(m);
	const pinnedMembers = candidates.filter((m) => pinned.includes(m.id)).slice(0, slots);
	const pinnedIds = pinnedMembers.map((m) => m.id);
	const special = candidates.filter((m) => isSpecial(m) && !pinnedIds.includes(m.id));
	const regular = candidates.filter((m) => !isSpecial(m) && !pinnedIds.includes(m.id));
	const budget = slots - pinnedMembers.length;
	const levels = specialLevels.length ** special.length <= maxSpecialCombos ? specialLevels : [0, 1];
	const combos = starts ?? levelCombos(special.length, levels, budget);

	type Candidate = { energy: TeamEnergy; entries: TeamEntry[]; combo: number[]; feasible: boolean };
	const seen = new Map<string, Candidate>();
	const evaluate = (combo: number[]): Candidate => {
		const key = combo.join(",");
		const hit = seen.get(key);
		if (hit) return hit;
		const c = evaluateCombo(combo);
		seen.set(key, c);
		return c;
	};
	const evaluateCombo = (combo: number[]): Candidate => {
		const fixedRaw: { member: EnergyMember; share: number }[] = [
			...pinnedMembers.map((member) => ({ member, share: 1 })),
			...special.map((member, i) => ({ member, share: combo[i] })).filter((e) => e.share > 0),
		];
		const heals = fixedRaw
			.filter((e) => healsTeam(e.member))
			.map((e) => scaled(helpedMember(e.member, helpers).heal as HealSource, e.share));
		const fixed = fixedRaw.map((e) => ({ member: helpedMember(resolveMembers([e.member], heals)[0], helpers), share: e.share }));
		const free = budget - combo.reduce((a, b) => a + b, 0);
		const pool = prune(
			resolveMembers(regular, heals).map((m) => helpedMember(m, helpers)),
			ings,
			free,
		);
		const bonusNeed = helpers - fixed.reduce((a, e) => a + (e.member.helpingBonus ? e.share : 0), 0);
		const tastyMultiplier = weekMultiplier(
			fixed.flatMap(({ member, share }) => (member.tasty ? [scaled(member.tasty, share)] : [])),
		);
		const dishPerDay = mealsPerDay * problem.dishStrength * tastyMultiplier;
		const shares = solveShares(fixed, pool, free, dishPerDay, ings, bonusNeed);
		if (!shares) return { energy: { ...noEnergy }, entries: fixed, combo, feasible: false };
		const entries = [...fixed, ...pool.map((member, i) => ({ member, share: shares[i] })).filter((e) => e.share > minShare)];
		return { energy: weightedEnergy(entries, problem), entries, combo, feasible: true };
	};

	let best: Candidate | undefined;
	for (const combo of combos) {
		const c = evaluate(combo);
		if (!best || c.energy.total > best.energy.total + 1e-6) best = c;
	}
	// Refine: move one special member's share at a time to another quarter step while that improves.
	for (let improved = special.length > 0; improved; ) {
		improved = false;
		const current = best as Candidate;
		for (let i = 0; i < special.length; i++) {
			for (const level of refineLevels) {
				if (Math.abs(level - current.combo[i]) < eps) continue;
				const combo = [...current.combo];
				combo[i] = level;
				if (combo.reduce((a, b) => a + b, 0) > budget + eps) continue;
				const c = evaluate(combo);
				if (c.energy.total > (best as Candidate).energy.total + 1e-6) {
					best = c;
					improved = true;
				}
			}
		}
	}
	if (!best?.feasible) return undefined;
	const result = best;
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
		helpers,
		combo: result.combo,
	};
}

/** Score of a combination that can't meet its Helping Bonus total. */
const noEnergy: TeamEnergy = {
	berry: 0,
	skill: 0,
	coverage: 0,
	tastyMultiplier: 1,
	dish: 0,
	total: Number.NEGATIVE_INFINITY,
};

/**
 * LP: shares x (0–1) of `pool` members within `free` slots, maximizing Σ x·(berry + skill) + dishPerDay·c,
 * where c ≤ 1 and c·demand_j ≤ fixed supply_j + Σ x·yield_j for every recipe ingredient, and the pool's
 * Helping Bonus members fill at least `bonusNeed` slots. Null if they can't.
 */
function solveShares(
	fixed: TeamEntry[],
	pool: EnergyMember[],
	free: number,
	dishPerDay: number,
	ings: [IngredientName, number][],
	bonusNeed = 0,
): number[] | null {
	const n = pool.length;
	const needsBonus = bonusNeed > eps;
	if (!needsBonus && (n === 0 || free <= eps)) return pool.map(() => 0);
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
	if (needsBonus) {
		A.push([...pool.map((m) => (m.helpingBonus ? -1 : 0)), 0]);
		b.push(-bonusNeed);
	}
	const result = needsBonus ? simplexMaxGeneral(c, A, b, n + 1) : simplexMax(c, A, b, n + 1);
	if (!result) return null;
	return result.solution.slice(0, n).map((x) => Math.min(1, Math.max(0, x)));
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
