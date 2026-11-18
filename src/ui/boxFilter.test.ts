import type { BoxEntry } from "../core/box";
import { matchesFilter, noFilter, toggleChoice, unlockedIngredients } from "./boxFilter";

const e = (pokemonName: string, level: number, ingredient: BoxEntry["ingredient"]): BoxEntry => ({
	id: pokemonName,
	pokemonName,
	level,
	ingredient,
	nature: "Serious",
	subSkills: {},
});

test("toggleChoice: first click selects only it, more clicks add, a second click removes", () => {
	expect(toggleChoice([], "grass")).toEqual(["grass"]);
	expect(toggleChoice(["grass"], "fire")).toEqual(["grass", "fire"]);
	expect(toggleChoice(["grass", "fire"], "grass")).toEqual(["fire"]);
	expect(toggleChoice(["fire"], "fire")).toEqual([]);
});

test("only unlocked ingredients count", () => {
	// Bulbasaur: honey / tomato / potato at Lv1 / 30 / 60.
	expect(unlockedIngredients(e("Bulbasaur", 10, "ABC"))).toEqual(["honey"]);
	expect(unlockedIngredients(e("Bulbasaur", 30, "ABC"))).toEqual(["honey", "tomato"]);
	expect(unlockedIngredients(e("Bulbasaur", 60, "ABC"))).toEqual(["honey", "tomato", "potato"]);
});

test("matchesFilter: any selected type, and any selected ingredient unlocked (on the adjusted Pokémon)", () => {
	const bulba = e("Bulbasaur", 10, "ABC");
	expect(matchesFilter(bulba, bulba, noFilter)).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["grass"], ingredients: [] })).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["fire", "grass"], ingredients: [] })).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["fire"], ingredients: [] })).toBe(false);
	expect(matchesFilter(bulba, bulba, { types: [], ingredients: ["tomato"] })).toBe(false);
	expect(matchesFilter(bulba, bulba, { types: [], ingredients: ["tomato", "honey"] })).toBe(true);
	// Level scaling to 30 unlocks the tomato slot.
	expect(matchesFilter(bulba, { ...bulba, level: 30, scaledFrom: 10 }, { types: [], ingredients: ["tomato"] })).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["grass"], ingredients: ["tomato"] })).toBe(false);
});
