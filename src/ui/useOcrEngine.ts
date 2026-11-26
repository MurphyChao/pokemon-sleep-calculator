import { useEffect, useRef, useState } from "react";
import type { OcrEngine, ScreenshotLang } from "../ocr/tesseract";

/**
 * The on-device text recognizer for a screenshot language, loaded on first use (tesseract.js and its
 * language data are only downloaded then) and replaced when the language changes.
 * `loading`: download progress (0–1) while it loads.
 */
export function useOcrEngine(lang: ScreenshotLang): { getEngine: () => Promise<OcrEngine>; loading: number | undefined } {
	const [loading, setLoading] = useState<number | undefined>();
	const engine = useRef<{ lang: ScreenshotLang; engine: Promise<OcrEngine> } | undefined>(undefined);

	useEffect(
		() => () => {
			engine.current?.engine.then((e) => e.terminate());
		},
		[],
	);

	const getEngine = async (): Promise<OcrEngine> => {
		if (engine.current?.lang !== lang) {
			const old = engine.current;
			const { createBrowserOcrEngine } = await import("../ocr/browser");
			setLoading(0);
			engine.current = { lang, engine: createBrowserOcrEngine(lang, (p) => setLoading(p)) };
			old?.engine.then((e) => e.terminate());
		}
		try {
			return await engine.current.engine;
		} catch (e) {
			engine.current = undefined;
			throw e;
		} finally {
			setLoading(undefined);
		}
	};

	return { getEngine, loading };
}
