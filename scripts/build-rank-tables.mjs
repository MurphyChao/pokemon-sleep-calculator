/**
 * Builds the comparison population of the cross-species rank (src/core/rank.ts) for the app's default
 * settings into src/data/rank-tables.json, so ranks with those settings show up instantly. For other settings
 * the browser builds the same population itself (ui/useRankTables.ts), with the same code but fewer rolls.
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
const rolls = 600;

const server = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
	const { buildRankTables, rankOptions, rankStrengthOptions } = await server.ssrLoadModule("/src/core/rank.ts");
	const started = Date.now();
	const note = `${rolls} random rolls per non-mythical fully evolved Pokémon and category, default settings; made by scripts/build-rank-tables.mjs`;
	const tables = buildRankTables(rankOptions, rankStrengthOptions, rolls, note);
	writeFileSync(out, `${JSON.stringify(tables)}\n`);
	for (const [category, t] of Object.entries(tables.categories)) {
		console.log(`${category.padEnd(40)} ${String(t.species).padStart(3)} species  median ${t.q[(t.q.length - 1) / 2]}`);
	}
	console.log(`${((Date.now() - started) / 1000).toFixed(1)} s → ${out}`);
} finally {
	await server.close();
}
