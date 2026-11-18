/**
 * File names of the reference icons in src/data/sleep-icons: the Pokémon's name in lower case with
 * anything but letters and digits as "-", e.g. "pumpkaboo-small". More icons of the same Pokémon (shiny,
 * costumes) get "--2", "--3"… appended.
 */
export function sleepIconSlug(pokemonName: string): string {
	return pokemonName
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** The slug part of a reference icon's file name ("pumpkaboo-small--2.png" → "pumpkaboo-small"). */
export function slugOfIconFile(fileName: string): string {
	return fileName.replace(/^.*\//, "").replace(/\.png$/, "").replace(/--\d+$/, "");
}
