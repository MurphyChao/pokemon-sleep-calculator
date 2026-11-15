import { type BoxEntry, evolveToFinal, scaleLevels } from "./box";

const e = (pokemonName: string, extra: Partial<BoxEntry> = {}): BoxEntry => ({
	id: pokemonName,
	pokemonName,
	level: 30,
	ingredient: "AAA",
	nature: "Serious",
	subSkills: {},
	...extra,
});

describe("evolveToFinal", () => {
	it("evolves to the final form, raising the skill level once per evolution", () => {
		const [venusaur] = evolveToFinal([e("Bulbasaur", { skillLevel: 2 })], true);
		expect(venusaur).toMatchObject({ pokemonName: "Venusaur", skillLevel: 4, evolvedFrom: "Bulbasaur" });
		expect(evolveToFinal([e("Ivysaur", { skillLevel: 2 })], true)[0]).toMatchObject({ pokemonName: "Venusaur", skillLevel: 3 });
	});

	it("leaves final forms, Pokémon that don't evolve and the box itself alone", () => {
		const box = [e("Venusaur"), e("Darkrai")];
		expect(evolveToFinal(box, true)).toEqual(box);
		const unevolved = [e("Bulbasaur")];
		expect(evolveToFinal(unevolved, false)).toBe(unevolved);
	});

	it("caps the skill level at the evolved skill's maximum", () => {
		const [evolved] = evolveToFinal([e("Bulbasaur", { skillLevel: 99 })], true);
		expect(evolved.skillLevel).toBeLessThan(99);
	});

	it("evolves Toxel by nature but leaves branching lines alone", () => {
		expect(evolveToFinal([e("Toxel", { nature: "Hardy" })], true)[0].pokemonName).toBe("Toxtricity (Amped)");
		expect(evolveToFinal([e("Toxel", { nature: "Calm" })], true)[0].pokemonName).toBe("Toxtricity (Low Key)");
		const branching = [e("Eevee"), e("Ralts"), e("Kirlia")];
		expect(evolveToFinal(branching, true)).toEqual(branching);
	});

	it("combines with level scaling", () => {
		const [x] = scaleLevels(evolveToFinal([e("Bulbasaur", { level: 10 })], true), 50);
		expect(x).toMatchObject({ pokemonName: "Venusaur", level: 50, scaledFrom: 10, evolvedFrom: "Bulbasaur" });
	});
});
