/**
 * End-to-end check of the cooking log's screenshot reader against real screenshots of the cooking result
 * and pot screens. The screenshots are kept out of git (put them in ./screenshots/cooking); without them
 * this test is skipped. Language data comes from the @tesseract.js-data packages, as in the app.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { photoTakenAt } from "../core/photoDate";
import expected from "./__fixtures__/cooking.expected.json";
import { readCookingScreenshot } from "./cooking";
import type { RgbaImage } from "./image";
import type { TextReader } from "./read";
import { createOcrEngine, type OcrEngine, type ScreenshotLang, tesseractLang } from "./tesseract";

const dir = "screenshots/cooking";
const available = existsSync(dir) ? expected.filter((e) => existsSync(join(dir, e.file))) : [];

const load = (path: string): RgbaImage => {
	const bytes = readFileSync(path);
	if (/\.png$/i.test(path)) {
		const png = PNG.sync.read(bytes);
		return { width: png.width, height: png.height, data: png.data };
	}
	return jpeg.decode(bytes, { useTArray: true });
};
const toPng = (img: RgbaImage) => {
	const png = new PNG({ width: img.width, height: img.height });
	png.data = Buffer.from(img.data);
	return PNG.sync.write(png);
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

describe.skipIf(available.length === 0)("cooking screenshot reader", () => {
	for (const want of available) {
		it(`reads ${want.file}`, { timeout: 120_000 }, async () => {
			const path = join(dir, want.file);
			const ocr = await engine(want.lang as ScreenshotLang);
			// OCR_DEBUG=<folder> saves every image sent to OCR there.
			let n = 0;
			const debugDir = process.env.OCR_DEBUG;
			const reader: TextReader = {
				read: (img, opts) => {
					if (debugDir) writeFileSync(join(debugDir, `${want.file}.${n++}.png`), toPng(img));
					return ocr.read(img, opts);
				},
			};
			const reading = await readCookingScreenshot(load(path), reader);
			if (process.env.OCR_DEBUG) console.log(want.file, JSON.stringify(reading));
			const { file, lang, takenAt, note, warnings = [], ...fields } = want as typeof want & { note?: string; warnings?: string[] };
			expect(reading, JSON.stringify(reading.raw)).toMatchObject(fields);
			expect(reading.warnings, JSON.stringify(reading.raw)).toEqual(warnings);
			const bytes = new Uint8Array(readFileSync(path));
			expect(photoTakenAt(bytes, want.file)?.time).toBe(takenAt);
		});
	}
});
