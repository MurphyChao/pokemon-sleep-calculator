import type { PokemonType } from "../vendor/pokesleep-tool/data/pokemons";
import { typeLabel } from "./i18n";

const iconUrls = import.meta.glob("../data/type-icons/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;
const iconByType = new Map(Object.entries(iconUrls).map(([path, url]) => [path.replace(/^.*\/|\.png$/g, ""), url]));

/**
 * A Pokémon type's icon (cut from the game's box filter screen), named in its alt text; the name itself if
 * there's no icon.
 * @param decorative the name is given elsewhere (e.g. the button's label): no alt text.
 */
export function TypeIcon(props: { type: PokemonType; className?: string; decorative?: boolean }) {
	const url = iconByType.get(props.type);
	const label = typeLabel(props.type);
	const className = ["type-icon", props.className].filter(Boolean).join(" ");
	if (!url) return <span className={className}>{label}</span>;
	return <img src={url} alt={props.decorative ? "" : label} className={className} />;
}
