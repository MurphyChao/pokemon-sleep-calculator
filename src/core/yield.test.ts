import type { BoxEntry } from "./box";
import { dailyIngredientYield, dailyIngredientYieldDetail, healFor } from "./yield";

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
		const limited = sum(dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: false, energy: "full", sleepScore: 0 }));
		const unlimited = sum(dailyIngredientYield(gourgeist, { inventoryLimit: false, campTicket: false, energy: "full", sleepScore: 0 }));
		expect(unlimited).toBeGreaterThan(limited);
	});

	test("Good Camp Ticket raises yield", () => {
		const off = sum(dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: false, energy: "full", sleepScore: 0 }));
		const on = sum(dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: true, energy: "full", sleepScore: 0 }));
		expect(on).toBeGreaterThan(off);
	});

	test("defaults: limit on, no ticket, energy always full", () => {
		expect(dailyIngredientYield(gourgeist)).toEqual(
			dailyIngredientYield(gourgeist, { inventoryLimit: true, campTicket: false, energy: "full", sleepScore: 0 }),
		);
	});
});

describe("Extra Tasty skills", () => {
	test("Tasty Chance S reports its per-trigger bonus and daily triggers", () => {
		const d = dailyIngredientYieldDetail({ ...entry("Swampert", 60, "AAA"), skillLevel: 6 });
		expect(d.tasty?.perTrigger).toBe(10);
		expect(d.tasty?.triggersPerDay).toBeGreaterThan(0);
	});

	test("Bulk Up reports its secondary Extra Tasty bonus", () => {
		const d = dailyIngredientYieldDetail({ ...entry("Heracross", 60, "AAA"), skillLevel: 1 });
		expect(d.tasty?.perTrigger).toBe(1);
	});

	test("other skills have no Extra Tasty source", () => {
		expect(dailyIngredientYieldDetail(entry("Meowscarada", 60, "AAA")).tasty).toBeUndefined();
	});
});

describe("energy", () => {
	const simulated = { inventoryLimit: true, campTicket: false, energy: "simulated" as const, sleepScore: 100 };
	const total = (d: { berryStrength: number }) => d.berryStrength;
	const raichu = entry("Raichu", 60, "AAA");

	test("sleep score: more sleep means more recovery with simulated energy, and a full bag overnight with full energy", () => {
		const g = entry("Gourgeist (Jumbo)", 60, "AAA");
		const sum = (y: Record<string, number | undefined>) => Object.values(y).reduce((a: number, b) => a + (b ?? 0), 0);
		const at = (energy: "full" | "simulated", sleepScore: number) =>
			sum(dailyIngredientYield(g, { inventoryLimit: true, campTicket: false, energy, sleepScore }));
		expect(at("simulated", 100)).toBeGreaterThan(at("simulated", 50));
		expect(at("simulated", 50)).toBeGreaterThan(at("simulated", 0));
		expect(at("full", 0)).toBeGreaterThan(at("full", 100));
		expect(Number.isFinite(at("simulated", 0))).toBe(true);
	});

	test("always-full energy helps more than simulated energy", () => {
		expect(total(dailyIngredientYieldDetail(raichu))).toBeGreaterThan(total(dailyIngredientYieldDetail(raichu, simulated)));
	});

	test("healing raises output with simulated energy, and does nothing with full energy", () => {
		const heal = { count: 3, energy: 18 };
		const none = total(dailyIngredientYieldDetail(raichu, simulated));
		const healed = total(dailyIngredientYieldDetail(raichu, simulated, undefined, heal));
		expect(healed).toBeGreaterThan(none);
		expect(total(dailyIngredientYieldDetail(raichu, undefined, undefined, heal))).toBe(total(dailyIngredientYieldDetail(raichu)));
	});

	test("heal sources: Energy for Everyone heals the team, Energizing Cheer 1/5 each, Charge Energy itself", () => {
		const e4e = dailyIngredientYieldDetail({ ...entry("Sylveon", 60, "AAA"), skillLevel: 6 }, simulated).heal;
		expect(e4e?.team).toBe(18);
		expect(e4e?.self).toBe(0);
		const cheer = dailyIngredientYieldDetail({ ...entry("Ninetales", 60, "AAA"), skillLevel: 1 }, simulated).heal;
		expect(cheer?.team).toBeCloseTo(12 / 5);
		const charge = dailyIngredientYieldDetail({ ...entry("Arbok", 60, "AAA"), skillLevel: 1 }, simulated).heal;
		expect(charge?.team).toBe(0);
		expect(charge?.self).toBeCloseTo(12);
		expect(dailyIngredientYieldDetail(raichu, simulated).heal).toBeUndefined(); // Charge Strength, not a healer
		expect(healFor([])).toBeUndefined();
		expect(healFor([{ team: 18, self: 0, triggersPerDay: 2.6 }])).toEqual({ count: 3, energy: (18 * 2.6) / 3 });
		expect(healFor([], { team: 0, self: 30, triggersPerDay: 1.2 })).toEqual({ count: 1, energy: 36 });
	});
});
