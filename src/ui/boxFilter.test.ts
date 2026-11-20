import type { BoxEntry } from "../core/box";
import { jobsOf, matchesFilter, noFilter, toggleChoice, unlockedIngredients } from "./boxFilter";

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
	expect(matchesFilter(bulba, bulba, { types: ["grass"], ingredients: [], jobs: [] })).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["fire", "grass"], ingredients: [], jobs: [] })).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["fire"], ingredients: [], jobs: [] })).toBe(false);
	expect(matchesFilter(bulba, bulba, { types: [], ingredients: ["tomato"], jobs: [] })).toBe(false);
	expect(matchesFilter(bulba, bulba, { types: [], ingredients: ["tomato", "honey"], jobs: [] })).toBe(true);
	// Level scaling to 30 unlocks the tomato slot.
	expect(matchesFilter(bulba, { ...bulba, level: 30, scaledFrom: 10 }, { types: [], ingredients: ["tomato"], jobs: [] })).toBe(true);
	expect(matchesFilter(bulba, bulba, { types: ["grass"], ingredients: ["tomato"], jobs: [] })).toBe(false);
});

test("the job filter: by what a Pokémon is kept for, hybrids counting as both ingredient and skill Pokémon", () => {
	expect(jobsOf("strength")).toEqual(["strength"]);
	expect(jobsOf("hybrid")).toEqual(["ingredients", "skill"]);
	expect(jobsOf(undefined)).toEqual([]);
	const any = e("Blissey", 60, "AAA");
	const only = (...selected: ("strength" | "ingredients" | "skill")[]) => ({ ...noFilter, jobs: selected });
	expect(matchesFilter(any, any, only("skill"), "hybrid")).toBe(true);
	expect(matchesFilter(any, any, only("ingredients"), "hybrid")).toBe(true);
	expect(matchesFilter(any, any, only("strength"), "hybrid")).toBe(false);
	expect(matchesFilter(any, any, only("strength", "skill"), "support")).toBe(true);
	// Not worked out (yet): only shown when nothing is selected.
	expect(matchesFilter(any, any, only("skill"), undefined)).toBe(false);
	expect(matchesFilter(any, any, noFilter, undefined)).toBe(true);
});
