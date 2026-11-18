import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import type { BoxEntry, SubSkillLevel } from "./box";
import { gradeOf, rateEntry, ratingProblem, searchBest } from "./rating";

const levels: SubSkillLevel[] = ["lv10", "lv25", "lv50", "lv70", "lv80"];
const e = (pokemonName: string, nature = "Serious", subSkills: SubSkillType[] = [], extra: Partial<BoxEntry> = {}): BoxEntry => ({
	id: pokemonName,
	pokemonName,
	level: 60,
	ingredient: "ABB",
	nature,
	subSkills: Object.fromEntries(subSkills.map((s, i) => [levels[i], s])),
	...extra,
});

describe("ratingRole", () => {
	it.each([
		["Raichu", "strength"], // Berries
		["Sceptile", "strength"], // Skills, but Berry Burst gives strength
		["Sandslash", "ingredients"], // Skills, but Ingredient Draw gives ingredients
		["Dragonite", "ingredients"],
		["Gengar", "ingredients"], // Ingredients with a strength skill: ingredients only
		["Chansey", "hybrid"], // Ingredients + Energy for Everyone
		["Drampa", "hybrid"], // Ingredients + Tasty Chance
		["Cramorant", "hybrid"],
		["Wigglytuff", "support"], // Skills, Energizing Cheer
	])("%s is rated for %s", (name, role) => {
		expect(rateEntry(e(name)).role).toBe(role);
	});
});

describe("rateEntry", () => {
	it("gives the best build found 100, and less to weaker builds", () => {
		for (const name of ["Sceptile", "Chansey", "Sandslash", "Raichu"]) {
			const { best } = rateEntry(e(name));
			expect(rateEntry(e(name, best.nature, best.subSkills)).score).toBeCloseTo(100, 6);
			const weaker = rateEntry(e(name, best.nature, best.subSkills.slice(0, 3))).score;
			expect(weaker).toBeLessThan(100);
			expect(rateEntry(e(name)).score).toBeLessThan(weaker);
		}
	});

	it("rewards a nature that helps the role and penalises one that hurts it", () => {
		const subs: SubSkillType[] = ["Helping Speed M", "Ingredient Finder M"];
		const neutral = rateEntry(e("Dragonite", "Serious", subs)).score;
		expect(rateEntry(e("Dragonite", "Quiet", subs)).score).toBeGreaterThan(neutral); // ingredient finding ▲
		expect(rateEntry(e("Dragonite", "Adamant", subs)).score).toBeLessThan(neutral); // ingredient finding ▼
	});

	it("rates at full potential: subskills not unlocked yet count, and so does their Skill Level Up", () => {
		const subs: SubSkillType[] = ["Helping Speed S", "Berry Finding S", "Skill Level Up M"];
		const lv30 = rateEntry(e("Sceptile", "Serious", subs, { level: 30, skillLevel: 2 }));
		// At Lv60 Skill Level Up M is unlocked and already included in the in-game skill level.
		const lv60 = rateEntry(e("Sceptile", "Serious", subs, { level: 60, skillLevel: 4 }));
		expect(lv30.score).toBeCloseTo(lv60.score, 6);
		const withoutLevelUp = rateEntry(e("Sceptile", "Serious", ["Helping Speed S", "Berry Finding S"], { level: 30, skillLevel: 2 }));
		expect(lv30.score).toBeGreaterThan(withoutLevelUp.score);
	});

	it("ignores subskills that don't help the role", () => {
		const base: SubSkillType[] = ["Helping Speed M"];
		const score = rateEntry(e("Dragonite", "Serious", base)).score;
		expect(rateEntry(e("Dragonite", "Serious", [...base, "Sleep EXP Bonus"])).score).toBeCloseTo(score, 6);
	});
});

describe("searchBest", () => {
	function* subsets<T>(items: T[], max: number, start = 0, cur: T[] = []): Generator<T[]> {
		yield cur;
		if (cur.length === max) return;
		for (let i = start; i < items.length; i++) yield* subsets(items, max, i + 1, [...cur, items[i]]);
	}

	// Hawlucha and Sandshrew need the nature and a subskill changed together to reach the optimum.
	it.each(["Sceptile", "Chansey", "Sandslash", "Drampa", "Hawlucha", "Sandshrew"])("finds the exhaustive optimum for %s", (name) => {
		const p = ratingProblem(e(name, "Serious", [], { ingredient: "ABC" }));
		let best = -Infinity;
		for (const nature of p.natures) for (const s of subsets(p.candidates, 5)) best = Math.max(best, p.valueOf(nature, s));
		expect(searchBest(p.valueOf, p.natures, p.candidates).value).toBeCloseTo(best, 9);
	});
});

describe("gradeOf", () => {
	it.each([
		[100, "S"],
		[90, "S"],
		[89.9, "A"],
		[75, "A"],
		[60, "B"],
		[40, "C"],
		[39.9, "D"],
		[0, "D"],
	])("%d → %s", (score, grade) => {
		expect(gradeOf(score)).toBe(grade);
	});
});
