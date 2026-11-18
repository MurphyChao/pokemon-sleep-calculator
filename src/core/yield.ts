import { type IngredientName, IngredientNames } from "../vendor/pokesleep-tool/data/pokemons";
import { getIngredientDrawIngredients } from "../vendor/pokesleep-tool/util/MainSkill";
import type PokemonIv from "../vendor/pokesleep-tool/util/PokemonIv";
import PokemonStrength, { type StrengthResult } from "../vendor/pokesleep-tool/util/PokemonStrength";
import { AlwaysTap } from "../vendor/pokesleep-tool/util/Energy";
import {
	allFavoriteFieldIndex,
	createStrengthParameter,
	noFavoriteFieldIndex,
} from "../vendor/pokesleep-tool/util/StrengthParameter";
import type { PokemonType } from "../vendor/pokesleep-tool/data/pokemons";
import { type BoxEntry, toPokemonIv } from "./box";
import type { TastySource } from "./tasty";

export type IngredientYield = Partial<Record<IngredientName, number>>;

export interface YieldOptions {
	/**
	 * true: the bag can fill up (collected every 3 hours while awake, not while asleep).
	 * false: ingredients are collected continuously, so the bag never fills.
	 */
	inventoryLimit: boolean;
	/** Good Camp Ticket: help speed ×1.2 and inventory ×1.2. */
	campTicket: boolean;
	/**
	 * "full": energy stays at 100 all day (fastest helping).
	 * "simulated": energy drains while awake and is restored by sleep (100 sleep score) and by healers.
	 */
	energy: "full" | "simulated";
	/**
	 * Sleep score 0–100: 100 = 8.5 hours of sleep. Asleep, the bag isn't emptied and energy recovers
	 * (more with a higher score). 0 = no sleep: every hour counts as awake, with no overnight recovery.
	 */
	sleepScore: number;
}

export const defaultYieldOptions: YieldOptions = { inventoryLimit: true, campTicket: false, energy: "full", sleepScore: 0 };

/** A main skill that restores energy, per trigger. */
export interface HealSource {
	/** Expected energy every team member (including this one) gets per trigger. */
	team: number;
	/** Extra energy only this Pokémon gets per trigger. */
	self: number;
	triggersPerDay: number;
}

/** Energy restored during the day, in pokesleep-tool's terms: `count` evenly spaced restores of `energy` each. */
export interface Heal {
	count: number;
	energy: number;
}

/**
 * Healing a Pokémon receives from the team's healers (`team`, which may include itself) plus its own
 * self-healing skill. Spread over a whole number of evenly spaced restores, as pokesleep-tool models it.
 */
export function healFor(team: HealSource[], own?: HealSource): Heal | undefined {
	let triggers = 0;
	let energy = 0;
	for (const h of team) {
		if (h.team <= 0) continue;
		triggers += h.triggersPerDay;
		energy += h.triggersPerDay * h.team;
	}
	if (own && own.self > 0) {
		triggers += own.triggersPerDay;
		energy += own.triggersPerDay * own.self;
	}
	if (energy <= 0) return undefined;
	const count = Math.max(1, Math.round(triggers));
	return { count, energy: energy / count };
}

/** Settings that change strength (energy) but not ingredient yields. */
export interface StrengthOptions {
	/** Favorite berries (worth ×2): none, all, or three berry types. */
	favorites: "none" | "all" | PokemonType[];
	/** Island bonus in percent; multiplies berries, dishes and strength skills. */
	fieldBonus: number;
}

export const defaultStrengthOptions: StrengthOptions = { favorites: "none", fieldBonus: 0 };

export interface YieldDetail {
	/** Ingredients from regular helps. */
	help: IngredientYield;
	/** Expected ingredients from the main skill. */
	skill: IngredientYield;
	/** help + skill */
	total: IngredientYield;
	/** Set if the main skill raises the Extra Tasty chance. */
	tasty?: TastySource;
	/** Set if the main skill restores energy. */
	heal?: HealSource;
	/** Strength per day from berries. */
	berryStrength: number;
	/** Strength per day from the main skill, excluding skills that give ingredients (those go into the dish). */
	skillStrength: number;
	/** Main skill triggers per day. */
	skillsPerDay: number;
	/**
	 * What the main skill gives per day in its own unit (energy restored, Extra Tasty chance, dream shards,
	 * strength…), as pokesleep-tool computes it.
	 */
	skillValue: number;
	/** Set if the Pokémon has an unlocked Helping Bonus subskill (teammates help 5% faster). */
	helpingBonus?: boolean;
}

