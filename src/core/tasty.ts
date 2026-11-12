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
 * Long-run Extra Tasty chance and expected multiplier, weekdays and Sunday separately.
 *
 * Tracks the probability distribution of the accumulated bonus (whole percentage points 0–70)
 * meal by meal through the week. Skill triggers between two meals are modelled as Poisson with
 * a third of the daily expected count, which ignores the exact timing of night-time triggers.
 */
export function extraTasty(sources: TastySource[]): TastyResult {
	const active = sources
		.map((s) => ({ step: Math.round(s.perTrigger), lambda: Math.max(0, s.triggersPerDay) / mealsPerDay }))
		.filter((s) => s.step > 0)
		.map((s) => ({ step: s.step, pmf: poisson(s.lambda, Math.ceil(bonusCap / s.step)) }));

	let dist = new Array(bonusCap + 1).fill(0);
	dist[0] = 1;
	const mealsPerWeek = 7 * mealsPerDay;
	const sundayStart = 6 * mealsPerDay;
	let chances = new Array(mealsPerWeek).fill(0);

	for (let week = 0; week < 500; week++) {
		const startDist = dist;
		const weekChances: number[] = [];
		for (let meal = 0; meal < mealsPerWeek; meal++) {
			// Skill triggers since the previous meal.
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
			// Cook: success resets the bonus.
			const base = meal >= sundayStart ? sundayBaseChance : weekdayBaseChance;
			const next = new Array(bonusCap + 1).fill(0);
			let chance = 0;
			for (let b = 0; b <= bonusCap; b++) {
				const p = Math.min(100, base + b) / 100;
				chance += dist[b] * p;
				next[0] += dist[b] * p;
				next[b] += dist[b] * (1 - p);
			}
			weekChances.push(chance);
			dist = next;
		}
		chances = weekChances;
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
	};
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
