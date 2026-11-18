import pokemons, { type IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import type { IngredientType } from "../vendor/pokesleep-tool/util/PokemonIv";

/**
 * The ingredient combination of `pokemonName` that has the recognized Lv30 and Lv60 ingredients (Lv1 is
 * always A), or undefined if it can't have them. Used to fill in the combination once the Pokémon is picked
 * in the review form.
 */
export function comboFromIcons(
	pokemonName: string,
	icons: { lv30?: IngredientName; lv60?: IngredientName } | undefined,
): IngredientType | undefined {
	const p = pokemons.find((x) => x.name === pokemonName);
	if (!p || !icons?.lv30 || !icons.lv60) return undefined;
	const slots = [p.ing1?.name, p.ing2?.name, p.ing3?.name];
	const lv30 = slots.slice(0, 2).indexOf(icons.lv30);
	const lv60 = slots.indexOf(icons.lv60);
	if (lv30 < 0 || lv60 < 0) return undefined;
	return `A${"ABC"[lv30]}${"ABC"[lv60]}` as IngredientType;
}
