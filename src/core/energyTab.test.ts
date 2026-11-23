import { expect, test } from "vitest";
import type { BoxEntry } from "./box";
import {
	analyzeEnergy,
	computeEnergyTab,
	energyMembers,
	energyProblem,
	energyTabKey,
	energyYields,
	plainEnergyTabResult,
	swapResult,
} from "./energyTab";
import { recipes } from "./recipes";
import { defaultStrengthOptions, defaultYieldOptions } from "./yield";

const e = (id: string, pokemonName: string, extra: Partial<BoxEntry> = {}): BoxEntry => ({
	id,
	pokemonName,
	level: 50,
	skillLevel: 3,
	ingredient: "ABB",
	nature: "Serious",
	subSkills: {},
	...extra,
});
const box = [
	e("a", "Sandslash", { ingredient: "ABC" }),
	e("b", "Crustle"),
	e("c", "Dedenne"),
	e("d", "Sceptile"),
	e("f", "Gardevoir"),
	e("g", "Meowscarada"),
	e("h", "Chansey", { subSkills: { lv10: "Helping Bonus" } }),
];

test("the background (worker) result is the page's, without functions, and can be sent between threads", () => {
	for (const options of [defaultYieldOptions, { ...defaultYieldOptions, energy: "simulated" as const, sleepScore: 90 }]) {
		const recipe = recipes[3];
		const input = { box, options, strength: defaultStrengthOptions, recipe, recipeLevel: 30, dishMultiplier: 1, pinned: [], excluded: [] };
		const worker = plainEnergyTabResult(computeEnergyTab(input));
		// As the page works it out.
		const members = energyMembers(box, energyYields(box, options, defaultStrengthOptions));
		const problem = energyProblem(recipe, 30, 0, 1);
		const page = analyzeEnergy(members, problem, [], []);
		expect(worker.analysis.best.energy.total).toBeCloseTo(page.best.energy.total, 9);
		expect(worker.analysis.best.ids).toEqual(page.best.ids);
		expect(worker.analysis.bench).toEqual(page.bench);
		expect([...worker.analysis.withIt.keys()]).toEqual([...page.withIt.keys()]);
		expect(worker.swap?.partnerId).toBe(swapResult(members, problem, page, [], [], null, null)?.partnerId);
		// No functions left; structured clone (postMessage) accepts it.
		expect(JSON.stringify(worker).includes("withHelpers")).toBe(false);
		expect(() => structuredClone(worker)).not.toThrow();
		expect(worker.analysis.best.entries.every((x) => x.member.withHelpers === undefined)).toBe(true);
	}
});

test("the cache key changes with anything that changes the results", () => {
	const input = { box, options: defaultYieldOptions, strength: defaultStrengthOptions, recipe: recipes[3], recipeLevel: 30, dishMultiplier: 1, pinned: [], excluded: [] };
	const key = energyTabKey(input);
	expect(energyTabKey({ ...input })).toBe(key);
	for (const changed of [
		{ ...input, recipeLevel: 31 },
		{ ...input, recipe: recipes[4] },
		{ ...input, pinned: ["a"] },
		{ ...input, excluded: ["b"] },
		{ ...input, dishMultiplier: 1.5 },
		{ ...input, options: { ...defaultYieldOptions, campTicket: true } },
		{ ...input, options: { ...defaultYieldOptions, eventBonus: "custom" as const, customEvent: { target: {}, effects: { dish: 1.25 as const } } } },
		{ ...input, strength: { ...defaultStrengthOptions, fieldBonus: 10 } },
		{ ...input, box: [...box.slice(1)] },
		{ ...input, box: [{ ...box[0], level: 60 }, ...box.slice(1)] },
	]) {
		expect(energyTabKey(changed)).not.toBe(key);
	}
});
