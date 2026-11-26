/**
 * End-to-end check of the screenshot importer against real screenshots. The screenshots are kept
 * out of git (put them in ./screenshots); without them this test is skipped. Language data comes from
 * the @tesseract.js-data packages, as in the app.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import expected from "./__fixtures__/screenshots.expected.json";
import type { RgbaImage } from "./image";
import { slugOfIconFile, sleepIconSlug } from "../data/sleepIconSlug";
import pokemons from "../vendor/pokesleep-tool/data/pokemons";
import type { IconReference } from "./pokemonIcon";
import { readScreenshot, type TextReader } from "./read";
import { createOcrEngine, type OcrEngine, type ScreenshotLang, tesseractLang } from "./tesseract";

const dir = "screenshots/pokemon";
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

/** Built-in reference icons of Pokémon (made from these screenshots by `npm run build-sleep-icons`). */
const pokemonIconDir = "src/data/sleep-icons";
const nameBySlug = new Map(pokemons.map((p) => [sleepIconSlug(p.name), p.name]));
const pokemonIcons: IconReference[] = existsSync(pokemonIconDir)
	? readdirSync(pokemonIconDir)
			.filter((f) => f.endsWith(".png"))
			.flatMap((f) => {
				const pokemonName = nameBySlug.get(slugOfIconFile(f));
				return pokemonName ? [{ pokemonName, icon: loadPng(join(pokemonIconDir, f)) }] : [];
			})
	: [];

/** A reader whose first line (the name card's "Lv. 22 <name>") reads as a nickname instead of the species. */
const nicknamed = (reader: TextReader, level: number): TextReader => {
	let first = true;
	return {
		read: (img, opts) => {
			if (!first) return reader.read(img, opts);
			first = false;
			return Promise.resolve(`Lv. ${level} Mochi`);
		},
	};
};

const engines = new Map<ScreenshotLang, Promise<OcrEngine>>();
const engine = (lang: ScreenshotLang) => {
	let e = engines.get(lang);
	if (!e) {
		e = createOcrEngine(lang, toPng, {
			cachePath: "node_modules/.cache/tesseract",
			paths: { langPath: `node_modules/@tesseract.js-data/${tesseractLang[lang]}/4.0.0_best_int` },
		});
		engines.set(lang, e);
	}
	return e;
};
afterAll(async () => {
	for (const e of engines.values()) await (await e).terminate();
});

describe.skipIf(available.length === 0)("screenshot importer", () => {
	// By name only (no reference icons), icon first (with the built-in icons), and with a nickname instead
	// of the name, where only the icon can tell the Pokémon.
	const modes = ["name", "icon", "nickname"] as const;
	for (const want of available) for (const mode of modes) {
		it(`reads ${want.file} (${mode})`, { timeout: 180_000 }, async () => {
			const ocr = await engine(want.lang as ScreenshotLang);
			const reader = mode === "nickname" ? nicknamed(ocr, want.level) : ocr;
			const reading = await readScreenshot(loadPng(join(dir, want.file)), reader, icons, mode === "name" ? [] : pokemonIcons);
			if (mode !== "name") expect(reading.iconPokemon).toBeDefined();
			if (mode === "nickname") expect(reading.namePokemon).toBeUndefined();
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
