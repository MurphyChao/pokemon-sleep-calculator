import { type BoxEntry } from "./box";
import { bestEnergyTeam, dishStrength, type EnergyMember, type EnergyProblem, swapAnalysis, teamEnergy } from "./energy";
import { type Recipe, recipes } from "./recipes";
import { dailyIngredientYieldDetail } from "./yield";

const salad = recipes.find((r) => r.id === "scald_chunky_salad") as Recipe;

test("dish strength: base ingredient strength × recipe bonus × recipe level × field bonus", () => {
	// 20 pumpkin, 30 potato, 18 corn, 27 mushroom; bonus 61%.
	const base = 20 * 250 + 30 * 124 + 18 * 140 + 27 * 167;
	expect(dishStrength(salad, 1, 0)).toBeCloseTo(base * 1.61);
	// Recipe level 30: +61%. Field bonus 50%.
	expect(dishStrength(salad, 30, 50)).toBeCloseTo(base * 1.61 * 1.61 * 1.5);
});

test("coverage is the scarcest ingredient's share, capped at 1", () => {
	const problem = { recipe: salad, dishStrength: 1000 };
	const half: EnergyMember = {
		id: "a",
		yield: { pumpkin: 30, potato: 45, corn: 27, mushroom: 40.5 },
		berry: 100,
		skill: 50,
	};
	const e = teamEnergy([half], problem);
	expect(e.coverage).toBeCloseTo(0.5);
	expect(e.total).toBeCloseTo(150 + 3 * 0.5 * 1000 * e.tastyMultiplier);
	const twice = teamEnergy([half, { ...half, id: "b" }, { ...half, id: "c" }], problem);
	expect(twice.coverage).toBe(1);
});

/** Deterministic pseudo-random numbers. */
function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) % 2147483648;
		return s / 2147483648;
	};
}

function bruteForce(members: EnergyMember[], problem: EnergyProblem, pinned: string[]) {
	let best = Number.NEGATIVE_INFINITY;
	const n = members.length;
	for (let mask = 0; mask < 1 << n; mask++) {
		const team = members.filter((_, i) => mask & (1 << i));
		if (team.length !== Math.min(5, n)) continue;
		if (!pinned.every((id) => team.some((m) => m.id === id))) continue;
		best = Math.max(best, teamEnergy(team, problem).total);
	}
	return best;
}

test("pruned exhaustive search matches brute force on random boxes", () => {
	const r = rng(7);
	const problem = { recipe: salad, dishStrength: dishStrength(salad, 20, 0) };
	const ings = ["pumpkin", "potato", "corn", "mushroom", "apple"] as const;
	for (let trial = 0; trial < 30; trial++) {
		const n = 6 + Math.floor(r() * 7);
		const members: EnergyMember[] = Array.from({ length: n }, (_, i) => {
			const y: EnergyMember["yield"] = {};
			for (const ing of ings) if (r() < 0.4) y[ing] = Math.round(r() * 60);
			return {
				id: `m${i}`,
				yield: y,
				berry: Math.round(r() * 8000),
				skill: r() < 0.3 ? Math.round(r() * 5000) : 0,
				...(r() < 0.2 && { tasty: { perTrigger: 4 + Math.round(r() * 6), triggersPerDay: r() * 6 } }),
			};
		});
		// Some exact duplicates, to exercise tie-breaking in the pruning.
		members.push({ ...members[0], id: "dup" });
		const pinned = trial % 3 === 0 ? ["m1"] : [];
		const got = bestEnergyTeam(members, problem, pinned);
		expect(got.exact).toBe(true);
		expect(got.energy.total).toBeCloseTo(bruteForce(members, problem, pinned), 6);
		for (const id of pinned) expect(got.ids).toContain(id);
	}
});

test("excluded members are never picked; small boxes use everyone", () => {
	const problem = { recipe: salad, dishStrength: 5000 };
	const m = (id: string, berry: number): EnergyMember => ({ id, yield: {}, berry, skill: 0 });
	const members = [m("a", 1), m("b", 2), m("c", 3)];
	expect(bestEnergyTeam(members, problem).ids.sort()).toEqual(["a", "b", "c"]);
	expect(bestEnergyTeam(members, problem, [], ["b"]).ids.sort()).toEqual(["a", "c"]);
});

test("favorite berries double berry strength; ingredient skills add no skill strength", () => {
	const e: BoxEntry = { id: "x", pokemonName: "Sandslash", level: 60, ingredient: "ABC", nature: "Serious", subSkills: {} };
	const none = dailyIngredientYieldDetail(e);
	const fav = dailyIngredientYieldDetail(e, undefined, { favorites: ["ground", "fire", "rock"], fieldBonus: 0 });
	const other = dailyIngredientYieldDetail(e, undefined, { favorites: ["water", "fire", "rock"], fieldBonus: 0 });
	expect(none.berryStrength).toBeGreaterThan(0);
	expect(fav.berryStrength).toBeCloseTo(2 * none.berryStrength, 0);
	expect(other.berryStrength).toBeCloseTo(none.berryStrength);
	// Sandslash's Ingredient Draw goes into the dish, not the skill column.
	expect(none.skillStrength).toBe(0);

	const raichu = dailyIngredientYieldDetail({ ...e, pokemonName: "Raichu", ingredient: "AAA" });
	expect(raichu.skillStrength).toBeGreaterThan(0); // Charge Strength S
});

describe("swapAnalysis", () => {
	const problem = { recipe: salad, dishStrength: dishStrength(salad, 50, 0) };
	const supply = (f: number) => ({ pumpkin: 60 * f, potato: 90 * f, corn: 54 * f, mushroom: 81 * f });
	const others: EnergyMember[] = [0, 1, 2, 3].map((i) => ({ id: `o${i}`, yield: supply(0.14), berry: 5000, skill: 0 }));
	const dedenne: EnergyMember = { id: "d", yield: {}, berry: 6852, skill: 0, tasty: { perTrigger: 10, triggersPerDay: 3.23 } };
	const sceptile: EnergyMember = { id: "s", yield: {}, berry: 9580, skill: 17728 };

	test("'never' and 'always' match the fixed teams", () => {
		const a = swapAnalysis(others, dedenne, sceptile, problem);
		if (!a) throw new Error("no analysis");
		const never = a.options[0];
		const always = a.options[a.options.length - 1];
		expect(never.policy.share).toBe(0);
		expect(always.policy.share).toBeCloseTo(1);
		expect(never.energy.total).toBeCloseTo(teamEnergy([...others, sceptile], problem).total, 3);
		expect(always.energy.total).toBeCloseTo(teamEnergy([...others, dedenne], problem).total, 3);
	});

	test("swapping by bonus beats both fixed choices when they are close", () => {
		const a = swapAnalysis(others, dedenne, sceptile, problem);
		if (!a) throw new Error("no analysis");
		const fixedBest = Math.max(a.options[0].energy.total, a.options[a.options.length - 1].energy.total);
		expect(a.best.energy.total).toBeGreaterThan(fixedBest);
		expect(a.best.policy.share).toBeGreaterThan(0);
		expect(a.best.policy.share).toBeLessThan(1);
	});

	test("no analysis without an Extra Tasty Pokémon", () => {
		expect(swapAnalysis(others, sceptile, dedenne, problem)).toBeUndefined();
	});
});
