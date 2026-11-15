import { pokemonIconSlug } from "../data/pokemonIconSlug";

// Box icons from pokemondb.net (Scarlet/Violet; images © Nintendo/Game Freak), fetched by
// scripts/fetch-pokemon-icons.ts and served with the app.
const urls = import.meta.glob("../data/pokemon-icons/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;
const bySlug = new Map(Object.entries(urls).map(([path, url]) => [path.replace(/^.*\/|\.png$/g, ""), url]));

/** A Pokémon's box icon (blank if there is none). */
export function PokemonIcon(props: { name: string | undefined }) {
	const url = props.name ? bySlug.get(pokemonIconSlug(props.name)) : undefined;
	return url ? <img className="poke-icon" src={url} alt="" loading="lazy" decoding="async" /> : <span className="poke-icon" />;
}

/** First table cell of a Pokémon row. */
export function PokemonIconCell(props: { name: string | undefined }) {
	return (
		<td className="icon-cell">
			<PokemonIcon name={props.name} />
		</td>
	);
}
