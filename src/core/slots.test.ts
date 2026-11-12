import {
	achievableDemand,
	autoTeam,
	benchScores,
	type Member,
	minSlots,
	savingsVsBestWithout,
	simplexMax,
} from "./slots";

const demand = { pumpkin: 60, potato: 90, corn: 54, mushroom: 81 };

test("simplexMax solves a textbook LP", () => {
	// max 3x + 5y, x ≤ 4, 2y ≤ 12, 3x + 2y ≤ 18 → x=2, y=6, value 36
	expect(simplexMax([3, 5], [[1, 0], [0, 2], [3, 2]], [4, 12, 18], 2).value).toBeCloseTo(36);
});

describe("minSlots", () => {
	test("each Pokémon is used at most once", () => {
		const box: Member[] = [
			{ id: "spirit", yield: { mushroom: 45 } },
			{ id: "amoon", yield: { mushroom: 45 } },
		];
		const r = minSlots(box, { mushroom: 81 });
		expect(r.slots).toBeCloseTo(81 / 45); // 1.8: one fully, the other at 80%
		expect([...r.usage.values()].sort()).toEqual([expect.closeTo(0.8), expect.closeTo(1)]);
	});

	test("infinite when the members cannot cover the demand", () => {
		expect(minSlots([{ id: "spirit", yield: { mushroom: 45 } }], { mushroom: 81 }).slots).toBe(
			Number.POSITIVE_INFINITY,
		);
	});

	test("generalist plus partial specialists can need more members than ingredients", () => {
		// The user's Sandslash case: the generalist covers 3 kinds partially, so 4 others are still needed.
		const box: Member[] = [
			{ id: "gen", yield: { pumpkin: 30, potato: 45, corn: 27 } },
			{ id: "pumpkin", yield: { pumpkin: 40 } },
			{ id: "potato", yield: { potato: 60 } },
			{ id: "corn", yield: { corn: 40 } },
			{ id: "mushroom1", yield: { mushroom: 45 } },
			{ id: "mushroom2", yield: { mushroom: 45 } },
		];
		const r = minSlots(box, demand);
		// gen 1 + pumpkin 30/40 + potato 45/60 + corn 27/40 + mushroom 1.8
		expect(r.slots).toBeCloseTo(1 + 0.75 + 0.75 + 0.675 + 1.8);
		expect([...r.usage.values()].filter((u) => u > 0)).toHaveLength(6);
	});

	test("pinned members take a whole slot and their yield counts", () => {
		const box: Member[] = [
			{ id: "berry", yield: {} },
			{ id: "corn", yield: { corn: 54 } },
		];
		const r = minSlots(box, { corn: 27 }, ["berry"]);
		expect(r.slots).toBeCloseTo(1.5);
		expect(r.usage.get("berry")).toBe(1);
	});
});

describe("achievableDemand", () => {
	test("caps demand at what the whole box can gather", () => {
		const r = achievableDemand([{ id: "spirit", yield: { mushroom: 45 } }], { mushroom: 81 });
		expect(r.demand.mushroom).toBe(45);
		expect(r.shortfall.mushroom).toBe(36);
	});
});

describe("autoTeam and benchScores", () => {
	const box: Member[] = [
		{ id: "pumpkin", yield: { pumpkin: 40 } },
		{ id: "pumpkin2", yield: { pumpkin: 40 } },
		{ id: "potato", yield: { potato: 60 } },
		{ id: "potato2", yield: { potato: 60 } },
		{ id: "corn", yield: { corn: 54 } },
		{ id: "mushroom", yield: { mushroom: 81 } },
		{ id: "gen", yield: { pumpkin: 20, potato: 30 } },
		{ id: "weak", yield: { corn: 1 } },
	];

	test("auto team uses the generalist when it beats specialists per slot, and skips useless members", () => {
		const strongBox: Member[] = [...box.slice(0, 6), { id: "gen", yield: { pumpkin: 30, potato: 45 } }, box[7]];
		const team = autoTeam(strongBox, demand);
		expect(team).toContain("gen");
		expect(team).not.toContain("weak");
	});

	test("bench reduction: adding the generalist to a specialist team", () => {
		const team = ["pumpkin", "pumpkin2", "potato", "potato2", "corn", "mushroom"];
		// Without gen: 1.5 pumpkin + 1.5 potato + 1 + 1 = 5. With gen: 1 + 1 + 1 + 1 + 1 = 5 → saves 0.
		const scores = benchScores(box, team, [], demand);
		const gen = scores.find((s) => s.id === "gen");
		expect(gen?.reduction).toBeCloseTo(0);
		expect(scores.find((s) => s.id === "weak")?.reduction).toBeCloseTo(0);
	});

	test("bench reduction when the generalist beats the specialists per slot", () => {
		const strongBox: Member[] = [...box.slice(0, 6), { id: "gen", yield: { pumpkin: 30, potato: 45 } }];
		const team = ["pumpkin", "pumpkin2", "potato", "potato2", "corn", "mushroom"];
		const gen = benchScores(strongBox, team, [], demand).find((s) => s.id === "gen");
		// With gen: gen 1 + pumpkin 30/40 + potato 45/60 + 2 = 4.5 → saves 0.5 and drops the second copies.
		expect(gen?.reduction).toBeCloseTo(0.5);
		expect(gen?.replaces.length).toBeGreaterThan(0);
	});

	test("a bench Pokémon that makes the dish possible ranks first", () => {
		const team = ["pumpkin", "potato", "potato2", "corn", "mushroom"]; // pumpkin only 40/60
		const scores = benchScores(box, team, [], demand);
		expect(scores[0].reduction).toBe(Number.POSITIVE_INFINITY);
		expect(["pumpkin2", "gen"]).toContain(scores[0].id);
	});
});

describe("savingsVsBestWithout", () => {
	const box: Member[] = [
		{ id: "pumpkin", yield: { pumpkin: 40 } },
		{ id: "pumpkin2", yield: { pumpkin: 40 } },
		{ id: "potato", yield: { potato: 60 } },
		{ id: "potato2", yield: { potato: 60 } },
		{ id: "corn", yield: { corn: 54 } },
		{ id: "mushroom", yield: { mushroom: 81 } },
		{ id: "gen", yield: { pumpkin: 30, potato: 45 } },
	];

	test("generalist saves 0.5 slots against the best team without it", () => {
		// Without gen: 1.5 + 1.5 + 1 + 1 = 5. With gen: 1 + 0.75 + 0.75 + 1 + 1 = 4.5.
		const s = savingsVsBestWithout(box, demand, [], ["gen", "pumpkin2"]);
		expect(s.get("gen")).toBeCloseTo(0.5);
		// The second pumpkin specialist is not needed once gen is available.
		expect(s.get("pumpkin2")).toBeCloseTo(0);
	});

	test("infinite when the box cannot cover the dish without it", () => {
		expect(savingsVsBestWithout(box, demand, [], ["mushroom"]).get("mushroom")).toBe(Number.POSITIVE_INFINITY);
	});
});
