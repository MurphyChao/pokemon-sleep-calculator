import type { BoxEntry } from "../core/box";
import { buildEntryLabels, subSkillAbbrev } from "./names";

const entry = (id: string, extra: Partial<BoxEntry> = {}): BoxEntry => ({
	id,
	pokemonName: "Sandslash",
	level: 60,
	ingredient: "ABC",
	nature: "Serious",
	subSkills: {},
	...extra,
});

test("subskill abbreviations", () => {
	expect(subSkillAbbrev("Helping Speed M")).toBe("HSM");
	expect(subSkillAbbrev("Skill Level Up S")).toBe("SLUS");
	expect(subSkillAbbrev("Helping Bonus")).toBe("HB");
});

test("unique entries keep the short label", () => {
	const labels = buildEntryLabels([entry("a"), entry("b", { level: 50 })]);
	expect(labels.get("a")).toBe("Sandslash Lv60 ABC");
	expect(labels.get("b")).toBe("Sandslash Lv50 ABC");
});

test("same species, level and ingredients: nature and subskills tell them apart", () => {
	const labels = buildEntryLabels([
		entry("a", { subSkills: { lv10: "Helping Speed M", lv25: "Ingredient Finder M" } }),
		entry("b", { subSkills: { lv10: "Skill Trigger M" } }),
		entry("c", { nature: "Naughty" }),
	]);
	expect(labels.get("a")).toBe("Sandslash Lv60 ABC · Serious · HSM/IFM");
	expect(labels.get("b")).toBe("Sandslash Lv60 ABC · Serious · STM");
	expect(labels.get("c")).toBe("Sandslash Lv60 ABC · Naughty");
});

test("identical entries are numbered; nicknames win", () => {
	const labels = buildEntryLabels([entry("a"), entry("b"), entry("c", { nickname: " My Sandslash " })]);
	expect(labels.get("a")).toBe("Sandslash Lv60 ABC · Serious #1");
	expect(labels.get("b")).toBe("Sandslash Lv60 ABC · Serious #2");
	expect(labels.get("c")).toBe("My Sandslash");
});
