/**
 * Builds the comparison population of the cross-species rank (src/core/rank.ts) into
 * src/data/rank-tables.json: for every non-mythical fully evolved Pokémon and each category it's ranked in,
 * random rolls (an ingredient combination, among those including the ingredient for an ingredient category; a
 * nature and 5 different subskills; each equally likely; the same number per species and category) are
 * measured with the rank's conditions (Lv80, Sub Skill Seeds, skill rule, standard settings), and each
 * category's values are stored as quantiles.
 *
 * Run after syncing new Pokémon from upstream or changing how the rank measures: npm run build-rank-tables
 * Runs the app's TypeScript through Vite's module loader, so it uses exactly the app's code.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src/data/rank-tables.json");
/** Random rolls per species and category. */
const rollsPerSpecies = 600;
/** Quantiles stored per category (0%, 0.25%, …, 100%). */
const quantiles = 401;

const server = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
	const load = (path) => server.ssrLoadModule(path);
	const { default: pokemons, getPokemonRarity } = await load("/src/vendor/pokesleep-tool/data/pokemons.ts");
	const { default: Nature } = await load("/src/vendor/pokesleep-tool/util/Nature.ts");
	const { default: SubSkill } = await load("/src/vendor/pokesleep-tool/util/SubSkill.ts");
	const { ratingProblem } = await load("/src/core/rating.ts");
	const { rankCategories, rankOptions, rankStrengthOptions, rankValue } = await load("/src/core/rank.ts");

	// Same deterministic generator as the rating's samples (mulberry32), so the tables are reproducible.
	let a = 20261118 >>> 0;
	const random = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const pick = (list) => list[Math.floor(random() * list.length)];

	const natures = Nature.allNatures.map((n) => n.name);
	const subSkills = SubSkill.allSubSkillNames;
	const species = pokemons.filter((p) => p.isFullyEvolved && getPokemonRarity(p) !== "mythical" && p.frequency > 0);
	/** Values by category, and the species seen in each. */
	const values = new Map();
	const speciesIn = new Map();
	const started = Date.now();
	for (const p of species) {
		const problems = new Map();
		const problemFor = (combo) => {
			let problem = problems.get(combo);
			if (!problem) {
				problem = ratingProblem(
					{ id: "", pokemonName: p.name, level: 80, ingredient: combo, nature: "Serious", subSkills: {} },
					rankOptions,
					rankStrengthOptions,
				);
				problems.set(combo, problem);
			}
			return problem;
		};
		for (const { category, combos } of rankCategories(problemFor("AAA"), p)) {
			if (!values.has(category)) {
				values.set(category, []);
				speciesIn.set(category, new Set());
			}
			for (let i = 0; i < rollsPerSpecies; i++) {
				const combo = pick(combos);
				const pool = [...subSkills];
				const roll = [];
				while (roll.length < 5) roll.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
				values.get(category).push(rankValue(problemFor(combo), category, pick(natures), roll, combo));
			}
			speciesIn.get(category).add(p.name);
		}
	}

	const round = (v) => Number(v.toPrecision(4));
	const categories = {};
	for (const [category, list] of [...values].sort((x, y) => x[0].localeCompare(y[0]))) {
		list.sort((x, y) => x - y);
		const q = Array.from({ length: quantiles }, (_, i) => round(list[Math.round((i / (quantiles - 1)) * (list.length - 1))]));
		categories[category] = { count: list.length, species: speciesIn.get(category).size, q };
	}
	const note =
		`${quantiles} quantiles per category of ${rollsPerSpecies} random rolls per non-mythical fully evolved Pokémon ` +
		"and category (Lv80, Sub Skill Seeds, standard settings); made by scripts/build-rank-tables.mjs";
	writeFileSync(out, `${JSON.stringify({ note, categories })}\n`);
	for (const [category, t] of Object.entries(categories)) {
		console.log(`${category.padEnd(40)} ${String(t.species).padStart(3)} species  median ${t.q[(quantiles - 1) / 2]}`);
	}
	console.log(`${species.length} species, ${((Date.now() - started) / 1000).toFixed(0)} s → ${out}`);
} finally {
	await server.close();
}
