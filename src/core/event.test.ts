import { afterEach, expect, test, vi } from "vitest";
import type { BoxEntry } from "./box";
import { activeEvent, currentEvent, eventDishMultiplier, eventKey, eventParameter, eventPotMultiplier } from "./event";
import { dailyIngredientYieldDetail, defaultYieldOptions } from "./yield";

const duringDreamShardWeek = new Date("2026-11-24T12:00:00");
afterEach(() => vi.setSystemTime(new Date("2026-11-05T12:00:00")));

test("the default follows the event running now; base has none; custom is the user's own", () => {
	expect(currentEvent(duringDreamShardWeek)?.name).toBe("dream shard week 3");
	expect(currentEvent(new Date("2026-11-05T12:00:00"))).toBeUndefined();
	expect(eventParameter({ eventBonus: "default" }, duringDreamShardWeek)).toEqual({ event: "dream shard week 3" });
	expect(eventParameter({ eventBonus: "base" }, duringDreamShardWeek)).toEqual({ event: "none" });
	expect(eventParameter({}, new Date("2026-11-05T12:00:00"))).toEqual({ event: "none" });
	const custom = eventParameter({ eventBonus: "custom", customEvent: { target: { specialty: "Skills" }, effects: { dish: 1.5 } } });
	expect(custom.event).toBe("custom");
	expect(custom.customEventBonus?.target).toEqual({ specialty: "Skills" });
	expect(custom.customEventBonus?.effects.dish).toBe(1.5);
	expect(custom.customEventBonus?.effects.skillTrigger).toBe(1);
	// This week: skill rate ×1.25 and dream shard skills ×1.5.
	const now = activeEvent({ eventBonus: "default" }, duringDreamShardWeek);
	expect(now?.effects.skillTrigger).toBe(1.25);
	expect(now?.effects.dreamShard).toBe(1.5);
	// Keys tell the cases apart (no event = base, so the shipped rank tables still apply).
	expect(eventKey({ eventBonus: "default" }, new Date("2026-11-05T12:00:00"))).toBe(eventKey({ eventBonus: "base" }));
	expect(eventKey({ eventBonus: "default" }, duringDreamShardWeek)).not.toBe(eventKey({ eventBonus: "base" }));
	expect(eventDishMultiplier({ eventBonus: "custom", customEvent: { target: {}, effects: { dish: 1.25 } } })).toBe(1.25);
	expect(eventPotMultiplier({ eventBonus: "base" })).toBe(1);
});

test("the yield model applies the event: more skill triggers, and more dream shards for dream shard skills", () => {
	vi.setSystemTime(duringDreamShardWeek);
	const swalot: BoxEntry = { id: "s", pokemonName: "Swalot", level: 50, skillLevel: 4, ingredient: "AAA", nature: "Serious", subSkills: {} };
	const base = dailyIngredientYieldDetail(swalot, { ...defaultYieldOptions, eventBonus: "base" });
	const week = dailyIngredientYieldDetail(swalot, { ...defaultYieldOptions, eventBonus: "default" });
	expect(week.skillsPerDay / base.skillsPerDay).toBeGreaterThan(1.15);
	// Shards per trigger ×1.5 on top of the extra triggers.
	expect(week.skillValue / week.skillsPerDay / (base.skillValue / base.skillsPerDay)).toBeCloseTo(1.5, 2);
});
