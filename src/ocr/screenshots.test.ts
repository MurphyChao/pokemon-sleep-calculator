/**
 * End-to-end check of the screenshot importer against real screenshots. The screenshots are kept
 * out of git (put them in ./screenshots); without them this test is skipped. The first run downloads
 * Tesseract language data into node_modules/.cache/tesseract.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import expected from "./__fixtures__/screenshots.expected.json";
import type { RgbaImage } from "./image";
import { readScreenshot } from "./read";
import { createOcrEngine, type OcrEngine, type ScreenshotLang } from "./tesseract";

const dir = "screenshots";
const iconDir = "src/data/ingredient-icons";
const available = existsSync(dir) ? expected.filter((e) => existsSync(join(dir, e.file))) : [];

const loadPng = (path: string): RgbaImage => {
	const png = PNG.sync.read(readFileSync(path));
	return { width: png.width, height: png.height, data: png.data };
};
const toPng = (img: RgbaImage) => {
	const png = new PNG({ width: img.width, height: img.height });
	png.data = Buffer.from(img.data);
	return PNG.sync.write(png);
};

const icons = Object.fromEntries(
	readdirSync(iconDir)
		.filter((f) => f.endsWith(".png"))
		.map((f) => [f.replace(/\.png$/, "") as IngredientName, loadPng(join(iconDir, f))]),
);

const engines = new Map<ScreenshotLang, Promise<OcrEngine>>();
const engine = (lang: ScreenshotLang) => {
	let e = engines.get(lang);
	if (!e) {
		e = createOcrEngine(lang, toPng, { cachePath: "node_modules/.cache/tesseract" });
		engines.set(lang, e);
	}
	return e;
};
afterAll(async () => {
	for (const e of engines.values()) await (await e).terminate();
});

describe.skipIf(available.length === 0)("screenshot importer", () => {
	for (const want of available) {
		it(`reads ${want.file}`, { timeout: 180_000 }, async () => {
			const reading = await readScreenshot(loadPng(join(dir, want.file)), await engine(want.lang as ScreenshotLang), icons);
			const { entry } = reading;
			const got = {
				pokemonName: entry.pokemonName,
				level: entry.level,
				skillLevel: entry.skillLevel,
				nature: entry.nature,
				subSkills: entry.subSkills,
				ingredient: entry.ingredient,
			};
			const { file, lang, formsShareName, ...fields } = want as typeof want & { formsShareName?: string[] };
			if (process.env.OCR_DEBUG) console.log(want.file, reading.warnings, JSON.stringify(reading.raw), reading.ingredientIcons);
			expect(got, JSON.stringify(reading.raw)).toEqual(fields);
			// A form we can't tell apart must be flagged for review, and nothing else.
			const pumpkabooLike = formsShareName && reading.warnings.includes("form");
			expect(reading.warnings.filter((w) => !(pumpkabooLike && w === "form"))).toEqual([]);
		});
	}
});
