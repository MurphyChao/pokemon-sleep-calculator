import { describe, expect, it } from "vitest";
import { findShot, mealSlot, mergeRecord, slotKey, tastyChance, weekDays, weekStart, weekStats, type CookingLog } from "./cooking";

describe("mealSlot", () => {
	it("follows the game's meal windows", () => {
		expect(mealSlot("2026-11-23T07:36:56")).toEqual({ day: "2026-11-23", meal: 0 });
		expect(mealSlot("2026-11-23T11:59:59")).toEqual({ day: "2026-11-23", meal: 0 });
		expect(mealSlot("2026-11-23T12:00:00")).toEqual({ day: "2026-11-23", meal: 1 });
		expect(mealSlot("2026-11-23T18:00:00")).toEqual({ day: "2026-11-23", meal: 2 });
	});
	it("counts dinner after midnight (before 04:00) toward the day before", () => {
		expect(mealSlot("2026-11-24T03:59:00")).toEqual({ day: "2026-11-23", meal: 2 });
		expect(mealSlot("2026-12-01T01:00:00")).toEqual({ day: "2026-11-30", meal: 2 });
		expect(mealSlot("2026-11-24T04:00:00")).toEqual({ day: "2026-11-24", meal: 0 });
	});
});

describe("weeks", () => {
	it("start on Monday", () => {
		expect(weekStart("2026-11-26")).toBe("2026-11-23"); // Thursday
		expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday
		expect(weekStart("2026-11-23")).toBe("2026-11-23");
		expect(weekDays("2026-11-30")).toEqual([
			"2026-11-30",
			"2026-12-01",
			"2026-12-02",
			"2026-12-03",
			"2026-12-04",
			"2026-12-05",
			"2026-12-06",
		]);
	});
});

describe("tastyChance", () => {
	it("adds the pot's bonus to the day's base chance", () => {
		expect(tastyChance({ day: "2026-11-26" })).toBe(10);
		expect(tastyChance({ day: "2026-11-26", tastyBonus: 20 })).toBe(30);
		expect(tastyChance({ day: "2026-11-29", tastyBonus: 20 })).toBe(50); // Sunday
		expect(tastyChance({ day: "2026-11-29", tastyBonus: 90 })).toBe(100); // bonus capped at 70
	});
});

describe("log", () => {
	it("merges a pot screenshot and a result screenshot of the same meal", () => {
		let log: CookingLog = {};
		log = mergeRecord(log, { day: "2026-11-26", meal: 1, tastyBonus: 20, shots: ["a"] });
		log = mergeRecord(log, { day: "2026-11-26", meal: 1, recipeId: "bulldoze_guacamole_and_chips", energy: 211909, extraTasty: true, shots: ["b"] });
		expect(log[slotKey("2026-11-26", 1)]).toEqual({
			day: "2026-11-26",
			meal: 1,
			recipeId: "bulldoze_guacamole_and_chips",
			energy: 211909,
			extraTasty: true,
			tastyBonus: 20,
			shots: ["a", "b"],
		});
		expect(findShot(log, "b")?.meal).toBe(1);
		expect(findShot(log, "c")).toBeUndefined();
	});

	it("sums up a week", () => {
		let log: CookingLog = {};
		log = mergeRecord(log, { day: "2026-11-23", meal: 0, recipeId: "x", energy: 211909, extraTasty: true });
		log = mergeRecord(log, { day: "2026-11-23", meal: 1, recipeId: "x", energy: 100000, extraTasty: false, tastyBonus: 20 });
		log = mergeRecord(log, { day: "2026-11-29", meal: 2, recipeId: "x", energy: 50000, extraTasty: false });
		// A pot screenshot alone isn't a dish, and other weeks don't count.
		log = mergeRecord(log, { day: "2026-11-24", meal: 0, tastyBonus: 5 });
		log = mergeRecord(log, { day: "2026-11-30", meal: 0, energy: 1 });
		const s = weekStats(log, "2026-11-23");
		expect(s.cooked).toBe(3);
		expect(s.totalEnergy).toBe(361909);
		expect(s.extraTasty).toBe(1);
		expect(s.expectedExtraTasty).toBeCloseTo(0.1 + 0.3 + 0.3);
		expect(s.withBonus).toBe(1);
		expect(s.dayEnergy).toEqual([311909, 0, 0, 0, 0, 0, 50000]);
		expect(s.best?.energy).toBe(211909);
	});
});
