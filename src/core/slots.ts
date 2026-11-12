import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import type { IngredientYield } from "./yield";

export type Demand = Partial<Record<IngredientName, number>>;

/** A box Pokémon reduced to what the solver needs. */
export interface Member {
	id: string;
	yield: IngredientYield;
}

const eps = 1e-9;

/** Daily supply of each demanded ingredient if every given member works at full output. */
export function fullSupply(members: Member[], demand: Demand): Demand {
	const out: Demand = {};
	for (const i of Object.keys(demand) as IngredientName[]) {
		out[i] = members.reduce((a, m) => a + (m.yield[i] ?? 0), 0);
	}
	return out;
}

/**
 * Caps the demand at what the whole box can gather, so a team can always be scored.
 * `shortfall` is what even the whole box cannot gather per day.
 */
export function achievableDemand(box: Member[], demand: Demand): { demand: Demand; shortfall: Demand } {
	const supply = fullSupply(box, demand);
	const capped: Demand = {};
	const shortfall: Demand = {};
	for (const i of Object.keys(demand) as IngredientName[]) {
		const d = demand[i] ?? 0;
		const s = supply[i] ?? 0;
		capped[i] = Math.min(d, s);
		if (s < d - eps) shortfall[i] = d - s;
	}
	return { demand: capped, shortfall };
}

export interface SlotsResult {
	/**
	 * Fractional slots needed to cover the demand with these members, each usable at most once.
	 * Pinned members count as 1 each. Infinity if the members cannot cover the demand.
	 */
	slots: number;
	/** Share of each member's output that the optimum needs (0–1). Pinned members are 1. */
	usage: Map<string, number>;
}

/**
 * Minimum fractional number of slots needed to cover `demand` using `members`,
 * where each member can be used at most once:
 *
 *   minimize Σ x_p  subject to  Σ x_p · yield_p,i ≥ demand_i,  0 ≤ x_p ≤ 1
 *
 * x_p = 0.8 means only 80% of that Pokémon's output is needed. Pinned members are fixed at x = 1.
 * Duplicates are only possible if the box contains the same Pokémon twice.
 */
export function minSlots(members: Member[], demand: Demand, pinnedIds: string[] = []): SlotsResult {
	const pinned = members.filter((m) => pinnedIds.includes(m.id));
	const usage = new Map<string, number>(members.map((m) => [m.id, 0]));
	for (const m of pinned) usage.set(m.id, 1);

	const ings = (Object.keys(demand) as IngredientName[]).filter((i) => {
		const rest = (demand[i] ?? 0) - pinned.reduce((a, m) => a + (m.yield[i] ?? 0), 0);
		return rest > eps;
	});
	if (ings.length === 0) return { slots: pinned.length, usage };
	const need = ings.map((i) => (demand[i] ?? 0) - pinned.reduce((a, m) => a + (m.yield[i] ?? 0), 0));
	const cands = members.filter((m) => !pinnedIds.includes(m.id) && ings.some((i) => (m.yield[i] ?? 0) > eps));

	// Feasible iff using every candidate fully meets every ingredient.
	const feasible = ings.every((i, k) => cands.reduce((a, m) => a + (m.yield[i] ?? 0), 0) >= need[k] - 1e-7);
	if (!feasible) return { slots: Number.POSITIVE_INFINITY, usage };

	// Solved through the dual, whose origin is feasible:
	//   maximize Σ need_i u_i − Σ v_p   s.t.  Σ_i yield_p,i u_i − v_p ≤ 1,  u, v ≥ 0.
	// The primal x_p is the dual value of row p.
	const m = ings.length;
	const n = cands.length;
	const c = [...need, ...cands.map(() => -1)];
	const A = cands.map((cand, p) => [
		...ings.map((i) => cand.yield[i] ?? 0),
		...cands.map((_, q) => (q === p ? -1 : 0)),
	]);
	const { value, rowDuals } = simplexMax(c, A, cands.map(() => 1), m + n);
	cands.forEach((cand, p) => usage.set(cand.id, Math.min(1, Math.max(0, rowDuals[p]))));
	return { slots: pinned.length + value, usage };
}

/**
 * Maximizes cᵀz subject to Az ≤ b, z ≥ 0, with b ≥ 0 (origin feasible).
 * Returns the optimal value and the dual value of each constraint row.
 * Uses Bland's rule to avoid cycling. Throws if unbounded.
 */
