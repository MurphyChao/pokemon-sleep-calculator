/**
 * Builds the reference icons the screenshot importer recognizes Pokémon by (src/data/sleep-icons/) from
 * screenshots of the game's "Pokémon details" screen in ./screenshots/pokemon: the round icon on the name card is
 * cut out and stored normalized, named after the Pokémon (see src/data/sleepIconSlug.ts).
 *
 * Which Pokémon a screenshot shows comes from src/ocr/__fixtures__/screenshots.expected.json when it's
 * listed there; otherwise the screenshot is read with the importer's OCR (by its name only), and skipped if
 * the name isn't recognized or forms can't be told apart. Check the printed list: a wrong reading would
 * teach a wrong icon. A Pokémon already having a matching icon is skipped; a different-looking one (shiny,
 * costume) is added as another icon of it.
 *
 * Usage: npm run build-sleep-icons [-- --lang zh-TW|ja|en] [--dir <folder>] [--names <file.json>]
 *   --lang: language of screenshots not in the fixtures; --dir: read screenshots from another folder (PNG);
 *   --names: a JSON object naming the Pokémon in screenshots by file name ({"photo_1.png": "Cutiefly"}), for
 *   ones whose name can't be read or doesn't tell the form (as the fixtures do).
 *
 * Runs the app's TypeScript through Vite's module loader, so it uses exactly the importer's code.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirArg = process.argv.indexOf("--dir");
const shotsDir = dirArg >= 0 ? process.argv[dirArg + 1] : join(root, "screenshots", "pokemon");
const outDir = join(root, "src/data/sleep-icons");
const ingredientDir = join(root, "src/data/ingredient-icons");
const langArg = process.argv.indexOf("--lang");
const lang = langArg >= 0 ? process.argv[langArg + 1] : "zh-TW";
const namesArg = process.argv.indexOf("--names");
const givenNames = namesArg >= 0 ? JSON.parse(readFileSync(process.argv[namesArg + 1], "utf8")) : {};

if (!existsSync(shotsDir)) {
	console.error(`No ${shotsDir} folder: put screenshots of the Pokémon details screen there.`);
	process.exit(1);
}

const server = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
	const load = (path) => server.ssrLoadModule(path);
	const { detectLayout } = await load("/src/ocr/layout.ts");
	const { normalizeIcon, iconDistance, maxMatchDistance } = await load("/src/ocr/pokemonIcon.ts");
	const { readScreenshot } = await load("/src/ocr/read.ts");
	const { createOcrEngine, tesseractLang } = await load("/src/ocr/tesseract.ts");
	const { sleepIconSlug, slugOfIconFile } = await load("/src/data/sleepIconSlug.ts");
	const expected = JSON.parse(readFileSync(join(root, "src/ocr/__fixtures__/screenshots.expected.json"), "utf8"));
	const known = new Map([...expected.map((e) => [e.file, e.pokemonName]), ...Object.entries(givenNames)]);

	const loadPng = (path) => {
		const png = PNG.sync.read(readFileSync(path));
		return { width: png.width, height: png.height, data: png.data };
	};
	const toPng = (img) => {
		const png = new PNG({ width: img.width, height: img.height });
		png.data = Buffer.from(img.data);
		return PNG.sync.write(png);
	};

	mkdirSync(outDir, { recursive: true });
	/** Existing icons by slug. */
	const existing = new Map();
	for (const f of readdirSync(outDir).filter((f) => f.endsWith(".png"))) {
		const slug = slugOfIconFile(f);
		existing.set(slug, [...(existing.get(slug) ?? []), loadPng(join(outDir, f))]);
	}

	let engine;
	const ingredientIcons = Object.fromEntries(
		readdirSync(ingredientDir)
			.filter((f) => f.endsWith(".png"))
			.map((f) => [f.replace(/\.png$/, ""), loadPng(join(ingredientDir, f))]),
	);

	for (const file of readdirSync(shotsDir).filter((f) => /\.png$/i.test(f)).sort()) {
		const img = loadPng(join(shotsDir, file));
		let layout;
		try {
			layout = detectLayout(img);
		} catch {
			console.log(`skip  ${file}: not a Pokémon details screen`);
			continue;
		}
		let name = known.get(file);
		let how = file in givenNames ? "given" : "fixture";
		if (!name) {
			engine ??= await createOcrEngine(lang, toPng, {
				cachePath: join(root, "node_modules/.cache/tesseract"),
				paths: { langPath: join(root, `node_modules/@tesseract.js-data/${tesseractLang[lang]}/4.0.0_best_int`) },
			});
			const reading = await readScreenshot(img, engine, ingredientIcons);
			if (reading.warnings.includes("pokemon") || reading.warnings.includes("form")) {
				console.log(`skip  ${file}: name not recognized (read "${reading.raw.name}")`);
				continue;
			}
			name = reading.entry.pokemonName;
			how = `read "${reading.raw.name.trim()}"`;
		}
		const icon = normalizeIcon(img, layout.nameIcon);
		const slug = sleepIconSlug(name);
		const have = existing.get(slug) ?? [];
		if (have.some((h) => iconDistance(icon, h) <= maxMatchDistance)) {
			console.log(`have  ${name.padEnd(22)} ${file}`);
			continue;
		}
		const fileName = have.length === 0 ? `${slug}.png` : `${slug}--${have.length + 1}.png`;
		writeFileSync(join(outDir, fileName), toPng(icon));
		existing.set(slug, [...have, icon]);
		console.log(`add   ${name.padEnd(22)} ${file} (${how}) → ${fileName}`);
	}
	await engine?.terminate();
} finally {
	await server.close();
}
