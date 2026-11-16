import type { BoxEntry } from "../core/box";
import pokemons, { type IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { ingredientLabel } from "./i18n";

const byName = new Map(pokemons.map((p) => [p.name, p]));
const iconUrls = import.meta.glob("../data/ingredient-icons/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;
const iconByName = new Map(Object.entries(iconUrls).map(([path, url]) => [path.replace(/^.*\/|\.png$/g, ""), url]));

/**
 * An ingredient's icon, named in its tooltip and alt text (the name itself if there's no icon).
 */
export function IngredientIcon(props: {
	name: IngredientName;
	className?: string;
	/** The name is already written next to the icon: no tooltip or alt text, and nothing without an icon. */
	decorative?: boolean;
}) {
	const url = iconByName.get(props.name);
	const label = ingredientLabel(props.name);
	const className = ["ing-icon", props.className].filter(Boolean).join(" ");
	if (props.decorative) return url ? <img src={url} alt="" className={className} /> : null;
	return url ? (
		<img src={url} alt={label} title={label} className={className} />
	) : (
		<span className={className}>{label}</span>
	);
}

/** Level at which each ingredient slot unlocks. */
const unlockLevels = [1, 30, 60];

export interface SlotIngredient {
	name: IngredientName;
	count: number;
	unlocked: boolean;
}

/** The ingredient in each of the entry's three slots (from its "ABC"-style combination). */
export function slotIngredients(entry: BoxEntry): SlotIngredient[] {
	const pokemon = byName.get(entry.pokemonName);
	if (!pokemon) return [];
	return [...entry.ingredient].flatMap((letter, slot) => {
		const ing = letter === "A" ? pokemon.ing1 : letter === "B" ? pokemon.ing2 : pokemon.ing3;
		if (!ing) return [];
		const count = (ing as unknown as Record<string, number | undefined>)[`c${slot + 1}`] ?? 0;
		return [{ name: ing.name, count, unlocked: entry.level >= unlockLevels[slot] }];
	});
}

/**
 * Small icons of the entry's Lv1/Lv30/Lv60 ingredients, in place of letters like "AAB". Slots the
 * Pokémon hasn't reached yet are faded, as in the game.
 */
export function IngredientIcons(props: { entry: BoxEntry }) {
	const slots = slotIngredients(props.entry);
	const title = slots.map((s, i) => `Lv${unlockLevels[i]} ${ingredientLabel(s.name)} ×${s.count}`).join(" · ");
	return (
		<span className="ing-icons" title={title}>
			{slots.map((s, i) => (
				<IngredientIcon key={i} name={s.name} className={s.unlocked ? undefined : "locked"} />
			))}
		</span>
	);
}
