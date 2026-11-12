import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import en from "../vendor/pokesleep-tool/i18n/en/data.json";
import type { BoxEntry } from "../core/box";

const ingredientNames = (en as { ingredients: Record<string, string> }).ingredients;

export function ingredientLabel(name: IngredientName): string {
	return ingredientNames[name] ?? name;
}

export function entryLabel(entry: BoxEntry): string {
	return `${entry.pokemonName} Lv${entry.level} ${entry.ingredient}`;
}

export function formatAmount(n: number): string {
	return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export function formatPercent(r: number): string {
	return `${Math.round(r * 100)}%`;
}
