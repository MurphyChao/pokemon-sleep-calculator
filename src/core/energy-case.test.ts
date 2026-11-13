/**
 * Regression case from a real box (Apple Acid Yogurt-Dressed Salad, recipe level 60, simulated energy,
 * sleep score 100, no inventory limit, Good Camp Ticket). It has five Extra Tasty Pokémon and healers:
 * the solver used to try them only at 0 or a full slot and missed a team the Swap partner card found.
 */
import type { BoxEntry } from "./box";
import { bestEnergyTeam, dishStrength, type EnergyMember, resolveMembers, weightedEnergy, weightedHealSources } from "./energy";
import { type Recipe, recipes } from "./recipes";
import { dailyIngredientYieldDetail, type Heal, soloYieldDetail, type YieldDetail } from "./yield";

const box = [
	{"id": "p0", "pokemonName": "Sandslash", "level": 50, "ingredient": "AAA", "nature": "Serious", "subSkills": {"lv10": "Ingredient Finder M", "lv25": "Helping Speed M", "lv50": "Skill Trigger S", "lv70": "Ingredient Finder S", "lv80": "Skill Trigger M"}, "skillLevel": 7},
	{"id": "p1", "pokemonName": "Crustle", "level": 70, "ingredient": "AAC", "nature": "Naughty", "subSkills": {"lv10": "Energy Recovery Bonus", "lv25": "Skill Trigger M", "lv50": "Ingredient Finder M", "lv70": "Helping Speed M", "lv80": "Inventory Up S"}, "skillLevel": 7},
	{"id": "p2", "pokemonName": "Crustle", "level": 70, "ingredient": "ABC", "nature": "Gentle", "subSkills": {"lv10": "Helping Bonus", "lv25": "Helping Speed M", "lv50": "Inventory Up S", "lv70": "Skill Trigger M", "lv80": "Inventory Up L"}, "skillLevel": 7},
	{"id": "p3", "pokemonName": "Crustle", "level": 70, "ingredient": "AAB", "nature": "Quiet", "subSkills": {"lv10": "Ingredient Finder M", "lv25": "Helping Speed M", "lv50": "Skill Trigger M", "lv70": "Research EXP Bonus", "lv80": "Inventory Up L"}, "skillLevel": 7},
	{"id": "p4", "pokemonName": "Crustle", "level": 70, "ingredient": "ABC", "nature": "Quiet", "subSkills": {"lv10": "Helping Bonus", "lv25": "Skill Trigger M", "lv50": "Helping Speed M", "lv70": "Inventory Up M", "lv80": "Dream Shard Bonus"}, "skillLevel": 7},
	{"id": "p5", "pokemonName": "Crustle", "level": 70, "ingredient": "ABB", "nature": "Serious", "subSkills": {"lv10": "Research EXP Bonus", "lv25": "Ingredient Finder M", "lv50": "Skill Trigger M", "lv70": "Helping Speed M", "lv80": "Helping Speed S"}, "skillLevel": 7},
	{"id": "p6", "pokemonName": "Flygon", "level": 60, "ingredient": "AAA", "nature": "Quiet", "subSkills": {"lv10": "Inventory Up M", "lv25": "Dream Shard Bonus", "lv50": "Helping Speed M", "lv70": "Inventory Up S"}, "skillLevel": 3},
	{"id": "p7", "pokemonName": "Meowscarada", "level": 60, "ingredient": "AAA", "nature": "Naughty", "subSkills": {"lv10": "Berry Finding S", "lv25": "Skill Trigger M", "lv50": "Ingredient Finder M", "lv70": "Inventory Up S"}, "skillLevel": 3},
	{"id": "p8", "pokemonName": "Blastoise", "level": 50, "ingredient": "AAA", "nature": "Mild", "subSkills": {"lv10": "Sleep EXP Bonus", "lv25": "Helping Speed M", "lv50": "Skill Level Up S", "lv70": "Skill Level Up M", "lv80": "Ingredient Finder M"}, "skillLevel": 3},
	{"id": "p9", "pokemonName": "Ditto", "level": 70, "ingredient": "AAA", "nature": "Naive", "subSkills": {"lv10": "Ingredient Finder M", "lv25": "Skill Trigger M", "lv50": "Helping Speed M", "lv70": "Ingredient Finder S", "lv80": "Inventory Up L"}, "skillLevel": 1},
	{"id": "p10", "pokemonName": "Cramorant", "level": 30, "ingredient": "AAA", "nature": "Sassy", "subSkills": {"lv10": "Helping Speed M", "lv25": "Inventory Up S", "lv50": "Dream Shard Bonus", "lv70": "Skill Trigger M", "lv80": "Ingredient Finder S"}, "skillLevel": 6},
	{"id": "p11", "pokemonName": "Torterra", "level": 50, "ingredient": "ABA", "nature": "Gentle", "subSkills": {"lv10": "Helping Bonus", "lv25": "Skill Trigger M", "lv50": "Skill Level Up M", "lv70": "Inventory Up M", "lv80": "Inventory Up L"}, "skillLevel": 6},
	{"id": "p12", "pokemonName": "Chansey", "level": 59, "ingredient": "AAA", "nature": "Mild", "subSkills": {"lv10": "Skill Trigger M", "lv25": "Inventory Up S", "lv50": "Ingredient Finder M", "lv70": "Inventory Up L", "lv80": "Helping Speed S"}, "skillLevel": 5},
	{"id": "p13", "pokemonName": "Skeledirge", "level": 30, "ingredient": "AAA", "nature": "Lonely", "subSkills": {"lv10": "Berry Finding S", "lv25": "Dream Shard Bonus", "lv50": "Ingredient Finder M", "lv70": "Helping Speed M", "lv80": "Helping Speed S"}, "skillLevel": 3},
	{"id": "p14", "pokemonName": "Victreebel", "level": 30, "ingredient": "AAC", "nature": "Mild", "subSkills": {"lv10": "Dream Shard Bonus", "lv25": "Ingredient Finder S", "lv50": "Inventory Up M", "lv70": "Inventory Up S", "lv80": "Helping Speed S"}, "skillLevel": 2},
	{"id": "p15", "pokemonName": "Dedenne", "level": 34, "ingredient": "ABA", "nature": "Adamant", "subSkills": {"lv10": "Skill Trigger M", "lv25": "Inventory Up M", "lv50": "Helping Speed M", "lv70": "Inventory Up S", "lv80": "Skill Level Up M"}, "skillLevel": 6},
	{"id": "p16", "pokemonName": "Dedenne", "level": 25, "ingredient": "ABA", "nature": "Impish", "subSkills": {"lv10": "Skill Trigger M", "lv25": "Skill Level Up M", "lv50": "Skill Trigger S", "lv70": "Ingredient Finder S", "lv80": "Helping Bonus"}, "skillLevel": 6},
	{"id": "p17", "pokemonName": "Sceptile", "level": 69, "ingredient": "AAC", "nature": "Careful", "subSkills": {"lv10": "Berry Finding S", "lv25": "Sleep EXP Bonus", "lv50": "Helping Speed M", "lv70": "Skill Trigger M", "lv80": "Ingredient Finder S"}, "skillLevel": 6},
] as BoxEntry[];

