/**
 * Extra Tasty ("critical") cooking model.
 *
 * Constants as used by SleepAPI's cooking simulation (common/src/types/constants.ts) and widely
 * reported by community guides; the base rates are community estimates, not official numbers.
 * - Base Extra Tasty chance: 10% Monday–Saturday, 30% Sunday.
 * - Extra Tasty dishes are worth ×2 (Monday–Saturday) or ×3 (Sunday).
 * - Skills (Tasty Chance S, Bulk Up, Mystical Fire) add a bonus on top of the base chance.
 *   The bonus is capped at 70 percentage points, carries over between meals and days,
 *   and resets to 0 after an Extra Tasty dish.
 */

export const weekdayBaseChance = 10;
export const sundayBaseChance = 30;
export const bonusCap = 70;
export const weekdayMultiplier = 2;
export const sundayMultiplier = 3;
export const mealsPerDay = 3;

/** A team member whose main skill raises the Extra Tasty chance. */
export interface TastySource {
	/** Percentage points added per skill trigger. */
	perTrigger: number;
	/** Expected skill triggers per day. */
	triggersPerDay: number;
}

export interface TastyResult {
	/** Average Extra Tasty chance per meal (0–1). */
	weekdayChance: number;
	sundayChance: number;
	/** Expected dish strength multiplier per meal (1 = never Extra Tasty). */
	weekdayMultiplier: number;
	sundayMultiplier: number;
	/** Expected multiplier averaged over all 21 meals of the week. */
	weekMultiplier: number;
}

/**
 * Poisson probabilities P(k) for k = 0..maxK, with P(k ≥ maxK) lumped into the last entry
 * (more triggers than that hit the bonus cap anyway). Computed in log space to stay stable.
 */
function poisson(lambda: number, maxK: number): number[] {
	if (lambda <= 0) return [1];
	const out: number[] = [];
	let logP = -lambda;
	let cum = 0;
	for (let k = 0; k < maxK; k++) {
		const p = Math.exp(logP);
		out.push(p);
		cum += p;
		logP += Math.log(lambda) - Math.log(k + 1);
	}
	out.push(Math.max(0, 1 - cum));
	return out;
}

/**
 * For each starting bonus 0–70, the distribution of the bonus after one meal window of skill
 * triggers from `sources` (each Poisson with a third of its daily expected count).
 */
function windowTransition(sources: TastySource[]): number[][] {
	const active = sources
		.map((s) => ({ step: Math.round(s.perTrigger), lambda: Math.max(0, s.triggersPerDay) / mealsPerDay }))
		.filter((s) => s.step > 0)
		.map((s) => ({ step: s.step, pmf: poisson(s.lambda, Math.ceil(bonusCap / s.step)) }));
	const rows: number[][] = [];
	for (let start = 0; start <= bonusCap; start++) {
		let dist = new Array(bonusCap + 1).fill(0);
		dist[start] = 1;
		for (const s of active) {
			const next = new Array(bonusCap + 1).fill(0);
			for (let b = 0; b <= bonusCap; b++) {
				if (dist[b] === 0) continue;
				s.pmf.forEach((pk, k) => {
					next[Math.min(bonusCap, b + k * s.step)] += dist[b] * pk;
				});
			}
			dist = next;
		}
		rows.push(dist);
	}
	return rows;
}

interface WeekResult extends TastyResult {
	/** Share of meal windows that used the "low bonus" team (0–1). */
	lowShare: number;
}

/**
 * Long-run steady state over the week. Before each meal window the team is chosen from the
 * current bonus: `low` while the bonus is below `threshold`, otherwise `high`.
 */
