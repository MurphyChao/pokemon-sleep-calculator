import { type BoxEntry } from "./box";
import { bestEnergyTeam, dishStrength, type EnergyMember, type EnergyProblem, resolveMembers, resolveTeam, swapAnalysis, teamEnergy, weightedEnergy, weightedHealSources } from "./energy";
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

test("fractional search beats or matches every 5-member team, within 5 slots, and no random sharing beats it", () => {
	const r = rng(7);
	const problem = { recipe: salad, dishStrength: dishStrength(salad, 20, 0) };
	const ings = ["pumpkin", "potato", "corn", "mushroom", "apple"] as const;
	for (let trial = 0; trial < 30; trial++) {
		const n = 6 + Math.floor(r() * 7);
		const withTasty = trial % 2 === 0;
		const members: EnergyMember[] = Array.from({ length: n }, (_, i) => {
			const y: EnergyMember["yield"] = {};
			for (const ing of ings) if (r() < 0.4) y[ing] = Math.round(r() * 60);
			return {
				id: `m${i}`,
				yield: y,
				berry: Math.round(r() * 8000),
				skill: r() < 0.3 ? Math.round(r() * 5000) : 0,
				...(withTasty && r() < 0.2 && { tasty: { perTrigger: 4 + Math.round(r() * 6), triggersPerDay: r() * 6 } }),
			};
		});
		const pinned = trial % 3 === 0 ? ["m1"] : [];
		const got = bestEnergyTeam(members, problem, pinned);
		expect(got.energy.total).toBeGreaterThanOrEqual(bruteForce(members, problem, pinned) - 1e-6);
		expect(got.slots).toBeLessThanOrEqual(5 + 1e-9);
		for (const share of got.usage.values()) {
			expect(share).toBeGreaterThan(0);
			expect(share).toBeLessThanOrEqual(1 + 1e-9);
		}
		for (const id of pinned) expect(got.usage.get(id)).toBe(1);
		expect(got.energy.total).toBeCloseTo(weightedEnergy(got.entries, problem).total, 6);
		if (!withTasty && pinned.length === 0) {
			// The LP is optimal: random ways of sharing 5 slots never do better.
			for (let k = 0; k < 200; k++) {
				const raw = members.map(() => (r() < 0.5 ? 0 : r()));
				const total = raw.reduce((x, y) => x + y, 0) || 1;
				const shares = raw.map((x) => Math.min(1, (x * 5) / Math.max(5, total)));
				const e = weightedEnergy(
					members.map((member, i) => ({ member, share: shares[i] })),
					problem,
				);
				expect(e.total).toBeLessThanOrEqual(got.energy.total + 1e-6);
			}
		}
	}
});

