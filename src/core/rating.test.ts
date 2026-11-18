import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { type BoxEntry, maxSubSkillSeeds, scaleLevels, type SubSkillLevel } from "./box";
import { defaultYieldOptions } from "./yield";
import { goalValue, gradeOf, helpingBonusTeamValue, type RatingProblem, rateEntry, ratingProblem, rollSampleSize, sampleRolls, searchBest, shareBetter } from "./rating";

/** The value of a problem's first goal, at that goal's own ingredient combination. */
const valueOf = (p: RatingProblem) => goalValue(p, p.goals[0]);
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
			const top = rateEntry(e(name, best.nature, best.subSkills, best.combo && { ingredient: best.combo }));
			expect(top.better).toBe(0);
			expect(top.grade).toBe("S");
			const good = rateEntry(e(name, best.nature, best.subSkills.slice(0, 3)));
			const plain = rateEntry(e(name, "Serious", ["Sleep EXP Bonus"]));
			expect(good.better).toBeGreaterThan(0);
			expect(good.better).toBeLessThan(plain.better);
		}
		const plain = rateEntry(e("Sceptile", "Serious", ["Sleep EXP Bonus"]));
		expect(plain.better).toBeGreaterThan(0.8);
		expect(plain.grade).toBe("D");
	});

	it("ranks Ingredients specialists for their best single ingredient, against rolls of any combination", () => {
		const subs: SubSkillType[] = ["Ingredient Finder M", "Helping Speed M", "Ingredient Finder S"];
		const charizard = (ingredient: BoxEntry["ingredient"]) => rateEntry(e("Charizard", "Quiet", subs, { ingredient }));
		// Bean Sausage is in every slot of AAA, so that Charizard ranks for it, and better than any other combo.
		const aaa = charizard("AAA");
		expect(aaa.ingredient).toBe("sausage");
		expect(aaa.best.combo).toBe("AAA");
		for (const combo of ["AAB", "AAC", "ABA", "ABB", "ABC"] as const) expect(charizard(combo).better).toBeGreaterThan(aaa.better);
		// ABB is best at Ginger (in two slots), ranked against Charizards of any combination.
		expect(charizard("ABB").ingredient).toBe("ginger");
		// The same nature and subskills rank differently with different combinations.
		expect(charizard("ABC").better).not.toBe(aaa.better);
		// Fiery Herb only comes from the Lv60 slot: a plain AAC Charizard is compared only with Charizards that
		// gather it, not with the two thirds that can't, so it doesn't rank well for it (or anything).
		const plain = rateEntry(e("Charizard", "Serious", ["Sleep EXP Bonus"], { ingredient: "AAC" }));
		expect(plain.better).toBeGreaterThan(0.5);
		expect(["C", "D"]).toContain(plain.grade);
		// Hybrids too (Chansey: half ingredients, half skill triggers); other roles have no ingredient.
		expect(rateEntry(e("Chansey", "Serious", subs, { ingredient: "AAA" })).ingredient).toBe("egg");
		expect(rateEntry(e("Sandslash")).ingredient).toBeUndefined();
		expect(rateEntry(e("Sceptile")).ingredient).toBeUndefined();
	});

	it("rewards a nature that helps the role and penalises one that hurts it", () => {
		const subs: SubSkillType[] = ["Helping Speed M", "Ingredient Finder M"];
		const neutral = rateEntry(e("Dragonite", "Serious", subs)).ofBest;
		expect(rateEntry(e("Dragonite", "Quiet", subs)).ofBest).toBeGreaterThan(neutral); // ingredient finding ▲
		expect(rateEntry(e("Dragonite", "Adamant", subs)).ofBest).toBeLessThan(neutral); // ingredient finding ▼
	});

	it("maxes the main skill except for Ingredients specialists rated on ingredients, so the entered level doesn't matter", () => {
		const subs: SubSkillType[] = ["Helping Speed M", "Berry Finding S"];
		const low = rateEntry(e("Sceptile", "Serious", subs, { skillLevel: 1 }));
		const high = rateEntry(e("Sceptile", "Serious", subs, { skillLevel: 5 }));
		expect(low).toMatchObject({ skillMaxed: true, skillLevel: high.skillLevel });
		expect(low.ofBest).toBeCloseTo(high.ofBest, 9);
		expect(low.better).toBe(high.better);
		expect(rateEntry(e("Chansey", "Serious", [], { skillLevel: 1 })).skillMaxed).toBe(true);
		expect(rateEntry(e("Wigglytuff", "Serious", [], { skillLevel: 1 })).skillMaxed).toBe(true);
		// Skills specialists with an ingredient skill are maxed; an Ingredients specialist with one isn't.
		expect(rateEntry(e("Sandslash", "Serious", [], { skillLevel: 2 })).skillMaxed).toBe(true);
		expect(rateEntry(e("Crustle", "Serious", [], { skillLevel: 2 })).skillMaxed).toBe(true);
		expect(rateEntry(e("Blastoise", "Serious", [], { skillLevel: 2 }))).toMatchObject({ role: "ingredients", skillMaxed: false, skillLevel: 2 });
	});

	it("uses Sub Skill Seeds: an S subskill counts as M unless the Pokémon already has the M", () => {
		const s = rateEntry(e("Sceptile", "Serious", ["Helping Speed S", "Berry Finding S"]));
		const m = rateEntry(e("Sceptile", "Serious", ["Helping Speed M", "Berry Finding S"]));
		expect(s.ofBest).toBeCloseTo(m.ofBest, 9);
		const both = rateEntry(e("Sceptile", "Serious", ["Helping Speed S", "Helping Speed M"]));
		const twoM = rateEntry(e("Sceptile", "Serious", ["Helping Speed M"]));
		expect(both.ofBest).toBeGreaterThan(twoM.ofBest);
	});

	it("Ingredients specialists: Skill Level Up counts after seeds, also when not unlocked yet", () => {
		// Lv30: Skill Level Up S in the Lv50 slot isn't unlocked, so the entered skill level doesn't include it.
		const withLevelUp = rateEntry(e("Blastoise", "Serious", ["Helping Speed S", "Ingredient Finder S", "Skill Level Up S"], { level: 30, skillLevel: 2 }));
		expect(withLevelUp.skillLevel).toBe(4); // Skill Level Up S → M: +2
		const without = rateEntry(e("Blastoise", "Serious", ["Helping Speed S", "Ingredient Finder S"], { level: 30, skillLevel: 2 }));
		expect(withLevelUp.ofBest).toBeGreaterThan(without.ofBest);
	});

	it("rates the solvers' copies from the skill level as entered: level scaling and seeds change nothing", () => {
		const subs: SubSkillType[] = ["Helping Speed S", "Ingredient Finder S", "Skill Level Up S"];
		const real = e("Blastoise", "Serious", subs, { level: 30, skillLevel: 2 });
		const rating = rateEntry(real);
		// Lv60 unlocks Skill Level Up S, which the entered skill level doesn't include yet.
		const [scaled] = scaleLevels([real], 60);
		expect(rateEntry(scaled)).toEqual(rating);
		const [seeded] = maxSubSkillSeeds(scaleLevels([real], 60), true);
		expect(rateEntry(seeded)).toEqual(rating);
	});

	it("counts Helping Bonus for the 4 teammates helping 5% faster, on top of its own faster helping", () => {
		expect(helpingBonusTeamValue).toBeCloseTo(0.2105, 4);
		for (const name of ["Raichu", "Dragonite", "Chansey", "Wigglytuff"]) {
			const p = ratingProblem(e(name));
			const base = valueOf(p)("Serious", []);
			expect(base).toBeCloseTo(1, 2); // a hybrid's skill triggers vary a little with the combination
			const gain = valueOf(p)("Serious", ["Helping Bonus"]) - base;
			expect(gain).toBeGreaterThan(helpingBonusTeamValue + 0.03); // + its own ~4–5% faster helping
			expect(gain).toBeGreaterThan(valueOf(p)("Serious", ["Helping Speed M"]) - base);
			expect(rateEntry(e(name)).best.subSkills).toContain("Helping Bonus");
		}
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
		for (const nature of p.natures) for (const s of subsets(p.candidates, 5)) best = Math.max(best, valueOf(p)(nature, s));
		expect(searchBest(valueOf(p), p.natures, p.candidates).value).toBeCloseTo(best, 9);
	});
});

