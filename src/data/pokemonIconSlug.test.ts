import { existsSync } from "node:fs";
import { join } from "node:path";
import pokemon from "../vendor/pokesleep-tool/data/pokemon.json";
import { pokemonIconSlug } from "./pokemonIconSlug";

describe("pokemonIconSlug", () => {
	it("maps names, forms and costumes to pokemondb slugs", () => {
		expect(pokemonIconSlug("Mr. Mime")).toBe("mr-mime");
		expect(pokemonIconSlug("Farfetch'd")).toBe("farfetchd");
		expect(pokemonIconSlug("Vulpix (Alola)")).toBe("vulpix-alolan");
		expect(pokemonIconSlug("Pumpkaboo (Jumbo)")).toBe("pumpkaboo-super");
		expect(pokemonIconSlug("Pikachu (Halloween)")).toBe("pikachu");
		expect(pokemonIconSlug("Pikachu (Low Key)")).toBe("pikachu");
	});

	it("has an icon for every Pokémon in the data (run npm run fetch-pokemon-icons after syncing upstream)", () => {
		const missing = (pokemon as { name: string }[])
			.map((p) => pokemonIconSlug(p.name))
			.filter((slug) => !existsSync(join(__dirname, "pokemon-icons", `${slug}.png`)));
		expect(missing).toEqual([]);
	});
});