export function simplexMax(
	c: number[],
	A: number[][],
	b: number[],
	nVars: number,
): { value: number; rowDuals: number[] } {
	const rows = A.length;
	const cols = nVars + rows + 1; // variables, slacks, rhs
	const T: number[][] = A.map((row, r) => {
		const t = new Array(cols).fill(0);
		row.forEach((v, j) => (t[j] = v));
		t[nVars + r] = 1;
		t[cols - 1] = b[r];
		return t;
	});
	const obj = new Array(cols).fill(0);
	c.forEach((v, j) => (obj[j] = -v));
	const basis = A.map((_, r) => nVars + r);

	for (let iter = 0; iter < 100000; iter++) {
		let enter = -1;
		for (let j = 0; j < cols - 1; j++) {
			if (obj[j] < -eps) {
				enter = j;
				break;
			}
		}
		if (enter === -1) {
			return { value: obj[cols - 1], rowDuals: A.map((_, r) => obj[nVars + r]) };
		}
		let leave = -1;
		let best = Number.POSITIVE_INFINITY;
		for (let r = 0; r < rows; r++) {
			if (T[r][enter] > eps) {
				const ratio = T[r][cols - 1] / T[r][enter];
				if (ratio < best - eps || (Math.abs(ratio - best) <= eps && basis[r] < basis[leave])) {
					best = ratio;
					leave = r;
				}
			}
		}
		if (leave === -1) throw new Error("LP is unbounded");

		const pivot = T[leave][enter];
		for (let j = 0; j < cols; j++) T[leave][j] /= pivot;
		for (let r = 0; r < rows; r++) {
			if (r !== leave && Math.abs(T[r][enter]) > eps) {
				const f = T[r][enter];
				for (let j = 0; j < cols; j++) T[r][j] -= f * T[leave][j];
			}
		}
		const f = obj[enter];
		for (let j = 0; j < cols; j++) obj[j] -= f * T[leave][j];
		basis[leave] = enter;
	}
	throw new Error("Simplex did not converge");
}

/**
 * The best team from the whole box: pinned members plus every member the optimum uses,
 * pinned first, then by how much of their output is needed.
 */
export function autoTeam(box: Member[], demand: Demand, pinnedIds: string[] = []): string[] {
	const target = achievableDemand(box, demand).demand;
	const { usage } = minSlots(box, target, pinnedIds);
	const used = box
		.filter((m) => !pinnedIds.includes(m.id) && (usage.get(m.id) ?? 0) > 1e-7)
		.sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
		.map((m) => m.id);
	return [...pinnedIds.filter((id) => box.some((m) => m.id === id)), ...used];
}

/** Average coverage over ingredients, each capped at 100%, if all members work at full output. */
export function averageCoverage(members: Member[], demand: Demand): number {
	const supply = fullSupply(members, demand);
	const ings = (Object.keys(demand) as IngredientName[]).filter((i) => (demand[i] ?? 0) > 0);
	if (ings.length === 0) return 1;
	return ings.reduce((a, i) => a + Math.min(1, (supply[i] ?? 0) / (demand[i] as number)), 0) / ings.length;
}

export interface BenchScore {
	id: string;
	/**
	 * Slots saved by adding this Pokémon to the current team (can be 0).
	 * Infinity if it turns a team that cannot cover the dish into one that can.
	 * null if the team still cannot cover the dish with it (see coverageGain).
	 */
	reduction: number | null;
	/** Team members the optimum stops using once this Pokémon joins. */
	replaces: string[];
	/** Gain in average capped coverage (at full output) from adding it. */
	coverageGain: number;
}

/**
 * Scores every bench Pokémon by how many slots it saves when added to the team.
 * `demand` should already be capped with {@link achievableDemand}.
 * Sorted: Pokémon that make the dish possible, then by reduction, then by coverage gain.
 */
export function benchScores(
	box: Member[],
	teamIds: string[],
	pinnedIds: string[],
	demand: Demand,
): BenchScore[] {
	const team = box.filter((m) => teamIds.includes(m.id));
	const base = minSlots(team, demand, pinnedIds);
	const baseCoverage = averageCoverage(team, demand);
	const scores = box
		.filter((m) => !teamIds.includes(m.id))
		.map((b): BenchScore => {
			const withB = minSlots([...team, b], demand, pinnedIds);
			let reduction: number | null = null;
			if (Number.isFinite(withB.slots)) {
				reduction = Number.isFinite(base.slots) ? Math.max(0, base.slots - withB.slots) : Number.POSITIVE_INFINITY;
			}
			const replaces = Number.isFinite(base.slots)
				? team
						.filter((m) => (base.usage.get(m.id) ?? 0) > 1e-7 && (withB.usage.get(m.id) ?? 0) <= 1e-7)
						.map((m) => m.id)
				: [];
			return { id: b.id, reduction, replaces, coverageGain: averageCoverage([...team, b], demand) - baseCoverage };
		});
	const rank = (s: BenchScore) => (s.reduction === null ? -1 : s.reduction);
	return scores.sort((a, b) => rank(b) - rank(a) || b.coverageGain - a.coverageGain);
}

/**
 * For each given Pokémon: slots of the best team from the box without it, minus slots of the best
 * team from the whole box. Independent of the current team. 0 if the best team doesn't need it;
 * Infinity if the box cannot cover the dish without it.
 * `demand` should already be capped with {@link achievableDemand} for the whole box.
 */
export function savingsVsBestWithout(
	box: Member[],
	demand: Demand,
	pinnedIds: string[],
	ids: string[],
): Map<string, number> {
	const best = minSlots(box, demand, pinnedIds).slots;
	return new Map(
		ids.map((id) => {
			const without = minSlots(
				box.filter((m) => m.id !== id),
				demand,
				pinnedIds.filter((p) => p !== id),
			).slots;
			return [id, Number.isFinite(without) ? Math.max(0, without - best) : Number.POSITIVE_INFINITY];
		}),
	);
}
