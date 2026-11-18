import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, maxSubSkillSeeds, scaleLevels, type SubSkillLevel } from "./box";
import { defaultYieldOptions } from "./yield";
import { gradeOf, rateEntry, ratingProblem, rollSampleSize, sampleRolls, searchBest, shareBetter } from "./rating";

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
			expect(rateEntry(e(name, best.nature, best.subSkills)).ofBest).toBeCloseTo(100, 6);
			const weaker = rateEntry(e(name, best.nature, best.subSkills.slice(0, 3))).ofBest;
			expect(weaker).toBeLessThan(100);
			expect(rateEntry(e(name)).ofBest).toBeLessThan(weaker);
		}
	});

	it("ranks Pokémon among random rolls of their species: the best build beats them all, a plain one few", () => {
		for (const name of ["Sceptile", "Chansey"]) {
			const { best } = rateEntry(e(name));
			const top = rateEntry(e(name, best.nature, best.subSkills));
			expect(top.better).toBe(0);
			expect(top.grade).toBe("S");
			const good = rateEntry(e(name, best.nature, best.subSkills.slice(0, 3)));
			const plain = rateEntry(e(name, "Serious", ["Sleep EXP Bonus"]));
			expect(good.better).toBeGreaterThan(0);
			expect(good.better).toBeLessThan(plain.better);
			expect(plain.better).toBeGreaterThan(0.8);
			expect(plain.grade).toBe("D");
		}
	});

	it("rewards a nature that helps the role and penalises one that hurts it", () => {
		const subs: SubSkillType[] = ["Helping Speed M", "Ingredient Finder M"];
		const neutral = rateEntry(e("Dragonite", "Serious", subs)).ofBest;
		expect(rateEntry(e("Dragonite", "Quiet", subs)).ofBest).toBeGreaterThan(neutral); // ingredient finding ▲
		expect(rateEntry(e("Dragonite", "Adamant", subs)).ofBest).toBeLessThan(neutral); // ingredient finding ▼
	});

	it("maxes the main skill except for pure ingredient Pokémon, so their entered skill level doesn't matter", () => {
		const subs: SubSkillType[] = ["Helping Speed M", "Berry Finding S"];
		const low = rateEntry(e("Sceptile", "Serious", subs, { skillLevel: 1 }));
		const high = rateEntry(e("Sceptile", "Serious", subs, { skillLevel: 5 }));
		expect(low).toMatchObject({ skillMaxed: true, skillLevel: high.skillLevel });
		expect(low.ofBest).toBeCloseTo(high.ofBest, 9);
		expect(low.better).toBe(high.better);
		expect(rateEntry(e("Chansey", "Serious", [], { skillLevel: 1 })).skillMaxed).toBe(true);
		expect(rateEntry(e("Wigglytuff", "Serious", [], { skillLevel: 1 })).skillMaxed).toBe(true);
		expect(rateEntry(e("Sandslash", "Serious", [], { skillLevel: 2 }))).toMatchObject({ skillMaxed: false, skillLevel: 2 });
	});

	it("uses Sub Skill Seeds: an S subskill counts as M unless the Pokémon already has the M", () => {
		const s = rateEntry(e("Sceptile", "Serious", ["Helping Speed S", "Berry Finding S"]));
		const m = rateEntry(e("Sceptile", "Serious", ["Helping Speed M", "Berry Finding S"]));
		expect(s.ofBest).toBeCloseTo(m.ofBest, 9);
		const both = rateEntry(e("Sceptile", "Serious", ["Helping Speed S", "Helping Speed M"]));
		const twoM = rateEntry(e("Sceptile", "Serious", ["Helping Speed M"]));
		expect(both.ofBest).toBeGreaterThan(twoM.ofBest);
	});

	it("pure ingredient Pokémon: Skill Level Up counts after seeds, also when not unlocked yet", () => {
		// Lv30: Skill Level Up S in the Lv50 slot isn't unlocked, so the entered skill level doesn't include it.
		const withLevelUp = rateEntry(e("Sandslash", "Serious", ["Helping Speed S", "Ingredient Finder S", "Skill Level Up S"], { level: 30, skillLevel: 2 }));
		expect(withLevelUp.skillLevel).toBe(4); // Skill Level Up S → M: +2
		const without = rateEntry(e("Sandslash", "Serious", ["Helping Speed S", "Ingredient Finder S"], { level: 30, skillLevel: 2 }));
		expect(withLevelUp.ofBest).toBeGreaterThan(without.ofBest);
	});

	it("rates the solvers' copies from the skill level as entered: level scaling and seeds change nothing", () => {
		const subs: SubSkillType[] = ["Helping Speed S", "Ingredient Finder S", "Skill Level Up S"];
		const real = e("Sandslash", "Serious", subs, { level: 30, skillLevel: 2 });
		const rating = rateEntry(real);
		// Lv60 unlocks Skill Level Up S, which the entered skill level doesn't include yet.
		const [scaled] = scaleLevels([real], 60);
		expect(rateEntry(scaled)).toEqual(rating);
		const [seeded] = maxSubSkillSeeds(scaleLevels([real], 60), true);
		expect(rateEntry(seeded)).toEqual(rating);
	});

	it("ignores subskills that don't help the role", () => {
		const base: SubSkillType[] = ["Helping Speed M"];
		const score = rateEntry(e("Dragonite", "Serious", base)).ofBest;
		expect(rateEntry(e("Dragonite", "Serious", [...base, "Sleep EXP Bonus"])).ofBest).toBeCloseTo(score, 6);
	});
});

