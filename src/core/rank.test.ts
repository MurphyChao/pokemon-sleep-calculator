import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import tables from "../data/rank-tables.json";
import pokemons, { getPokemonRarity } from "../vendor/pokesleep-tool/data/pokemons";
import type { BoxEntry, SubSkillLevel } from "./box";
import {
	buildRankTables,
	rankEntry,
	rankOptions,
	rankReferences,
	rankStrengthOptions,
	type RankTable,
	type RankTables,
	rankValue,
	shareAbove,
	skillKind,
} from "./rank";
import { rateEntry, ratingProblem } from "./rating";
import { defaultStrengthOptions, defaultYieldOptions } from "./yield";

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

test("shareAbove counts the rolls doing strictly better", () => {
	// Rolls: 10, 20, 20, 30, 40.
	const t: RankTable = { best: "X", count: 5, median: 20, v: [10, 20, 30, 40], above: [4, 2, 1, 0] };
	expect(shareAbove(t, 40)).toBe(0);
	expect(shareAbove(t, 99)).toBe(0);
	expect(shareAbove(t, 5)).toBe(1);
	expect(shareAbove(t, 20)).toBe(0.4);
	expect(shareAbove(t, 25)).toBe(0.4);
	expect(shareAbove(t, 10)).toBe(0.8);
});

test("the tables have one best species per category: strength per type, each ingredient, skill kinds", () => {
	const { categories } = tables as RankTables;
	expect(categories["strength:grass"].best).toBe("Sceptile");
	expect(categories["ingredient:apple"].best).toBe("Skeledirge");
	expect(categories["ingredient:nuts"].best).toBe("Whimsicott");
	expect(categories["skill:Energy for Everyone S"]).toBeDefined();
	expect(categories.strength).toBeUndefined();
	for (const t of Object.values(categories)) {
		expect(t.count).toBe(2000);
		expect(t.v).toEqual([...t.v].sort((a, b) => a - b));
		expect(t.above[t.above.length - 1]).toBe(0);
	}
});

describe("rankEntry", () => {
	it("ranks by role across species: strength, one ingredient, skill kind; hybrids by their better rank", () => {
		expect(rank(e("Sceptile"))?.category).toBe("strength:grass");
		expect(rank(e("Dragonite"))?.category).toMatch(/^ingredient:/);
		expect(rank(e("Wigglytuff"))?.category).toBe("skill:Energy for Everyone S");
		expect(rank(e("Chansey"))?.category).toMatch(/^(ingredient:|skill:Energy for Everyone S$)/);
	});

	it("ranks ingredient Pokémon for their best ingredient, however little it's worth", () => {
		// Skeledirge: Fancy Apple / Bean Sausage / Fiery Herb. Apples are the cheapest ingredient, but an AAA
		// Skeledirge is compared with other apple gatherers.
		const subs: SubSkillType[] = ["Ingredient Finder M", "Helping Speed M", "Ingredient Finder S"];
		const r = rank(e("Skeledirge", "Quiet", subs, { ingredient: "AAA" }));
		expect(r?.category).toBe("ingredient:apple");
		expect(["S", "A"]).toContain(r?.grade);
		expect(r?.ingredientStrength).toBeGreaterThan(0);
	});

	it("a better build ranks higher, and the grade follows the share", () => {
		const plain = rank(e("Sceptile")) as NonNullable<ReturnType<typeof rank>>;
		const built = rank(e("Sceptile", "Adamant", ["Helping Speed M", "Berry Finding S", "Skill Trigger M", "Helping Bonus", "Helping Speed S"]));
		expect(built?.value).toBeGreaterThan(plain.value);
		expect(built?.better).toBeLessThan(plain.better);
		expect(built?.grade).toBe("S");
	});

	it("the best species' rank is its rarity, exactly", () => {
		const builds: BoxEntry[] = [
			e("Whimsicott", "Quiet", ["Helping Bonus", "Ingredient Finder S", "Skill Trigger S", "Inventory Up M"], { ingredient: "AAA" }),
			e("Whimsicott", "Modest", ["Skill Trigger M", "Ingredient Finder S", "Helping Speed S"], { ingredient: "ABA" }),
			e("Skeledirge", "Docile", ["Ingredient Finder M", "Helping Speed M", "Berry Finding S"], { ingredient: "AAA" }),
			e("Sceptile", "Adamant", ["Helping Speed M", "Berry Finding S", "Skill Trigger M"]),
			e("Sceptile", "Bold", ["Dream Shard Bonus", "Energy Recovery Bonus"]),
			e("Gardevoir", "Calm", ["Skill Trigger M", "Helping Bonus", "Helping Speed S"]),
			e("Sandslash", "Quiet", ["Ingredient Finder M", "Skill Trigger S", "Helping Speed S"], { ingredient: "AAA" }),
		];
		for (const b of builds) {
			const r = rank(b);
			expect(r?.best).toBe(b.pokemonName);
			expect(r?.better).toBeCloseTo(rateEntry(b).better, 9);
		}
	});

	it("compares species: the same nature and subskills rank differently on different Pokémon", () => {
		const subs: SubSkillType[] = ["Ingredient Finder M", "Helping Speed M"];
		// Two apple gatherers (Skeledirge in every slot, Pinsir in its Lv30 and Lv60 slots), same nature and
		// subskills: compared on the same list, they rank differently.
		const a = rank(e("Skeledirge", "Quiet", subs, { ingredient: "AAA" }));
		const b = rank(e("Pinsir", "Quiet", subs, { ingredient: "ABB" }));
		expect(a?.category).toBe("ingredient:apple");
		expect(b?.category).toBe("ingredient:apple");
		expect(a?.best).toBe("Skeledirge");
		expect(b?.best).toBe("Skeledirge");
		expect(a?.better).toBeLessThan(b?.better ?? 0);
	});

	it("doesn't depend on the level entered (always Lv80)", () => {
		expect(rank(e("Sceptile", "Serious", [], { level: 20 }))?.value).toBeCloseTo(rank(e("Sceptile"))?.value ?? 0, 9);
	});
});

