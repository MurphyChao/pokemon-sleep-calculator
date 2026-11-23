/**
 * Everything the energy solver works out for a box, settings and dish: each Pokémon's yields (with Helping
 * Bonus and, with simulated energy, healing), the best team, the best team without each member and with each
 * bench Pokémon, and the default swap partner. The page and the web workers (which work it out ahead, in the
 * background) use the same code, so their results are the same.
 */
import type { BoxEntry } from "./box";
import {
	type BestTeam,
	bestEnergyTeam,
	dishStrength,
	type EnergyMember,
	type EnergyProblem,
	resolveMembers,
	swapAnalysis,
	weightedHealSources,
} from "./energy";
import { eventKey } from "./event";
import type { Recipe } from "./recipes";
import {
	dailyIngredientYieldDetail,
	emptyYieldDetail,
	type Heal,
	soloYieldDetail,
	type StrengthOptions,
	type YieldDetail,
	type YieldOptions,
	withHelpers,
} from "./yield";

/** Team slots shared by all Pokémon. */
export const teamSlots = 5;

/** A box's yields: on its own (`details`), with Helping Bonus (`helpedDetail`), healed (`healedDetail`). */
export interface EnergyYields {
	details: Map<string, YieldDetail>;
	/** Yields on its own with `helpers` teammates' worth of Helping Bonus (0–4, can be fractional; cached). */
	helpedDetail: (id: string, helpers: number) => YieldDetail;
	/** With simulated energy: yields when healed by `heal`, with `helpers` as above (cached). */
	healedDetail?: (id: string, heal: Heal | undefined, helpers?: number) => YieldDetail;
}

/** The yields of every Pokémon in `box` with these settings (computed as asked for, and cached). */
export function energyYields(box: BoxEntry[], options: YieldOptions, strength: StrengthOptions): EnergyYields {
	const byId = new Map(box.map((e) => [e.id, e]));
	const details = new Map<string, YieldDetail>();
	for (const e of box) {
		try {
			details.set(e.id, soloYieldDetail(e, options, strength));
		} catch {
			details.set(e.id, emptyYieldDetail);
		}
	}
	const helpedCache = new Map<string, YieldDetail>();
	const helpedAt = (id: string, helpers: number): YieldDetail => {
		if (helpers === 0) return details.get(id) ?? emptyYieldDetail;
		const key = `${id}|${helpers}`;
		let d = helpedCache.get(key);
		if (d === undefined) {
			const e = byId.get(id);
			try {
				d = e ? soloYieldDetail(e, options, strength, helpers) : emptyYieldDetail;
			} catch {
				d = emptyYieldDetail;
			}
			helpedCache.set(key, d);
		}
		return d;
	};
	const helpedDetail = (id: string, helpers: number) => withHelpers((k) => helpedAt(id, k), helpers);
	if (options.energy !== "simulated") return { details, helpedDetail };
	const healedCache = new Map<string, YieldDetail>();
	const healedAt = (id: string, heal: Heal | undefined, helpers: number): YieldDetail => {
		const key = `${id}|${helpers}|${heal ? `${heal.count}|${heal.energy.toFixed(3)}` : "-"}`;
		let d = healedCache.get(key);
		if (d === undefined) {
			const e = byId.get(id);
			try {
				// The heal it gives others is the one worked out on its own (with its own healing).
				d = e
					? { ...dailyIngredientYieldDetail(e, options, strength, heal, helpers), heal: helpedDetail(id, helpers).heal }
					: emptyYieldDetail;
			} catch {
				d = emptyYieldDetail;
			}
			healedCache.set(key, d);
		}
		return d;
	};
	const healedDetail = (id: string, heal: Heal | undefined, helpers = 0) =>
		withHelpers((k) => healedAt(id, heal, k), helpers);
	return { details, helpedDetail, healedDetail };
}