function steadyState(low: number[][], high: number[][], threshold: number): WeekResult {
	const mealsPerWeek = 7 * mealsPerDay;
	const sundayStart = 6 * mealsPerDay;
	let dist = new Array(bonusCap + 1).fill(0);
	dist[0] = 1;
	let chances: number[] = [];
	let lowShare = 0;

	for (let week = 0; week < 500; week++) {
		const startDist = dist;
		const weekChances: number[] = [];
		let weekLow = 0;
		for (let meal = 0; meal < mealsPerWeek; meal++) {
			// Skill triggers until the next meal.
			const afterSkills = new Array(bonusCap + 1).fill(0);
			for (let b = 0; b <= bonusCap; b++) {
				const p = dist[b];
				if (p === 0) continue;
				const useLow = b < threshold;
				if (useLow) weekLow += p;
				const row = (useLow ? low : high)[b];
				for (let to = b; to <= bonusCap; to++) afterSkills[to] += p * row[to];
			}
			// Cook: success resets the bonus.
			const base = meal >= sundayStart ? sundayBaseChance : weekdayBaseChance;
			const next = new Array(bonusCap + 1).fill(0);
			let chance = 0;
			for (let b = 0; b <= bonusCap; b++) {
				const p = Math.min(100, base + b) / 100;
				chance += afterSkills[b] * p;
				next[0] += afterSkills[b] * p;
				next[b] += afterSkills[b] * (1 - p);
			}
			weekChances.push(chance);
			dist = next;
		}
		chances = weekChances;
		lowShare = weekLow / mealsPerWeek;
		const diff = dist.reduce((a, v, i) => a + Math.abs(v - startDist[i]), 0);
		if (diff < 1e-12) break;
	}

	const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
	const weekdayChance = avg(chances.slice(0, sundayStart));
	const sundayChance = avg(chances.slice(sundayStart));
	const weekdayMult = 1 + (weekdayMultiplier - 1) * weekdayChance;
	const sundayMult = 1 + (sundayMultiplier - 1) * sundayChance;
	return {
		weekdayChance,
		sundayChance,
		weekdayMultiplier: weekdayMult,
		sundayMultiplier: sundayMult,
		weekMultiplier: (6 * weekdayMult + sundayMult) / 7,
		lowShare,
	};
}

/**
 * Long-run Extra Tasty chance and expected multiplier, weekdays and Sunday separately.
 *
 * Tracks the probability distribution of the accumulated bonus (whole percentage points 0–70)
 * meal by meal through the week. Skill triggers between two meals are modelled as Poisson with
 * a third of the daily expected count, which ignores the exact timing of night-time triggers.
 */
export function extraTasty(sources: TastySource[]): TastyResult {
	const t = windowTransition(sources);
	const { lowShare: _, ...result } = steadyState(t, t, 0);
	return result;
}

export interface SwapPolicyResult extends TastyResult {
	/** Bonus threshold: the Extra Tasty Pokémon is on the team while the bonus is below this. */
	threshold: number;
	/** Share of meal windows the Extra Tasty Pokémon is on the team (0–1). */
	share: number;
}

/**
 * Two Pokémon share one team slot and are swapped after every meal: `swapIn` (an Extra Tasty
 * source) while the bonus is below `threshold`, the partner otherwise. `team` are the
 * Extra Tasty sources that stay on the team all the time; `partner` is the partner's own source, if any.
 */
export function swapPolicy(
	team: TastySource[],
	swapIn: TastySource,
	partner: TastySource | undefined,
	threshold: number,
): SwapPolicyResult {
	const low = windowTransition([...team, swapIn]);
	const high = windowTransition(partner ? [...team, partner] : team);
	const { lowShare, ...result } = steadyState(low, high, threshold);
	return { ...result, threshold, share: lowShare };
}

/**
 * Thresholds worth trying: the bonus values that can actually occur (0 = never swap in,
 * 71 = always). Other thresholds behave the same as the next reachable value.
 */
export function candidateThresholds(sources: TastySource[]): number[] {
	const steps = [...new Set(sources.map((s) => Math.round(s.perTrigger)).filter((s) => s > 0))];
	const reachable = new Set<number>([0]);
	const queue = [0];
	while (queue.length > 0) {
		const b = queue.pop() as number;
		for (const s of steps) {
			const n = Math.min(bonusCap, b + s);
			if (!reachable.has(n)) {
				reachable.add(n);
				queue.push(n);
			}
		}
	}
	// Threshold t means "swap in while bonus < t": t = b + 1 for each reachable b, plus 0.
	return [0, ...[...reachable].sort((a, b) => a - b).map((b) => b + 1)];
}

export interface TastySlotValue {
	weekday: number;
	sunday: number;
	week: number;
}

/**
 * Slot-equivalents of adding `candidate` to a team whose existing Extra Tasty sources are `team`
 * and whose ingredients need `slots` slots: the extra dish strength it brings, divided by the dish
 * strength each slot produces. The dish's own strength cancels out, so only multipliers matter.
 */
export function tastySlotValue(team: TastySource[], candidate: TastySource, slots: number): TastySlotValue {
	const base = extraTasty(team);
	const withC = extraTasty([...team, candidate]);
	const value = (a: number, b: number) => ((b - a) / a) * slots;
	return {
		weekday: value(base.weekdayMultiplier, withC.weekdayMultiplier),
		sunday: value(base.sundayMultiplier, withC.sundayMultiplier),
		week: value(base.weekMultiplier, withC.weekMultiplier),
	};
}