export const emptyYieldDetail: YieldDetail = { help: {}, skill: {}, total: {}, berryStrength: 0, skillStrength: 0, skillsPerDay: 0, skillValue: 0 };

/** Skills whose strength comes from ingredients or the pot; their value is counted through the dish instead. */
function isCookingSkill(skill: string): boolean {
	return skill.startsWith("Ingredient Magnet") || skill.startsWith("Ingredient Draw") || skill.startsWith("Cooking ");
}

/** Ingredients that Ingredient Magnet S can give (all known ingredients, as in pokesleep-tool). */
const magnetPool = IngredientNames.filter((name) => !name.startsWith("unknown"));

function addSpread(out: IngredientYield, pool: IngredientName[], amount: number) {
	if (amount <= 0 || pool.length === 0) return;
	for (const name of pool) {
		out[name] = (out[name] ?? 0) + amount / pool.length;
	}
}

/**
 * Splits the main skill's expected ingredient output (as computed by pokesleep-tool) by ingredient.
 * Random ingredients are assumed to be evenly distributed over the skill's pool.
 * Skills that copy other skills (Metronome, Skill Copy) are not counted.
 */
function skillIngredients(iv: PokemonIv, result: StrengthResult): IngredientYield {
	const out: IngredientYield = {};
	switch (iv.versatileSkill) {
		case "Ingredient Magnet S":
		case "Ingredient Magnet S (Present)":
		case "Cooking Assist S (Bulk Up)":
			addSpread(out, magnetPool, result.skillValue);
			break;
		case "Ingredient Magnet S (Plus)":
			addSpread(out, magnetPool, result.skillValue);
			addSpread(out, [iv.pokemon.ing1.name], result.skillValue2);
			break;
		case "Ingredient Draw S":
		case "Ingredient Draw S (Super Luck)":
		case "Ingredient Draw S (Hyper Cutter)":
			addSpread(out, getIngredientDrawIngredients(iv.pokemon), result.skillValue);
			break;
	}
	return out;
}

/**
 * Extra Tasty chance from the main skill. Tasty Chance S's per-trigger value is its main value;
 * Bulk Up and Mystical Fire raise it as their secondary effect.
 */
function tastySource(iv: PokemonIv, result: StrengthResult): TastySource | undefined {
	switch (iv.versatileSkill) {
		case "Tasty Chance S":
			return { perTrigger: result.skillValuePerTrigger, triggersPerDay: result.skillCount };
		case "Cooking Assist S (Bulk Up)":
		case "Cooking Advance S (Mystical Fire)":
			return { perTrigger: result.skillValuePerTrigger2, triggersPerDay: result.skillCount };
	}
	return undefined;
}

/** Energy restored by the main skill. Energizing Cheer heals one random member, so 1/5 each on average. */
function healSource(iv: PokemonIv, result: StrengthResult): HealSource | undefined {
	const triggersPerDay = result.skillCount;
	const value = result.skillValuePerTrigger;
	const skill = iv.versatileSkill;
	if (skill.startsWith("Energy for Everyone S")) return { team: value, self: 0, triggersPerDay };
	if (skill.startsWith("Energizing Cheer S")) return { team: value / 5, self: 0, triggersPerDay };
	if (skill.startsWith("Charge Energy S")) {
		// pokesleep-tool's value already includes this Pokémon's nature; restores apply it again.
		return { team: 0, self: value / iv.nature.energyRecoveryFactor, triggersPerDay };
	}
	return undefined;
}

/**
 * Expected ingredients and strength per day, using pokesleep-tool's model plus the given options.
 * `heal` is the energy restored by healers during the day; it only matters with simulated energy.
 * `helpers` is how many teammates (0–4, whole numbers) have Helping Bonus; the Pokémon's own Helping
 * Bonus is always counted. See {@link withHelpers} for shares of the time.
 */