/** The solver's members for `box`: each Pokémon's output on its own, able to work out its output on a team. */
export function energyMembers(box: BoxEntry[], yields: EnergyYields): EnergyMember[] {
	const { details, helpedDetail, healedDetail } = yields;
	/** `heal`: healing received on the team, or "solo" for the Pokémon on its own (as in `details`). */
	const toMember = (id: string, d: YieldDetail | undefined, heal: Heal | undefined | "solo"): EnergyMember => {
		const m: EnergyMember = {
			id,
			yield: d?.total ?? {},
			berry: d?.berryStrength ?? 0,
			skill: d?.skillStrength ?? 0,
			...(d?.tasty && { tasty: d.tasty }),
			...(d?.heal && { heal: d.heal }),
			...(d?.helpingBonus && { helpingBonus: true }),
		};
		if (healedDetail) m.at = (h) => toMember(id, healedDetail(id, h), h);
		m.withHelpers = (helpers) =>
			toMember(id, heal === "solo" || !healedDetail ? helpedDetail(id, helpers) : healedDetail(id, heal, helpers), heal);
		return m;
	};
	return box.map((e) => toMember(e.id, details.get(e.id), "solo"));
}

/** The dish's strength with these settings (recipe level, island bonus, event's dish multiplier). */
export function energyProblem(recipe: Recipe, recipeLevel: number, fieldBonus: number, dishMultiplier: number): EnergyProblem {
	return { recipe, dishStrength: dishStrength(recipe, recipeLevel, fieldBonus) * dishMultiplier };
}

export interface EnergyAnalysis {
	best: BestTeam;
	/** For each team member: the best team without it. */
	without: Map<string, BestTeam>;
	/** For each bench Pokémon: the best team that gives it a full slot. */
	withIt: Map<string, BestTeam>;
	/** Bench Pokémon, best (by the team with it) first. */
	bench: string[];
}

/** The best team, the best team without each member, and with each bench Pokémon. */
export function analyzeEnergy(
	members: EnergyMember[],
	problem: EnergyProblem,
	pinned: string[],
	excluded: string[],
): EnergyAnalysis {
	const best = bestEnergyTeam(members, problem, pinned, excluded);
	const others = members.filter((m) => !best.ids.includes(m.id)).map((m) => m.id);
	const without = new Map<string, BestTeam>();
	for (const id of best.ids) {
		without.set(
			id,
			bestEnergyTeam(
				members,
				problem,
				pinned.filter((x) => x !== id),
				[...excluded, id],
			),
		);
	}
	const withIt = new Map<string, BestTeam>();
	for (const id of others) {
		withIt.set(
			id,
			bestEnergyTeam(
				members,
				problem,
				[...pinned, id],
				excluded.filter((x) => x !== id),
			),
		);
	}
	const bench = [...others].sort((a, b) => (withIt.get(b)?.energy.total ?? 0) - (withIt.get(a)?.energy.total ?? 0));
	return { best, without, withIt, bench };
}

/** Extra Tasty Pokémon that can be swapped in (not excluded). */
export function swapCandidates(members: EnergyMember[], excluded: string[]): string[] {
	return members.filter((m) => m.tasty && !excluded.includes(m.id)).map((m) => m.id);
}

/**
 * The swap card's pair: the Extra Tasty Pokémon (chosen, or by default one on the team, else the best on the
 * bench) and its partner (chosen, or by default the best of the team's members and the top of the bench), and
 * the best swapping rule for them. The pair shares exactly one slot; the other slots go to the best team without
 * the two of them, whose members keep their shares and output; the pair is healed by their healers (and its own).
 */