test("uses half slots when two gatherers are each only half needed: 6 Pokémon in 5 slots", () => {
	const problem = { recipe: { ...salad, ingredients: { pumpkin: 10, potato: 10 } }, dishStrength: 100000 };
	const m = (id: string, berry: number, y: EnergyMember["yield"]): EnergyMember => ({ id, yield: y, berry, skill: 0 });
	const members = [
		m("pumpkin", 0, { pumpkin: 60 }),
		m("potato", 0, { potato: 60 }),
		...[0, 1, 2, 3, 4].map((i) => m(`berry${i}`, 1000, {})),
	];
	const best = bestEnergyTeam(members, problem);
	expect(best.usage.get("pumpkin")).toBeCloseTo(0.5);
	expect(best.usage.get("potato")).toBeCloseTo(0.5);
	expect(best.slots).toBeCloseTo(5);
	expect(best.ids).toHaveLength(6);
	expect(best.energy.coverage).toBeCloseTo(1);
	expect(best.energy.berry).toBeCloseTo(4000);
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
	const otherMembers: EnergyMember[] = [0, 1, 2, 3].map((i) => ({ id: `o${i}`, yield: supply(0.14), berry: 5000, skill: 0 }));
	const others = otherMembers.map((member) => ({ member, share: 1 }));
	const dedenne: EnergyMember = { id: "d", yield: {}, berry: 6852, skill: 0, tasty: { perTrigger: 10, triggersPerDay: 3.23 } };
	const sceptile: EnergyMember = { id: "s", yield: {}, berry: 9580, skill: 17728 };

	test("'never' and 'always' match the fixed teams", () => {
		const a = swapAnalysis(others, dedenne, sceptile, problem);
		if (!a) throw new Error("no analysis");
		const never = a.options[0];
		const always = a.options[a.options.length - 1];
		expect(never.policy.share).toBe(0);
		expect(always.policy.share).toBeCloseTo(1);
		expect(never.energy.total).toBeCloseTo(teamEnergy([...otherMembers, sceptile], problem).total, 3);
		expect(always.energy.total).toBeCloseTo(teamEnergy([...otherMembers, dedenne], problem).total, 3);
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

describe("healers (simulated energy)", () => {
	const problem = { recipe: salad, dishStrength: dishStrength(salad, 30, 0) };
	/** Synthetic member whose output grows with the healing it receives. */
	const member = (id: string, berry: number, y: EnergyMember["yield"], heal?: EnergyMember["heal"]): EnergyMember => {
		const base: EnergyMember = { id, yield: y, berry, skill: 0, ...(heal && { heal }) };
		const at = (h: { count: number; energy: number } | undefined): EnergyMember => {
			const f = 1 + (h ? (h.count * h.energy) / 200 : 0);
			const scaled = Object.fromEntries(Object.entries(y).map(([k, v]) => [k, (v ?? 0) * f]));
			return { ...base, berry: berry * f, yield: scaled, at };
		};
		return { ...base, at };
	};

	test("a weak healer makes the team when its healing is worth more than a stronger member", () => {
		const others = [0, 1, 2, 3].map((i) => member(`o${i}`, 6000, { pumpkin: 10, potato: 15, corn: 9, mushroom: 14 }));
		const healer = member("healer", 1000, {}, { team: 18, self: 0, triggersPerDay: 3 });
		const strong = member("strong", 4000, {});
		const best = bestEnergyTeam([...others, healer, strong], problem);
		expect(best.ids).toContain("healer");
		// The reported team is the healed one.
		expect(best.entries.find((e) => e.member.id === "o0")?.member.berry).toBeGreaterThan(6000);
	});

	test("beats or matches every 5-member team", () => {
		const r = rng(11);
		for (let trial = 0; trial < 15; trial++) {
			const members = Array.from({ length: 8 }, (_, i) =>
				member(
					`m${i}`,
					Math.round(r() * 8000),
					r() < 0.6 ? { pumpkin: r() * 30, potato: r() * 40, corn: r() * 25, mushroom: r() * 35 } : {},
					r() < 0.35 ? { team: r() < 0.5 ? 18 : 3, self: 0, triggersPerDay: 1 + r() * 3 } : undefined,
				),
			);
			let brute = Number.NEGATIVE_INFINITY;
			for (let mask = 0; mask < 1 << 8; mask++) {
				const team = members.filter((_, i) => mask & (1 << i));
				if (team.length !== 5) continue;
				brute = Math.max(brute, teamEnergy(resolveTeam(team), problem).total);
			}
			expect(bestEnergyTeam(members, problem).energy.total).toBeGreaterThanOrEqual(brute - 1e-6);
		}
	});
});

test("the best team is never beaten by 'best 4-slot team without A and B, plus B full time' (many special members)", () => {
	const problem = { recipe: salad, dishStrength: dishStrength(salad, 60, 0) };
	const r = rng(23);
	for (let trial = 0; trial < 12; trial++) {
		const members: EnergyMember[] = Array.from({ length: 12 }, (_, i) => {
			const y: EnergyMember["yield"] = {};
			for (const ing of ["pumpkin", "potato", "corn", "mushroom"] as const) if (r() < 0.35) y[ing] = r() * 90;
			const base: EnergyMember = {
				id: `m${i}`,
				yield: y,
				berry: r() * 9000,
				skill: r() < 0.3 ? r() * 20000 : 0,
				// Five Extra Tasty Pokémon or healers: leaving one out changes how finely the rest are searched.
				...(i < 3 && { tasty: { perTrigger: 6 + Math.round(r() * 4), triggersPerDay: 2 + r() * 3 } }),
				...(i >= 3 && i < 5 && { heal: { team: 12 + r() * 6, self: 0, triggersPerDay: 1 + r() * 4 } }),
			};
			const at = (h: { count: number; energy: number } | undefined): EnergyMember => {
				const f = 1 + (h ? (h.count * h.energy) / 300 : 0);
				return {
					...base,
					berry: base.berry * f,
					skill: base.skill * f,
					yield: Object.fromEntries(Object.entries(y).map(([k, v]) => [k, (v ?? 0) * f])),
					at,
				};
			};
			return { ...base, at };
		});
		const best = bestEnergyTeam(members, problem);
		const raw = (id: string) => members.find((m) => m.id === id) as EnergyMember;
		for (let ai = 0; ai < 5; ai++) {
			for (const bi of [6, 9]) {
				const rest = bestEnergyTeam(members, problem, [], [members[ai].id, members[bi].id], 4);
				const team = [
					...rest.entries.map((x) => ({ member: raw(x.member.id), share: x.share })),
					{ member: members[bi], share: 1 },
				];
				const heals = weightedHealSources(team);
				const resolved = team.map((x) => ({ member: resolveMembers([x.member], heals)[0], share: x.share }));
				expect(weightedEnergy(resolved, problem).total).toBeLessThanOrEqual(best.energy.total + 1e-6);
			}
		}
	}
});