describe("sampleRolls", () => {
	it("is the same on every run, sorted, and of the sample size", () => {
		const p = ratingProblem(e("Sceptile"));
		const [a] = sampleRolls(p, defaultYieldOptions);
		expect(a).toHaveLength(rollSampleSize);
		expect([...a]).toEqual([...a].sort((x, y) => x - y));
		expect([...sampleRolls(ratingProblem(e("Sceptile")), defaultYieldOptions)[0]]).toEqual([...a]);
	});

	it("shares one calculation between rolls that do the same after seeds; unused subskills don't matter", () => {
		const p = ratingProblem(e("Dragonite"));
		// Inventory Up S + L and M + L both end as M + L.
		const sl = valueOf(p)("Quiet", ["Inventory Up S", "Inventory Up L", "Helping Speed M", "Sleep EXP Bonus", "Dream Shard Bonus"]);
		const ml = valueOf(p)("Quiet", ["Inventory Up M", "Inventory Up L", "Helping Speed M", "Research EXP Bonus", "Sleep EXP Bonus"]);
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
		[0.029, "S"],
		[0.03, "A"],
		[0.149, "A"],
		[0.15, "B"],
		[0.5, "C"],
		[0.79, "C"],
		[0.8, "D"],
		[1, "D"],
	])("%d of rolls better → %s", (better, grade) => {
		expect(gradeOf(better)).toBe(grade);
	});
});