describe("with the user's settings", () => {
	it("rarity and rank agree in conditions: with the inventory limit off, a top Skeledirge without Inventory Up ranks S", () => {
		const off = { ...defaultYieldOptions, inventoryLimit: false };
		const tablesOff = buildRankTables(off, defaultStrengthOptions, "test");
		const skeledirge = e(
			"Skeledirge",
			"Docile",
			["Ingredient Finder M", "Berry Finding S", "Helping Speed M", "Ingredient Finder S", "Helping Speed S"],
			{ ingredient: "AAA" },
		);
		expect(rateEntry(skeledirge, off).grade).toBe("S");
		const r = rankEntry(skeledirge, tablesOff, off, defaultStrengthOptions);
		expect(r?.category).toBe("ingredient:apple");
		expect(r?.grade).toBe("S");
		expect(r?.better).toBeCloseTo(rateEntry(skeledirge, off).better, 9);
	}, 60_000);
});

it("Helping Bonus adds the same to an ingredient's rank whatever the roll's combination, as for Rarity", () => {
	const bonusFor = (combo: "AAA" | "ABA" | "ABB") => {
		const problem = ratingProblem(e("Whimsicott", "Serious", [], { ingredient: combo }));
		const subs: SubSkillType[] = ["Helping Bonus", "Helping Speed S", "Skill Trigger S"];
		const detail = problem.detailOf("Serious", subs, combo);
		// The team's part: on top of what the Pokémon gathers itself (which Helping Bonus speeds up too).
		return rankValue(problem, "ingredient:nuts", "Serious", subs, combo, detail) - (detail.total.nuts ?? 0);
	};
	expect(bonusFor("AAA")).toBeGreaterThan(0);
	expect(bonusFor("ABA")).toBeCloseTo(bonusFor("AAA"), 6);
	expect(bonusFor("ABB")).toBeCloseTo(bonusFor("AAA"), 6);
});

