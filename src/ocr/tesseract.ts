/**
 * TextReader backed by Tesseract.js (WebAssembly OCR, runs locally; screenshots never leave the
 * device). The engine and language data are downloaded from the jsDelivr CDN on first use and
 * cached by the browser, so tesseract.js is only loaded when the importer is used.
 */
import type { RgbaImage } from "./image";
import type { TextReader } from "./read";

export type ScreenshotLang = "zh-TW" | "ja" | "en";

const tesseractLang: Record<ScreenshotLang, string> = { "zh-TW": "chi_tra", ja: "jpn", en: "eng" };

export interface OcrEngine extends TextReader {
	terminate(): Promise<void>;
}

/**
 * @param toImage converts an image to something Tesseract accepts (a canvas in the browser,
 *   a PNG buffer in Node).
 */
export async function createOcrEngine(
	lang: ScreenshotLang,
	toImage: (img: RgbaImage) => unknown,
	opts: { onProgress?: (fraction: number) => void; cachePath?: string } = {},
): Promise<OcrEngine> {
	const { createWorker, OEM, PSM } = await import("tesseract.js");
	const worker = await createWorker(tesseractLang[lang], OEM.LSTM_ONLY, {
		...(opts.cachePath && { cachePath: opts.cachePath }),
		logger: (m) => {
			if (m.status.startsWith("loading") && opts.onProgress) opts.onProgress(m.progress);
		},
	});
	await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
	let digitsOnly = false;
	return {
		async read(img, readOpts) {
			const digits = !!readOpts?.digits;
			if (digits !== digitsOnly) {
				await worker.setParameters({ tessedit_char_whitelist: digits ? "Lv.0123456789" : "" });
				digitsOnly = digits;
			}
			// biome-ignore lint/suspicious/noExplicitAny: tesseract.js accepts several image types
			const { data } = await worker.recognize(toImage(img) as any);
			return data.text.trim();
		},
		async terminate() {
			await worker.terminate();
		},
	};
}
