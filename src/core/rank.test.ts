import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import tables from "../data/rank-tables.json";
import type { BoxEntry, SubSkillLevel } from "./box";
import { type RankTable, type RankTables, rankEntry, shareAbove, skillKind } from "./rank";

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
const rank = (entry: BoxEntry) => rankEntry(entry, tables as RankTables);

test("skillKind drops a variant in brackets", () => {
	expect(skillKind("Charge Strength S (Random)")).toBe("Charge Strength S");
	expect(skillKind("Energy for Everyone S")).toBe("Energy for Everyone S");
});

test("shareAbove interpolates between quantiles", () => {
	const t: RankTable = { count: 5, species: 1, q: [0, 10, 20, 30, 40] };
	expect(shareAbove(t, 40)).toBe(0);
	expect(shareAbove(t, -1)).toBe(1);
	expect(shareAbove(t, 20)).toBeCloseTo(0.5, 9);
	expect(shareAbove(t, 25)).toBeCloseTo(0.375, 9);
});

test("the tables cover strength, ingredients and skill kinds, with quantiles in order", () => {
	const { categories } = tables as RankTables;
	expect(categories.strength.species).toBeGreaterThan(30);
	expect(categories.ingredients.species).toBeGreaterThan(30);
	expect(categories["skill:Energy for Everyone S"]).toBeDefined();
	for (const t of Object.values(categories)) expect(t.q).toEqual([...t.q].sort((a, b) => a - b));
});

describe("rankEntry", () => {
	it("ranks by role across species: strength, ingredients, skill kind; hybrids by their better rank", () => {
		expect(rank(e("Sceptile"))?.category).toBe("strength");
		expect(rank(e("Dragonite"))?.category).toBe("ingredients");
		expect(rank(e("Wigglytuff"))?.category).toBe("skill:Energy for Everyone S");
		expect(["ingredients", "skill:Energy for Everyone S"]).toContain(rank(e("Chansey"))?.category);
	});

	it("a better build ranks higher, and the grade follows the share", () => {
		const plain = rank(e("Sceptile")) as NonNullable<ReturnType<typeof rank>>;
		const built = rank(e("Sceptile", "Adamant", ["Helping Speed M", "Berry Finding S", "Skill Trigger M", "Helping Bonus", "Helping Speed S"]));
		expect(built?.value).toBeGreaterThan(plain.value);
		expect(built?.better).toBeLessThan(plain.better);
		expect(built?.grade).toBe("S");
	});

	it("compares species: the same nature and subskills rank differently on different Pokémon", () => {
		const subs: SubSkillType[] = ["Ingredient Finder M", "Helping Speed M"];
		const strong = rank(e("Dragonite", "Quiet", subs));
		const weak = rank(e("Ditto", "Quiet", subs));
		expect(strong?.better).toBeLessThan(weak?.better ?? 1);
	});

	it("doesn't depend on the level entered (always Lv80)", () => {
		expect(rank(e("Sceptile", "Serious", [], { level: 20 }))?.value).toBeCloseTo(rank(e("Sceptile"))?.value ?? 0, 9);
	});
});
