/** Minimal RGBA image helpers shared by the browser (canvas ImageData) and Node tests (pngjs). */

export interface RgbaImage {
	width: number;
	height: number;
	/** RGBA bytes, row by row. */
	data: Uint8ClampedArray | Uint8Array;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function clampRect(img: RgbaImage, r: Rect): Rect {
	const x = Math.max(0, Math.round(r.x));
	const y = Math.max(0, Math.round(r.y));
	const x1 = Math.min(img.width, Math.round(r.x + r.width));
	const y1 = Math.min(img.height, Math.round(r.y + r.height));
	return { x, y, width: Math.max(0, x1 - x), height: Math.max(0, y1 - y) };
}

export function crop(img: RgbaImage, rect: Rect): RgbaImage {
	const r = clampRect(img, rect);
	const out = new Uint8ClampedArray(r.width * r.height * 4);
	for (let y = 0; y < r.height; y++) {
		const from = ((r.y + y) * img.width + r.x) * 4;
		out.set(img.data.subarray(from, from + r.width * 4), y * r.width * 4);
	}
	return { width: r.width, height: r.height, data: out };
}

/** Area-average resize (good for shrinking), bilinear-ish when enlarging. */
export function resize(img: RgbaImage, width: number, height: number): RgbaImage {
	const out = new Uint8ClampedArray(width * height * 4);
	const sx = img.width / width;
	const sy = img.height / height;
	for (let y = 0; y < height; y++) {
		const y0 = y * sy;
		const y1 = Math.max(y0 + 1e-6, (y + 1) * sy);
		for (let x = 0; x < width; x++) {
			const x0 = x * sx;
			const x1 = Math.max(x0 + 1e-6, (x + 1) * sx);
			const acc = [0, 0, 0, 0];
			let wsum = 0;
			for (let yy = Math.floor(y0); yy < Math.min(img.height, Math.ceil(y1)); yy++) {
				const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
				for (let xx = Math.floor(x0); xx < Math.min(img.width, Math.ceil(x1)); xx++) {
					const w = wy * (Math.min(x1, xx + 1) - Math.max(x0, xx));
					const i = (yy * img.width + xx) * 4;
					for (let c = 0; c < 4; c++) acc[c] += img.data[i + c] * w;
					wsum += w;
				}
			}
			const o = (y * width + x) * 4;
			for (let c = 0; c < 4; c++) out[o + c] = wsum ? acc[c] / wsum : 0;
		}
	}
	return { width, height, data: out };
}

export function pixel(img: RgbaImage, x: number, y: number): [number, number, number] {
	const i = (y * img.width + x) * 4;
	return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Prepares a crop of game text for OCR: black text on white, scaled so the text is about
 * `targetHeight` pixels tall. Text in the game is always darker than its box (locked subskills
 * are greyed out, so the threshold adapts to each crop's contrast).
 */
export function binarizeText(img: RgbaImage, targetHeight = 48): RgbaImage {
	const n = img.width * img.height;
	const lum = new Float32Array(n);
	for (let i = 0; i < n; i++) lum[i] = luminance(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
	const sorted = Float32Array.from(lum).sort();
	const bg = sorted[Math.floor(n * 0.6)];
	const fg = sorted[Math.floor(n * 0.01)];
	const threshold = bg - Math.max(12, (bg - fg) * 0.45);
	const scale = Math.min(3, Math.max(1, targetHeight / img.height));
	const src = scale === 1 ? img : resize(img, Math.round(img.width * scale), Math.round(img.height * scale));
	const out = new Uint8ClampedArray(src.width * src.height * 4);
	// A white margin helps Tesseract find the text line.
	for (let i = 0; i < src.width * src.height; i++) {
		const v = luminance(src.data[i * 4], src.data[i * 4 + 1], src.data[i * 4 + 2]) < threshold ? 0 : 255;
		out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
		out[i * 4 + 3] = 255;
	}
	keepTextBand(out, src.width, src.height);
	return pad({ width: src.width, height: src.height, data: out }, Math.round(src.height * 0.3));
}

/**
 * Whitens dark bands of rows that touch the top or bottom edge (e.g. the "Lv. 50" badge above a
 * subskill box poking into the crop), as long as another band (the text) remains.
 */
function keepTextBand(data: Uint8ClampedArray, width: number, height: number) {
	const dark = (y: number) => {
		for (let x = 0; x < width; x++) if (data[(y * width + x) * 4] === 0) return true;
		return false;
	};
	const bands: [number, number][] = [];
	for (let y = 0; y < height; y++) {
		if (!dark(y)) continue;
		const last = bands[bands.length - 1];
		if (last && last[1] === y - 1) last[1] = y;
		else bands.push([y, y]);
	}
	const touchesEdge = ([a, b]: [number, number]) => a === 0 || b === height - 1;
	if (bands.every(touchesEdge)) return;
	for (const band of bands.filter(touchesEdge)) data.fill(255, band[0] * width * 4, (band[1] + 1) * width * 4);
}

function pad(img: RgbaImage, margin: number): RgbaImage {
	const width = img.width + margin * 2;
	const height = img.height + margin * 2;
	const out = new Uint8ClampedArray(width * height * 4).fill(255);
	for (let y = 0; y < img.height; y++) {
		out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + margin) * width + margin) * 4);
	}
	return { width, height, data: out };
}