describe("hybrids (ingredients + a support skill)", () => {
	const hybrid = e("Blissey", "Serious", [], { ingredient: "AAA" });

	it("are ranked only for their ingredients, with their skill counted as ingredients", () => {
		const problem = ratingProblem(hybrid);
		expect(problem.role).toBe("hybrid");
		const r = rank(hybrid);
		expect(r?.category).toMatch(/^ingredient:/);
		// Its egg value: the eggs it gathers, plus its skill as a share of a plain Gardevoir's Energy for
		// Everyone S, times the eggs a plain Delibird (the best pure egg gatherer) gathers.
		const refs = rankReferences(rankOptions, rankStrengthOptions);
		const detail = problem.detailOf("Serious", []);
		const share = detail.skillValue / (refs.get("skill:Energy for Everyone S") as number);
		const eggs = (detail.total.egg ?? 0) + share * (refs.get("ingredient:egg") as number);
		expect(rankValue(problem, "ingredient:egg", "Serious", [], "AAA", detail)).toBeCloseTo(eggs, 6);
		expect(share).toBeGreaterThan(0.2);
	});

	it("aren't the reference for an ingredient a pure gatherer gathers, nor for a skill", () => {
		const { categories } = tables as RankTables;
		expect(categories["ingredient:egg"].best).not.toMatch(/Blissey|Cramorant/);
		expect(categories["ingredient:soy"].best).toBe("Golem");
		expect(categories["skill:Tasty Chance S"].best).toBe("Dedenne");
	});

	it("leave everyone else's values alone", () => {
		const golem = ratingProblem(e("Golem", "Serious", [], { ingredient: "AAA" }));
		const d = golem.detailOf("Serious", []);
		expect(rankValue(golem, "ingredient:soy", "Serious", [], "AAA", d)).toBeCloseTo(d.total.soy ?? 0, 9);
	});
});

it("doesn't compare anyone with a legendary when a regular Pokémon does the job, but still ranks legendaries", () => {
	const legendary = new Set(pokemons.filter((p) => getPokemonRarity(p) === "legendary").map((p) => p.name));
	const { categories } = tables as RankTables;
	expect(categories["strength:fire"].best).not.toBe("Entei");
	for (const t of Object.values(categories)) expect(legendary.has(t.best)).toBe(false);
	const entei = rank(e("Entei", "Adamant", ["Helping Speed M", "Berry Finding S"], { ingredient: "AAA" }));
	expect(entei?.category).toBe("strength:fire");
	expect(entei?.best).toBe(categories["strength:fire"].best);
});

describe("strength Pokémon whose skill also does a support job", () => {
	it("get that part as strength in slots: only Latias, Cresselia and Lucario", () => {
		const credited: string[] = [];
		for (const p of pokemons.filter((p) => p.isFullyEvolved && getPokemonRarity(p) !== "mythical" && p.frequency > 0)) {
			const problem = ratingProblem(e(p.name, "Serious", [], { ingredient: "AAA" }));
			if (problem.role !== "strength") continue;
			const d = problem.detailOf("Serious", []);
			if (rankValue(problem, `strength:${p.type}`, "Serious", [], "AAA", d) > d.berryStrength + d.skillStrength + 1e-6) {
				credited.push(p.name);
			}
		}
		expect(credited.sort()).toEqual(["Cresselia", "Latias", "Lucario"]);
	});

	it("Latias's energy counts as its share of a plain Slowking's, times a plain Noivern's strength", () => {
		const latias = rank(e("Latias", "Serious", [], { ingredient: "AAA" }));
		expect(latias?.category).toBe("strength:dragon");
		expect(latias?.skillCredit?.best).toBe("Slowking");
		const refs = rankReferences(rankOptions, rankStrengthOptions);
		expect(latias?.skillCredit?.amount).toBeCloseTo((latias?.skillCredit?.share ?? 0) * (refs.get("strength:dragon") as number), 6);
	});
});

it("Heracross (Bulk Up) is a skill Pokémon, ranked with Tasty Chance users by its Extra Tasty plus its random ingredients", () => {
	const heracross = e("Heracross", "Serious", [], { ingredient: "AAA" });
	expect(ratingProblem(heracross).role).toBe("support");
	const r = rank(heracross);
	expect(r?.category).toBe("skill:Tasty Chance S");
	expect(r?.best).toBe("Dedenne");
	// Its random ingredients count as their share of a plain Toxtricity's Ingredient Magnet haul, times a plain Dedenne's Extra Tasty.
	expect(r?.skillCredit?.best).toBe("Toxtricity (Amped)");
	const refs = rankReferences(rankOptions, rankStrengthOptions);
	expect(r?.skillCredit?.amount).toBeCloseTo((r?.skillCredit?.share ?? 0) * (refs.get("skill:Tasty Chance S") as number), 6);
	// Bulk Up's own Extra Tasty: 5% a trigger, half of Tasty Chance S.
	const d = ratingProblem(heracross).detailOf("Serious", []);
	expect(r?.value).toBeCloseTo((d.tasty?.perTrigger ?? 0) * (d.tasty?.triggersPerDay ?? 0) + (r?.skillCredit?.amount ?? 0), 6);
	expect(d.tasty?.perTrigger).toBe(5);
});
