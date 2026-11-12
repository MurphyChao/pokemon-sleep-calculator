import { type IngredientName, IngredientNames } from "../vendor/pokesleep-tool/data/pokemons";
import { getIngredientDrawIngredients } from "../vendor/pokesleep-tool/util/MainSkill";
import type PokemonIv from "../vendor/pokesleep-tool/util/PokemonIv";
import PokemonStrength, { type StrengthResult } from "../vendor/pokesleep-tool/util/PokemonStrength";
import { AlwaysTap } from "../vendor/pokesleep-tool/util/Energy";
import { createStrengthParameter } from "../vendor/pokesleep-tool/util/StrengthParameter";
import { type BoxEntry, toPokemonIv } from "./box";

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

export interface YieldDetail {
	/** Ingredients from regular helps. */
	help: IngredientYield;
	/** Expected ingredients from the main skill. */
	skill: IngredientYield;
	/** help + skill */
	total: IngredientYield;
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
 * Expected ingredients per day, using pokesleep-tool's model with its default
 * assumptions (100 sleep score, no teammate bonuses) plus the given options.
 */
export function dailyIngredientYieldDetail(entry: BoxEntry, options: YieldOptions = defaultYieldOptions): YieldDetail {
	const iv = toPokemonIv(entry);
	const param = createStrengthParameter({
		period: 24,
		isGoodCampTicketSet: options.campTicket,
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
	return { help, skill, total };
}

export function dailyIngredientYield(entry: BoxEntry, options: YieldOptions = defaultYieldOptions): IngredientYield {
	return dailyIngredientYieldDetail(entry, options).total;
}
