/** Browser-only helpers for the screenshot importer: decoding images and loading reference icons. */
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import type { RgbaImage } from "./image";
import { createOcrEngine, type OcrEngine, type ScreenshotLang } from "./tesseract";

function toImageData(source: CanvasImageSource, width: number, height: number): RgbaImage {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Canvas not supported");
	ctx.drawImage(source, 0, 0);
	return ctx.getImageData(0, 0, width, height);
}

export async function decodeImage(blob: Blob): Promise<RgbaImage> {
	const bitmap = await createImageBitmap(blob);
	try {
		return toImageData(bitmap, bitmap.width, bitmap.height);
	} finally {
		bitmap.close();
	}
}

function toCanvas(img: RgbaImage): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
	return canvas;
}

export function createBrowserOcrEngine(lang: ScreenshotLang, onProgress?: (fraction: number) => void): Promise<OcrEngine> {
	return createOcrEngine(lang, toCanvas, { onProgress });
}

const iconUrls = import.meta.glob("../data/ingredient-icons/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

let icons: Promise<Partial<Record<IngredientName, RgbaImage>>> | undefined;

/** Reference ingredient icons, keyed by ingredient name (loaded once). */
export function loadIngredientIcons(): Promise<Partial<Record<IngredientName, RgbaImage>>> {
	icons ??= Promise.all(
		Object.entries(iconUrls).map(async ([path, url]) => {
			const name = path.replace(/^.*\/|\.png$/g, "") as IngredientName;
			const blob = await (await fetch(url)).blob();
			return [name, await decodeImage(blob)] as const;
		}),
	).then(Object.fromEntries);
	return icons;
}
