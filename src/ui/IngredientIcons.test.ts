import type { BoxEntry } from "../core/box";
import { slotIngredients } from "./IngredientIcons";

const venusaur = (level: number, ingredient: BoxEntry["ingredient"]): BoxEntry => ({
	id: "v",
	pokemonName: "Venusaur",
	level,
	ingredient,
	nature: "Serious",
	subSkills: {},
});

describe("slotIngredients", () => {
	it("maps the combination letters to the slot ingredients and counts", () => {
		expect(slotIngredients(venusaur(60, "ABC"))).toEqual([
			{ name: "honey", count: 2, unlocked: true },
			{ name: "tomato", count: 4, unlocked: true },
			{ name: "potato", count: 6, unlocked: true },
		]);
		expect(slotIngredients(venusaur(60, "AAA")).map((s) => [s.name, s.count])).toEqual([
			["honey", 2],
			["honey", 5],
			["honey", 7],
		]);
	});

	it("marks slots the Pokémon hasn't reached yet", () => {
		expect(slotIngredients(venusaur(29, "AAB")).map((s) => s.unlocked)).toEqual([true, false, false]);
		expect(slotIngredients(venusaur(30, "AAB")).map((s) => s.unlocked)).toEqual([true, true, false]);
	});
});