export function swapResult(
	members: EnergyMember[],
	problem: EnergyProblem,
	analysis: EnergyAnalysis,
	pinned: string[],
	excluded: string[],
	chosenIn: string | null,
	chosenPartner: string | null,
) {
	const { best, withIt } = analysis;
	const byId = new Map(members.map((m) => [m.id, m]));
	const tastyIds = swapCandidates(members, excluded);
	const defaultIn =
		best.ids.find((id) => tastyIds.includes(id)) ??
		[...tastyIds].sort((a, b) => (withIt.get(b)?.energy.total ?? 0) - (withIt.get(a)?.energy.total ?? 0))[0];
	const swapInId = chosenIn !== null && tastyIds.includes(chosenIn) ? chosenIn : defaultIn;
	if (swapInId === undefined) return undefined;
	const partnerChoices = members.map((m) => m.id).filter((id) => id !== swapInId && !excluded.includes(id));
	const analyse = (inId: string, partnerId: string) => {
		const rest = bestEnergyTeam(
			members,
			problem,
			pinned.filter((id) => id !== inId && id !== partnerId),
			[...excluded, inId, partnerId],
			teamSlots - 1,
		);
		const others = rest.entries;
		const slotSize = Math.min(1, teamSlots - rest.slots);
		// Healers among the others heal for the share of the time they're on the team; a healer sharing the
		// slot heals for its time in the slot (approximated by the slot size).
		const othersHeal = weightedHealSources(
			others.map((o) => ({ member: byId.get(o.member.id) as EnergyMember, share: o.share })),
		);
		const resolve = (id: string) => {
			const m = byId.get(id) as EnergyMember;
			return resolveMembers([m], [...othersHeal, ...weightedHealSources([{ member: m, share: slotSize }])])[0];
		};
		const result = swapAnalysis(others, resolve(inId), resolve(partnerId), problem, slotSize);
		return result && { ...result, slotSize, rest };
	};
	if (chosenPartner !== null && partnerChoices.includes(chosenPartner)) {
		return { swapInId, partnerChoices, partnerId: chosenPartner, analysis: analyse(swapInId, chosenPartner) };
	}
	const benchTop = [...partnerChoices]
		.filter((id) => !best.ids.includes(id))
		.sort((a, b) => (withIt.get(b)?.energy.total ?? 0) - (withIt.get(a)?.energy.total ?? 0))
		.slice(0, 3);
	const candidates = [...best.ids.filter((id) => partnerChoices.includes(id)), ...benchTop];
	let pick: { partnerId: string; analysis: ReturnType<typeof analyse> } | undefined;
	for (const id of candidates) {
		const result = analyse(swapInId, id);
		if (!pick || (result?.best.energy.total ?? 0) > (pick.analysis?.best.energy.total ?? 0)) pick = { partnerId: id, analysis: result };
	}
	return { swapInId, partnerChoices, partnerId: pick?.partnerId, analysis: pick?.analysis };
}

export type SwapResult = ReturnType<typeof swapResult>;

/** What the energy tab works out from: the box as the numbers see it, settings, dish, pins and exclusions. */
export interface EnergyTabInput {
	box: BoxEntry[];
	options: YieldOptions;
	strength: StrengthOptions;
	recipe: Recipe;
	recipeLevel: number;
	dishMultiplier: number;
	pinned: string[];
	excluded: string[];
}

/** Identifies an input: the same key, the same results. */
export function energyTabKey(input: EnergyTabInput): string {
	const { box, options, strength, recipe } = input;
	return JSON.stringify([
		box,
		options.inventoryLimit,
		options.campTicket,
		options.energy,
		options.sleepScore,
		eventKey(options),
		strength.favorites,
		strength.fieldBonus,
		recipe.id,
		input.recipeLevel,
		input.dishMultiplier,
		input.pinned,
		input.excluded,
	]);
}

export interface EnergyTabResult {
	analysis: EnergyAnalysis;
	/** The swap card's default pair and rule (no Pokémon chosen). */
	swap: SwapResult;
}

/** Everything the energy tab shows by default, worked out from scratch (as the web workers do). */
export function computeEnergyTab(input: EnergyTabInput): EnergyTabResult {
	const members = energyMembers(input.box, energyYields(input.box, input.options, input.strength));
	const problem = energyProblem(input.recipe, input.recipeLevel, input.strength.fieldBonus, input.dishMultiplier);
	const analysis = analyzeEnergy(members, problem, input.pinned, input.excluded);
	return { analysis, swap: swapResult(members, problem, analysis, input.pinned, input.excluded, null, null) };
}

/**
 * A copy without functions (members' `at` and `withHelpers`), so it can be sent from a web worker; the page
 * only reads the data.
 */
export function plainEnergyTabResult(result: EnergyTabResult): EnergyTabResult {
	const strip = (value: unknown): unknown => {
		if (typeof value === "function") return undefined;
		if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, strip(v)]));
		if (Array.isArray(value)) return value.map(strip);
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value)
					.filter(([, v]) => typeof v !== "function")
					.map(([k, v]) => [k, strip(v)]),
			);
		}
		return value;
	};
	return strip(result) as EnergyTabResult;
}
