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
}

export const defaultYieldOptions: YieldOptions = { inventoryLimit: true, campTicket: false };

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
	/** Strength per day from berries. */
	berryStrength: number;
	/** Strength per day from the main skill, excluding skills that give ingredients (those go into the dish). */
	skillStrength: number;
}

export const emptyYieldDetail: YieldDetail = { help: {}, skill: {}, total: {}, berryStrength: 0, skillStrength: 0 };

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

/**
 * Expected ingredients per day, using pokesleep-tool's model with its default
 * assumptions (100 sleep score, no teammate bonuses) plus the given options.
 */
export function dailyIngredientYieldDetail(
	entry: BoxEntry,
	options: YieldOptions = defaultYieldOptions,
	strength: StrengthOptions = defaultStrengthOptions,
): YieldDetail {
	const iv = toPokemonIv(entry);
	const favorites = strength.favorites;
	const param = createStrengthParameter({
		period: 24,
		isGoodCampTicketSet: options.campTicket,
		addHelpingBonusEffect: false,
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
		berryStrength: result.berryTotalStrength,
		skillStrength: isCookingSkill(iv.versatileSkill) ? 0 : result.skillStrength + result.skillStrength2,
	};
}

export function dailyIngredientYield(entry: BoxEntry, options: YieldOptions = defaultYieldOptions): IngredientYield {
	return dailyIngredientYieldDetail(entry, options).total;
}
