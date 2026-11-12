import type { BoxEntry } from "./box";
import { dailyIngredientYield, dailyIngredientYieldDetail } from "./yield";

const entry = (pokemonName: string, level: number, ingredient: BoxEntry["ingredient"]): BoxEntry => ({
	id: pokemonName,
	pokemonName,
	level,
	ingredient,
	nature: "Serious",
	subSkills: {},
});

describe("dailyIngredientYield", () => {
	test("Sandslash ABC gathers all three of its ingredients at Lv60", () => {
		const y = dailyIngredientYield(entry("Sandslash", 60, "ABC"));
		expect(Object.keys(y).sort()).toEqual(["corn", "potato", "pumpkin"]);
	});

	test("locked slots yield nothing: Sandslash ABC at Lv29 only gathers pumpkin from helps", () => {
		const d = dailyIngredientYieldDetail(entry("Sandslash", 29, "ABC"));
		expect(Object.keys(d.help)).toEqual(["pumpkin"]);
	});

	test("an ingredient specialist out-gathers a skill specialist", () => {
		const sandslash = dailyIngredientYield(entry("Sandslash", 60, "AAA"));
		const gourgeist = dailyIngredientYield(entry("Gourgeist (Large)", 60, "AAA"));
		expect(gourgeist.pumpkin ?? 0).toBeGreaterThan(sandslash.pumpkin ?? 0);
	});
});

describe("main skill ingredients", () => {
	test("Sandslash's Ingredient Draw S adds potato, corn and pumpkin evenly", () => {
		const d = dailyIngredientYieldDetail({ ...entry("Sandslash", 60, "ABC"), skillLevel: 6 });
		expect(Object.keys(d.skill).sort()).toEqual(["corn", "potato", "pumpkin"]);
		expect(d.skill.corn).toBeGreaterThan(0);
		expect(d.skill.corn).toBeCloseTo(d.skill.potato ?? 0);
		expect(d.total.pumpkin).toBeCloseTo((d.help.pumpkin ?? 0) + (d.skill.pumpkin ?? 0));
	});

	test("higher skill level yields more skill ingredients", () => {
		const lo = dailyIngredientYieldDetail({ ...entry("Sandslash", 60, "ABC"), skillLevel: 1 });
		const hi = dailyIngredientYieldDetail({ ...entry("Sandslash", 60, "ABC"), skillLevel: 6 });
		expect(hi.skill.corn ?? 0).toBeGreaterThan(lo.skill.corn ?? 0);
	});

	test("Ingredient Magnet S spreads over every known ingredient", () => {
		const d = dailyIngredientYieldDetail(entry("Vaporeon", 60, "AAA"));
		expect(Object.keys(d.skill)).toHaveLength(20);
		expect(Object.keys(d.skill).some((k) => k.startsWith("unknown"))).toBe(false);
	});

	test("ingredient specialist without an ingredient skill gets nothing from it", () => {
		expect(dailyIngredientYieldDetail(entry("Meowscarada", 60, "AAA")).skill).toEqual({});
	});
});


describe("yield options", () => {
	const sum = (y: Record<string, number | undefined>) => Object.values(y).reduce((a: number, b) => a + (b ?? 0), 0);
	const gourgeist = entry("Gourgeist (Small)", 60, "ABC"); // carry limit 10, fills up overnight

	test("removing the inventory limit never lowers yield, and raises it for a small bag", () => {
		const limited = sum(dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: false }));
		const unlimited = sum(dailyIngredientYield(gourgeist, { inventoryLimit: false, campTicket: false }));
		expect(unlimited).toBeGreaterThan(limited);
	});

	test("Good Camp Ticket raises yield", () => {
		const off = sum(dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: false }));
		const on = sum(dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: true }));
		expect(on).toBeGreaterThan(off);
	});

	test("defaults match the original behaviour (limit on, no ticket)", () => {
		expect(dailyIngredientYield(gourgeist)).toEqual(
			dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: false }),
		);
	});
});