export function dailyIngredientYieldDetail(
	entry: BoxEntry,
	options: YieldOptions = defaultYieldOptions,
	strength: StrengthOptions = defaultStrengthOptions,
	heal?: Heal,
	helpers = 0,
): YieldDetail {
	const iv = toPokemonIv(entry);
	const favorites = strength.favorites;
	const param = createStrengthParameter({
		period: 24,
		isGoodCampTicketSet: options.campTicket,
		isEnergyAlwaysFull: options.energy !== "simulated",
		sleepScore: Math.min(100, Math.max(0, options.sleepScore ?? defaultYieldOptions.sleepScore)),
		e4eCount: heal?.count ?? 0,
		e4eEnergy: heal?.energy ?? 0,
		addHelpingBonusEffect: false,
		helpBonusCount: Math.min(maxHelpers, Math.max(0, Math.round(helpers))) as 0 | 1 | 2 | 3 | 4,
		fieldBonus: strength.fieldBonus,
		// Field 0 (Greengrass Isle) lets the favorite berries be chosen freely.
		fieldIndex: favorites === "none" ? noFavoriteFieldIndex : favorites === "all" ? allFavoriteFieldIndex : 0,
		...(Array.isArray(favorites) && { favoriteType: favorites }),
		...(!options.inventoryLimit && { tapFrequencyAwake: AlwaysTap, tapFrequencyAsleep: AlwaysTap }),
	});
	const result = new PokemonStrength(iv, param).calculate();
	const help: IngredientYield = {};
	for (const ing of result.ingredients) {
		if (ing.count > 0) {
			help[ing.name] = (help[ing.name] ?? 0) + ing.count;
		}
	}
	const skill = skillIngredients(iv, result);
	const total: IngredientYield = { ...help };
	for (const [name, n] of Object.entries(skill) as [IngredientName, number][]) {
		total[name] = (total[name] ?? 0) + n;
	}
	return {
		help,
		skill,
		total,
		tasty: tastySource(iv, result),
		heal: healSource(iv, result),
		berryStrength: result.berryTotalStrength,
		skillStrength: isCookingSkill(iv.versatileSkill) ? 0 : result.skillStrength + result.skillStrength2,
		skillsPerDay: result.skillCount,
		skillValue: result.skillValue,
		...(iv.hasHelpingBonusInActiveSubSkills && { helpingBonus: true }),
	};
}

/**
 * Yields of a Pokémon on its own: with simulated energy, healed only by its own skill.
 * Healers' trigger counts are taken without healing, which slightly undercounts them.
 */
export function soloYieldDetail(
	entry: BoxEntry,
	options: YieldOptions = defaultYieldOptions,
	strength: StrengthOptions = defaultStrengthOptions,
	helpers = 0,
): YieldDetail {
	const d = dailyIngredientYieldDetail(entry, options, strength, undefined, helpers);
	if (options.energy !== "simulated" || !d.heal) return d;
	const heal = healFor([d.heal], d.heal);
	return heal ? { ...dailyIngredientYieldDetail(entry, options, strength, heal, helpers), heal: d.heal } : d;
}

/** Most teammates with Helping Bonus a Pokémon can have. */
export const maxHelpers = 4;

/** Helping Bonus helps each teammate 5% faster: 1/0.95 − 1 ≈ 5.3% more helps (before the 35% speed cap). */
export const helpingBonusRate = 1 / 0.95 - 1;

function lerpYield(a: IngredientYield, b: IngredientYield, t: number): IngredientYield {
	const out: IngredientYield = {};
	for (const name of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<IngredientName>) {
		out[name] = (a[name] ?? 0) * (1 - t) + (b[name] ?? 0) * t;
	}
	return out;
}

function lerpTriggers<T extends { triggersPerDay: number }>(a: T | undefined, b: T | undefined, t: number): T | undefined {
	return a && b ? { ...a, triggersPerDay: a.triggersPerDay * (1 - t) + b.triggersPerDay * t } : a;
}

/**
 * A Pokémon's output with `helpers` teammates' worth of Helping Bonus (0–4, possibly fractional when
 * those teammates are on the team only part of the time): interpolated between the whole numbers either
 * side, as the time-average of having one more or one fewer. `at(k)` gives the output for k helpers.
 */
export function withHelpers(at: (helpers: number) => YieldDetail, helpers: number): YieldDetail {
	const h = Math.min(maxHelpers, Math.max(0, helpers));
	const lo = Math.floor(h + 1e-9);
	const t = h - lo;
	const a = at(lo);
	if (t < 1e-9) return a;
	const b = at(Math.min(maxHelpers, lo + 1));
	const mix = (x: number, y: number) => x * (1 - t) + y * t;
	return {
		...a,
		help: lerpYield(a.help, b.help, t),
		skill: lerpYield(a.skill, b.skill, t),
		total: lerpYield(a.total, b.total, t),
		berryStrength: mix(a.berryStrength, b.berryStrength),
		skillStrength: mix(a.skillStrength, b.skillStrength),
		skillsPerDay: mix(a.skillsPerDay, b.skillsPerDay),
		skillValue: mix(a.skillValue, b.skillValue),
		...(a.tasty && { tasty: lerpTriggers(a.tasty, b.tasty, t) }),
		...(a.heal && { heal: lerpTriggers(a.heal, b.heal, t) }),
	};
}

export function dailyIngredientYield(entry: BoxEntry, options: YieldOptions = defaultYieldOptions): IngredientYield {
	return dailyIngredientYieldDetail(entry, options).total;
}
