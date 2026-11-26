/**
 * TextReader backed by Tesseract.js (WebAssembly OCR, runs locally; screenshots never leave the
 * device). tesseract.js is only loaded when the importer is used. In the browser its worker, engine
 * and language data are served from our own site (see vite.config.ts), not a CDN.
 */
import type { RgbaImage } from "./image";
import type { TextReader } from "./read";

export type ScreenshotLang = "zh-TW" | "ja" | "en";

export const tesseractLang: Record<ScreenshotLang, string> = { "zh-TW": "chi_tra", ja: "jpn", en: "eng" };

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
	opts: {
		onProgress?: (fraction: number) => void;
		/** Node: where downloaded language data is cached. */
		cachePath?: string;
		/**
		 * Self-hosted worker script, engine directory and language data directory (URLs in the
		 * browser; Node also accepts a local langPath).
		 */
		paths?: { workerPath?: string; corePath?: string; langPath?: string };
	} = {},
): Promise<OcrEngine> {
	const { createWorker, OEM, PSM } = await import("tesseract.js");
	const worker = await createWorker(tesseractLang[lang], OEM.LSTM_ONLY, {
		...(opts.cachePath && { cachePath: opts.cachePath }),
		...opts.paths,
		...(opts.paths?.workerPath && { workerBlobURL: false }),
		logger: (m) => {
			if (m.status.startsWith("loading") && opts.onProgress) opts.onProgress(m.progress);
		},
	});
	await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
	let whitelist = "";
	return {
		async read(img, readOpts) {
			const chars = readOpts?.chars ?? (readOpts?.digits ? "Lv.0123456789" : "");
			if (chars !== whitelist) {
				await worker.setParameters({ tessedit_char_whitelist: chars });
				whitelist = chars;
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
