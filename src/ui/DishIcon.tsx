import { recipes } from "../core/recipes";
import { recipeLabel } from "./i18n";

/** Dish pictures, 96 px, from SleepAPI (see scripts/fetch-dish-art.ts), keyed by recipe id. */
const artUrls = import.meta.glob("../data/dish-art/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;
const artById = new Map(Object.entries(artUrls).map(([path, url]) => [path.replace(/^.*\/|\.png$/g, ""), url]));
const recipeById = new Map(recipes.map((r) => [r.id, r]));

/**
 * A dish's picture. `decorative`: the dish's name is written next to it, so no alt text or tooltip;
 * otherwise named in both. Nothing is shown for a recipe without a picture.
 */
export default function DishIcon(props: { recipeId: string | undefined; className?: string; decorative?: boolean }) {
	const url = props.recipeId ? artById.get(props.recipeId) : undefined;
	if (!url) return null;
	const recipe = props.recipeId ? recipeById.get(props.recipeId) : undefined;
	const label = props.decorative || !recipe ? "" : recipeLabel(recipe);
	return (
		<img
			src={url}
			alt={label}
			title={label || undefined}
			className={["dish-icon", props.className].filter(Boolean).join(" ")}
			loading="lazy"
			decoding="async"
		/>
	);
}
