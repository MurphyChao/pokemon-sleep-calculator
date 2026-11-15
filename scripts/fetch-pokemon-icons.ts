/**
 * Downloads the Scarlet/Violet box icon of every Pokémon in the vendored pokesleep-tool data from
 * pokemondb.net into src/data/pokemon-icons/ (only the ones not there yet), cropped to the Pokémon
 * and padded to a square so icons fill a table cell evenly. Run after syncing new
 * Pokémon from upstream: `npm run fetch-pokemon-icons`.
 *
 * pokemondb.net: "official Pokémon artwork and sprites are not our creations and are used under a
 * Fair Use Policy, so you are free to use them however you like" (pokemondb.net/about). The images
 * are © Nintendo/Game Freak.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { pokemonIconSlug } from "../src/data/pokemonIconSlug.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src/data/pokemon-icons");
const pokemon = JSON.parse(readFileSync(join(root, "src/vendor/pokesleep-tool/data/pokemon.json"), "utf8")) as {
	name: string;
}[];

/** Crops away the transparent margin (the icons sit low in a 120×112 canvas) and centers the result in a square. */
function trimToSquare(data: Buffer): Buffer {
	const src = PNG.sync.read(data);
	let [x0, y0, x1, y1] = [src.width, src.height, -1, -1];
	for (let y = 0; y < src.height; y++) {
		for (let x = 0; x < src.width; x++) {
			if (src.data[(y * src.width + x) * 4 + 3] > 8) {
				x0 = Math.min(x0, x);
				y0 = Math.min(y0, y);
				x1 = Math.max(x1, x);
				y1 = Math.max(y1, y);
			}
		}
	}
	if (x1 < 0) return data;
	const size = Math.max(x1 - x0, y1 - y0) + 3;
	const out = new PNG({ width: size, height: size });
	const ox = Math.floor((size - (x1 - x0 + 1)) / 2);
	const oy = Math.floor((size - (y1 - y0 + 1)) / 2);
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			const s = (y * src.width + x) * 4;
			const d = ((y - y0 + oy) * size + (x - x0 + ox)) * 4;
			src.data.copy(out.data, d, s, s + 4);
		}
	}
	return PNG.sync.write(out);
}

mkdirSync(outDir, { recursive: true });
const slugs = [...new Set(pokemon.map((p) => pokemonIconSlug(p.name)))];
const missing: string[] = [];
let fetched = 0;
for (const slug of slugs) {
	const file = join(outDir, `${slug}.png`);
	if (existsSync(file)) continue;
	const res = await fetch(`https://img.pokemondb.net/sprites/scarlet-violet/icon/${slug}.png`, {
		headers: { "User-Agent": "pokemon-sleep-calculator icon sync" },
	});
	if (!res.ok || !res.headers.get("content-type")?.startsWith("image/png")) {
		missing.push(`${slug} (HTTP ${res.status})`);
		continue;
	}
	writeFileSync(file, trimToSquare(Buffer.from(await res.arrayBuffer())));
	fetched++;
	await new Promise((r) => setTimeout(r, 150)); // be gentle with pokemondb.net
}
console.log(`${slugs.length} icons needed, ${fetched} downloaded.`);
if (missing.length) {
	console.log(`No icon found (add a mapping in src/data/pokemonIconSlug.ts?):\n  ${missing.join("\n  ")}`);
	process.exitCode = 1;
}