describe("searchBest", () => {
	function* subsets<T>(items: T[], max: number, start = 0, cur: T[] = []): Generator<T[]> {
		yield cur;
		if (cur.length === max) return;
		for (let i = start; i < items.length; i++) yield* subsets(items, max, i + 1, [...cur, items[i]]);
	}

	// Hawlucha and Sandshrew need the nature and a subskill changed together to reach the optimum, Psyduck two subskills.
	it.each(["Sceptile", "Chansey", "Sandslash", "Drampa", "Hawlucha", "Sandshrew", "Psyduck"])("finds the exhaustive optimum for %s", (name) => {
		const p = ratingProblem(e(name, "Serious", [], { ingredient: "ABC" }));
		let best = -Infinity;
		for (const nature of p.natures) for (const s of subsets(p.candidates, 5)) best = Math.max(best, p.valueOf(nature, s));
		expect(searchBest(p.valueOf, p.natures, p.candidates).value).toBeCloseTo(best, 9);
	});
});

describe("sampleRolls", () => {
	it("is the same on every run, sorted, and of the sample size", () => {
		const p = ratingProblem(e("Sceptile"));
		const a = sampleRolls(p, defaultYieldOptions);
		expect(a).toHaveLength(rollSampleSize);
		expect([...a]).toEqual([...a].sort((x, y) => x - y));
		expect([...sampleRolls(ratingProblem(e("Sceptile")), defaultYieldOptions)]).toEqual([...a]);
	});

	it("shares one calculation between rolls that do the same after seeds; unused subskills don't matter", () => {
		const p = ratingProblem(e("Dragonite"));
		// Inventory Up S + L and M + L both end as M + L.
		const sl = p.valueOf("Quiet", ["Inventory Up S", "Inventory Up L", "Helping Speed M", "Sleep EXP Bonus", "Dream Shard Bonus"]);
		const ml = p.valueOf("Quiet", ["Inventory Up M", "Inventory Up L", "Helping Speed M", "Research EXP Bonus", "Sleep EXP Bonus"]);
		expect(sl).toBeCloseTo(ml, 12);
	});
});

describe("shareBetter", () => {
	const values = Float64Array.from([1, 2, 2, 3, 4]);
	it.each([
		[0.5, 1],
		[2, 0.4],
		[4, 0],
		[5, 0],
	])("%d → %d", (v, share) => {
		expect(shareBetter(values, v)).toBe(share);
	});
});

describe("gradeOf", () => {
	it.each([
		[0, "S"],
		[0.049, "S"],
		[0.05, "A"],
		[0.19, "A"],
		[0.2, "B"],
		[0.5, "C"],
		[0.79, "C"],
		[0.8, "D"],
		[1, "D"],
	])("%d of rolls better → %s", (better, grade) => {
		expect(gradeOf(better)).toBe(grade);
	});
});
