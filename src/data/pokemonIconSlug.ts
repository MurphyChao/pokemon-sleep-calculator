/**
 * File name (pokemondb.net slug) of a Pokémon's box icon in src/data/pokemon-icons/, from its
 * pokesleep-tool name. Shared by the UI and scripts/fetch-pokemon-icons.ts, so it imports nothing.
 *
 * Real forms have their own icon; Pokémon Sleep's event costumes (Halloween Pikachu, Holiday Eevee…)
 * don't exist in the main games, so they use the plain species' icon.
 */
const forms: Record<string, string> = {
	"Vulpix (Alola)": "vulpix-alolan",
	"Ninetales (Alola)": "ninetales-alolan",
	"Wooper (Paldea)": "wooper-paldean",
	"Toxtricity (Amped)": "toxtricity-amped",
	"Toxtricity (Low Key)": "toxtricity-low-key",
	"Pumpkaboo (Small)": "pumpkaboo-small",
	"Pumpkaboo (Medium)": "pumpkaboo-average",
	"Pumpkaboo (Large)": "pumpkaboo-large",
	"Pumpkaboo (Jumbo)": "pumpkaboo-super",
	"Gourgeist (Small)": "gourgeist-small",
	"Gourgeist (Medium)": "gourgeist-average",
	"Gourgeist (Large)": "gourgeist-large",
	"Gourgeist (Jumbo)": "gourgeist-super",
};

export function pokemonIconSlug(name: string): string {
	const form = forms[name];
	if (form) return form;
	return name
		.replace(/\s*\(.*\)$/, "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ.'’:]/g, "")
		.replace(/♀/g, "-f")
		.replace(/♂/g, "-m")
		.trim()
		.replace(/\s+/g, "-");
}