const options = { inventoryLimit: false, campTicket: true, energy: "simulated" as const, sleepScore: 100 };
const strength = { favorites: "none" as const, fieldBonus: 0 };

/** Members as the Energy solver page builds them, with healing recomputed on demand. */
function buildMembers(): EnergyMember[] {
	const solo = new Map(box.map((e) => [e.id, soloYieldDetail(e, options, strength)]));
	const cache = new Map<string, YieldDetail>();
	const healed = (e: BoxEntry, heal: Heal | undefined) => {
		const key = heal ? `${e.id}|${heal.count}|${heal.energy.toFixed(3)}` : e.id;
		let d = cache.get(key);
		if (!d) {
			d = { ...dailyIngredientYieldDetail(e, options, strength, heal), heal: solo.get(e.id)?.heal };
			cache.set(key, d);
		}
		return d;
	};
	const toMember = (e: BoxEntry, d: YieldDetail): EnergyMember => {
		const m: EnergyMember = {
			id: e.id,
			yield: d.total,
			berry: d.berryStrength,
			skill: d.skillStrength,
			...(d.tasty && { tasty: d.tasty }),
			...(d.heal && { heal: d.heal }),
		};
		m.at = (h) => toMember(e, healed(e, h));
		return m;
	};
	return box.map((e) => toMember(e, solo.get(e.id) as YieldDetail));
}

test("best team beats 'best 4 slots without Dedenne and Sceptile, plus Sceptile full time'", () => {
	const recipe = recipes.find((r) => r.id === "apple_acid_yogurt_dressed_salad") as Recipe;
	const problem = { recipe, dishStrength: dishStrength(recipe, 60, 0) };
	const members = buildMembers();
	const best = bestEnergyTeam(members, problem);
	expect(best.slots).toBeLessThanOrEqual(5 + 1e-9);

	const dedenne = "p15";
	const sceptile = "p17";
	const rest = bestEnergyTeam(members, problem, [], [dedenne, sceptile], 4);
	const raw = (id: string) => members.find((m) => m.id === id) as EnergyMember;
	const team = [...rest.entries.map((x) => ({ member: raw(x.member.id), share: x.share })), { member: raw(sceptile), share: 1 }];
	const heals = weightedHealSources(team);
	const alwaysSceptile = weightedEnergy(
		team.map((x) => ({ member: resolveMembers([x.member], heals)[0], share: x.share })),
		problem,
	).total;
	expect(alwaysSceptile).toBeLessThanOrEqual(best.energy.total + 1e-6);
});
