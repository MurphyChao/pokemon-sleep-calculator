import { extraTasty, tastySlotValue } from "./tasty";

test("no skills: base rates and SleepAPI's average weekly multiplier", () => {
	const r = extraTasty([]);
	expect(r.weekdayChance).toBeCloseTo(0.1);
	expect(r.sundayChance).toBeCloseTo(0.3);
	expect(r.weekdayMultiplier).toBeCloseTo(1.1);
	expect(r.sundayMultiplier).toBeCloseTo(1.6);
	// SleepAPI: AVERAGE_WEEKLY_CRIT_MULTIPLIER = 1.171428571 = (6 × 1.1 + 1.6) / 7
	expect(r.weekMultiplier).toBeCloseTo(1.171428571, 6);
});

test("Tasty Chance raises the chance, but less than the raw bonus because of resets", () => {
	// 3 triggers/day of +10%: 1 per meal on average.
	const r = extraTasty([{ perTrigger: 10, triggersPerDay: 3 }]);
	expect(r.weekdayChance).toBeGreaterThan(0.1);
	expect(r.weekdayChance).toBeLessThan(0.8);
	expect(r.sundayChance).toBeGreaterThan(r.weekdayChance);
});

test("enormous trigger rate approaches the cap: 80% weekdays, 100% Sundays", () => {
	const r = extraTasty([{ perTrigger: 10, triggersPerDay: 300 }]);
	expect(r.weekdayChance).toBeCloseTo(0.8, 2);
	expect(r.sundayChance).toBeCloseTo(1, 2);
});

test("rare triggers: chance stays close to the base rate plus the small expected bonus", () => {
	// 0.3 triggers/day of +5%. Without resets the bonus would grow by 0.5 points per day.
	const r = extraTasty([{ perTrigger: 5, triggersPerDay: 0.3 }]);
	expect(r.weekdayChance).toBeGreaterThan(0.1);
	expect(r.weekdayChance).toBeLessThan(0.13);
});

test("diminishing returns: a second Tasty Chance Pokémon adds less than the first", () => {
	const s = { perTrigger: 8, triggersPerDay: 4 };
	const first = tastySlotValue([], s, 5);
	const second = tastySlotValue([s], s, 5);
	expect(first.week).toBeGreaterThan(0);
	expect(second.week).toBeLessThan(first.week);
});

test("slot value scales with slots needed and is larger on Sunday", () => {
	const s = { perTrigger: 8, triggersPerDay: 4 };
	const a = tastySlotValue([], s, 4);
	const b = tastySlotValue([], s, 8);
	expect(b.week).toBeCloseTo(2 * a.week);
	expect(a.sunday).toBeGreaterThan(a.weekday);
});
