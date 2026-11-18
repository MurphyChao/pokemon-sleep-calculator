import type { RgbaImage } from "./image";
import { iconDistance, iconSize, matchPokemonIcon, maxMatchDistance } from "./pokemonIcon";

/** A normalized icon: cream background with a coloured square in the middle, optionally shifted. */
function icon(color: [number, number, number], shift = 0): RgbaImage {
	const data = new Uint8ClampedArray(iconSize * iconSize * 4);
	for (let y = 0; y < iconSize; y++) {
		for (let x = 0; x < iconSize; x++) {
			const inside = Math.abs(x - 24 - shift) < 12 && Math.abs(y - 24) < 12;
			const c = inside ? color : [250, 250, 230];
			data.set([...c, 255], (y * iconSize + x) * 4);
		}
	}
	return { width: iconSize, height: iconSize, data };
}

const blue = icon([60, 120, 230]);
const orange = icon([240, 130, 40]);

test("iconDistance: 0 for the same icon, small for a slightly shifted one, large for another", () => {
	expect(iconDistance(blue, blue)).toBe(0);
	expect(iconDistance(blue, icon([60, 120, 230], 2))).toBe(0); // within the allowed shift
	expect(iconDistance(blue, orange)).toBeGreaterThan(0.1);
});

test("matchPokemonIcon: a close reference wins; nothing close, or two Pokémon too close to call, gives no match", () => {
	const refs = [
		{ pokemonName: "Shinx", icon: blue },
		{ pokemonName: "Trapinch", icon: orange },
	];
	expect(matchPokemonIcon(blue, refs)?.pokemonName).toBe("Shinx");
	expect(matchPokemonIcon(icon([20, 200, 20]), refs)).toBeUndefined();
	const lookalikes = [
		{ pokemonName: "Shinx", icon: blue },
		{ pokemonName: "Luxio", icon: icon([62, 122, 232]) },
	];
	expect(matchPokemonIcon(blue, lookalikes)).toBeUndefined();
	// Several references of one Pokémon count as one.
	expect(matchPokemonIcon(blue, [...refs, { pokemonName: "Shinx", icon: icon([62, 122, 232]) }])?.pokemonName).toBe("Shinx");
	expect(maxMatchDistance).toBeGreaterThan(0);
});
