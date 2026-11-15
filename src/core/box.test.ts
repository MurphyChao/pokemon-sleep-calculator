import { type BoxEntry, evolveToFinal, maxSubSkillSeeds, nextSubSkill, scaleLevels } from "./box";

const e = (pokemonName: string, extra: Partial<BoxEntry> = {}): BoxEntry => ({
	id: pokemonName,
	pokemonName,
	level: 30,
	ingredient: "AAA",
	nature: "Serious",
	subSkills: {},
	...extra,
});

describe("evolveToFinal", () => {
	it("evolves to the final form, raising the skill level once per evolution", () => {
		const [venusaur] = evolveToFinal([e("Bulbasaur", { skillLevel: 2 })], true);
		expect(venusaur).toMatchObject({ pokemonName: "Venusaur", skillLevel: 4, evolvedFrom: "Bulbasaur" });
		expect(evolveToFinal([e("Ivysaur", { skillLevel: 2 })], true)[0]).toMatchObject({ pokemonName: "Venusaur", skillLevel: 3 });
	});

	it("leaves final forms, Pokémon that don't evolve and the box itself alone", () => {
		const box = [e("Venusaur"), e("Darkrai")];
		expect(evolveToFinal(box, true)).toEqual(box);
		const unevolved = [e("Bulbasaur")];
		expect(evolveToFinal(unevolved, false)).toBe(unevolved);
	});

	it("caps the skill level at the evolved skill's maximum", () => {
		const [evolved] = evolveToFinal([e("Bulbasaur", { skillLevel: 99 })], true);
		expect(evolved.skillLevel).toBeLessThan(99);
	});

	it("evolves Toxel by nature but leaves branching lines alone", () => {
		expect(evolveToFinal([e("Toxel", { nature: "Hardy" })], true)[0].pokemonName).toBe("Toxtricity (Amped)");
		expect(evolveToFinal([e("Toxel", { nature: "Calm" })], true)[0].pokemonName).toBe("Toxtricity (Low Key)");
		const branching = [e("Eevee"), e("Ralts"), e("Kirlia")];
		expect(evolveToFinal(branching, true)).toEqual(branching);
	});

	it("combines with level scaling", () => {
		const [x] = scaleLevels(evolveToFinal([e("Bulbasaur", { level: 10 })], true), 50);
		expect(x).toMatchObject({ pokemonName: "Venusaur", level: 50, scaledFrom: 10, evolvedFrom: "Bulbasaur" });
	});
});

describe("maxSubSkillSeeds", () => {
	const seeded = (level: number, subSkills: BoxEntry["subSkills"]) =>
		maxSubSkillSeeds([e("Pikachu", { level, subSkills })], true)[0].subSkills;

	it("knows the upgrade paths", () => {
		expect(nextSubSkill("Helping Speed S")).toBe("Helping Speed M");
		expect(nextSubSkill("Inventory Up M")).toBe("Inventory Up L");
		expect(nextSubSkill("Inventory Up L")).toBeUndefined();
		expect(nextSubSkill("Berry Finding S")).toBeUndefined(); // no Berry Finding M
		expect(nextSubSkill("Skill Level Up M")).toBeUndefined();
		expect(nextSubSkill("Helping Bonus")).toBeUndefined();
	});

	it("upgrades unlocked subskills as far as they go", () => {
		expect(seeded(60, { lv10: "Helping Speed S", lv25: "Ingredient Finder S", lv50: "Inventory Up S" })).toEqual({
			lv10: "Helping Speed M",
			lv25: "Ingredient Finder M",
			lv50: "Inventory Up L",
		});
	});

	it("never upgrades into a subskill the Pokémon already has", () => {
		expect(seeded(60, { lv10: "Helping Speed S", lv25: "Helping Speed M" })).toEqual({
			lv10: "Helping Speed S",
			lv25: "Helping Speed M",
		});
		// Inventory Up M goes to L first, which frees M for the S.
		expect(seeded(60, { lv10: "Inventory Up S", lv25: "Inventory Up M" })).toEqual({
			lv10: "Inventory Up M",
			lv25: "Inventory Up L",
		});
	});

	it("only upgrades unlocked slots, but counts locked ones as already had", () => {
		// Lv30: the Lv50 slot is locked, and its Helping Speed M blocks the Lv10 upgrade.
		expect(seeded(30, { lv10: "Helping Speed S", lv25: "Skill Trigger S", lv50: "Helping Speed M" })).toEqual({
			lv10: "Helping Speed S",
			lv25: "Skill Trigger M",
			lv50: "Helping Speed M",
		});
		expect(seeded(20, { lv10: "Helping Speed S", lv25: "Skill Trigger S" })).toEqual({
			lv10: "Helping Speed M",
			lv25: "Skill Trigger S",
		});
	});

	it("records what changed, leaves unchanged entries and the box alone", () => {
		const [x] = maxSubSkillSeeds([e("Pikachu", { level: 60, subSkills: { lv10: "Inventory Up S" } })], true);
		expect(x.seededFrom).toEqual({ lv10: "Inventory Up S" });
		const gold = [e("Pikachu", { level: 60, subSkills: { lv10: "Helping Bonus" } })];
		expect(maxSubSkillSeeds(gold, true)[0]).toBe(gold[0]);
		expect(maxSubSkillSeeds(gold, false)).toBe(gold);
	});

	it("unlocks slots by the scaled level", () => {
		const box = scaleLevels([e("Pikachu", { level: 10, subSkills: { lv10: "Helping Speed S", lv50: "Skill Trigger S" } })], 50);
		expect(maxSubSkillSeeds(box, true)[0].subSkills).toEqual({ lv10: "Helping Speed M", lv50: "Skill Trigger M" });
	});
});
