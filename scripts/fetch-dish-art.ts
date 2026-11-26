/**
 * Downloads a picture of every dish in src/data/recipes.json from SleepAPI (Neroli's Lab,
 * github.com/nerolis-lab/nerolis-lab, frontend/public/images/recipe/) into src/data/dish-art/<recipe id>.png,
 * shrunk to fit 96×96 (only the ones not there yet). Run after importing new recipes: `npm run fetch-dish-art`.
 *
 * SleepAPI's code is Apache-2.0; the dish pictures are the game's artwork, © Nintendo/Creatures/GAME FREAK,
 * credited in the footer like the other images.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src/data/dish-art");
const base = "https://raw.githubusercontent.com/nerolis-lab/nerolis-lab/main/frontend/public/images/recipe";
const size = 96;
const recipes = JSON.parse(readFileSync(join(root, "src/data/recipes.json"), "utf8")) as { id: string }[];

/** SleepAPI's file name for a recipe: the id without underscores ("bulldoze_guacamole_and_chips" → "bulldozeguacamoleandchips"). */
const sleepApiName = (id: string) => id.replace(/_/g, "");

/**
 * Shrinks to fit size×size by area averaging, with colours weighted by alpha (so transparent pixels don't darken
 * the edges), and trims nothing: the dishes are drawn centred on a transparent square.
 */
function shrink(data: Buffer): Buffer {
	const src = PNG.sync.read(data);
	const scale = Math.min(1, size / Math.max(src.width, src.height));
	const w = Math.max(1, Math.round(src.width * scale));
	const h = Math.max(1, Math.round(src.height * scale));
	const out = new PNG({ width: w, height: h });
	const sx = src.width / w;
	const sy = src.height / h;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let area = 0;
			for (let yy = Math.floor(y * sy); yy < Math.min(src.height, Math.ceil((y + 1) * sy)); yy++) {
				const wy = Math.min((y + 1) * sy, yy + 1) - Math.max(y * sy, yy);
				for (let xx = Math.floor(x * sx); xx < Math.min(src.width, Math.ceil((x + 1) * sx)); xx++) {
					const wgt = wy * (Math.min((x + 1) * sx, xx + 1) - Math.max(x * sx, xx));
					const i = (yy * src.width + xx) * 4;
					const al = src.data[i + 3] * wgt;
					r += src.data[i] * al;
					g += src.data[i + 1] * al;
					b += src.data[i + 2] * al;
					a += al;
					area += wgt;
				}
			}
			const o = (y * w + x) * 4;
			out.data[o] = a ? r / a : 0;
			out.data[o + 1] = a ? g / a : 0;
			out.data[o + 2] = a ? b / a : 0;
			out.data[o + 3] = area ? a / area : 0;
		}
	}
	return PNG.sync.write(out);
}

mkdirSync(outDir, { recursive: true });
const missing: string[] = [];
let fetched = 0;
for (const { id } of recipes) {
	const file = join(outDir, `${id}.png`);
	if (existsSync(file)) continue;
	const res = await fetch(`${base}/${sleepApiName(id)}.png`, { headers: { "User-Agent": "pokemon-sleep-calculator dish art sync" } });
	if (!res.ok) {
		missing.push(id);
		continue;
	}
	writeFileSync(file, shrink(Buffer.from(await res.arrayBuffer())));
	fetched++;
}
console.log(`Fetched ${fetched} dish pictures into src/data/dish-art/.`);
if (missing.length) console.log(`Not found on SleepAPI: ${missing.join(", ")}`);
