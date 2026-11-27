/**
 * Reads the two Pokémon Sleep cooking screenshots the cooking log takes:
 *
 * - The **result screen** after cooking ("料理的最終能量" / "Final dish strength"): the dish's final energy
 *   (big number), the dish name (in the yellow banner) and whether it was Extra Tasty (a pink "漂亮成功！"
 *   tag above the banner, and the number turns pink instead of orange).
 * - The **pot screen** ("做料理" / "Cook"): the "!" button's label is the Extra Tasty bonus built up so far,
 *   e.g. "+20%".
 *
 * Like layout.ts, positions are measured in screen widths (W) from anchors found by colour, since the
 * game's layout scales with the width. Measured on iPhone screenshots (1206 px wide, and a 588 px copy
 * sent through a chat app) in Traditional Chinese.
 */
import { dishStrength } from "../core/energy";
import { recipes } from "../core/recipes";
import jaRecipes from "../data/recipes.ja.json";
import zhRecipes from "../data/recipes.zh-TW.json";
import { binarizeText, crop, pixel, type Rect, type RgbaImage, resize } from "./image";
import { bestMatch, type Candidate } from "./match";
import type { TextReader } from "./read";

export type CookingWarning =
	/** Neither a result screen nor a pot screen was recognized. */
	| "layout"
	| "recipe"
	| "energy"
	/** The Extra Tasty tag and the number's colour disagree (the tag was used). */
	| "extraTasty"
	| "tastyBonus";

export type CookingReading =
	| {
			kind: "result";
			/** Recipe id (src/data/recipes.json), if the name matched. */
			recipeId?: string;
			energy?: number;
			extraTasty: boolean;
			warnings: CookingWarning[];
			raw: Record<string, string>;
	  }
	| {
			kind: "pot";
			/** Extra Tasty bonus in percentage points (the "+20%" label). */
			tastyBonus?: number;
			warnings: CookingWarning[];
			raw: Record<string, string>;
	  }
	| { kind: "unknown"; warnings: CookingWarning[]; raw: Record<string, string> };

type ColorTest = (r: number, g: number, b: number) => boolean;

/** The dish name banner's pale yellow (about rgb(254, 230, 113)). */
const isBanner: ColorTest = (r, g, b) => r > 240 && g > 200 && g < 245 && b > 80 && b < 160;
/**
 * The title and number's colour, by hue: orange (255, 137, 22; hue 30°), pink when Extra Tasty (254, 101, 119;
 * hue 355°), and the pale peach or pink of digits still fading in (255, 210, 170; 255, 180, 190). The number
 * counts up and fades in, so screenshots often catch its leading digits that pale. Not the background's pale
 * yellow pattern or the yellow sparkles (hue about 48°), nor white.
 */
const isAccent: ColorTest = (r, g, b) => {
	const chroma = r - Math.min(g, b);
	if (r < 200 || chroma < 35 || g > r || b > r) return false;
	const hue = (60 * (g - b)) / chroma;
	return hue <= 40 && hue >= -30;
};
/** The "漂亮成功！" (Extra Tasty) tag's pink (255, 120, 172). */
const isTag: ColorTest = (r, g, b) => r > 235 && g > 90 && g < 150 && b > 140 && b < 200;
/** The pot screen's button labels: dark orange text with a white outline (183, 97, 22). */
const isLabel: ColorTest = (r, g, b) => r > 140 && r - g > 60 && g < 130 && b < 90;

interface Band {
	top: number;
	bottom: number;
}

/** Runs of rows where more than `minFraction` of the pixels between x0 and x1 pass `test`. */
function rowBands(img: RgbaImage, x0: number, x1: number, test: ColorTest, minFraction: number, gap = 1): Band[] {
	const bands: Band[] = [];
	const from = Math.max(0, Math.round(x0));
	const to = Math.min(img.width, Math.round(x1));
	for (let y = 0; y < img.height; y++) {
		let n = 0;
		for (let x = from; x < to; x++) {
			const [r, g, b] = pixel(img, x, y);
			if (test(r, g, b)) n++;
		}
		if (n / (to - from) <= minFraction) continue;
		const last = bands[bands.length - 1];
		if (last && y - last.bottom <= gap + 1) last.bottom = y;
		else bands.push({ top: y, bottom: y });
	}
	return bands;
}

/** Fraction of the pixels in `rect` that pass `test`. */
function fraction(img: RgbaImage, rect: Rect, test: ColorTest): number {
	let n = 0;
	let total = 0;
	for (let y = Math.max(0, Math.round(rect.y)); y < Math.min(img.height, rect.y + rect.height); y++) {
		for (let x = Math.max(0, Math.round(rect.x)); x < Math.min(img.width, rect.x + rect.width); x++) {
			const [r, g, b] = pixel(img, x, y);
			if (test(r, g, b)) n++;
			total++;
		}
	}
	return total ? n / total : 0;
}

/** Each pixel set if any pixel within `r` (a square) is (`want` 1: dilation) or all are (`want` 0: erosion). */
function morph(on: Uint8Array, w: number, h: number, r: number, want: 0 | 1): Uint8Array {
	// Separable: rows, then columns.
	const pass = (src: Uint8Array, horizontal: boolean) => {
		const out = new Uint8Array(src.length);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let v = want ? 0 : 1;
				for (let d = -r; d <= r && v !== want; d++) {
					const xx = horizontal ? x + d : x;
					const yy = horizontal ? y : y + d;
					// Outside the image counts as background for dilation and as set for erosion (no eaten edges).
					const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 1 - want : src[yy * w + xx];
					if (s === want) v = want;
				}
				out[y * w + x] = v;
			}
		}
		return out;
	};
	return pass(pass(on, true), false);
}

/** Morphological closing: fills holes and gaps up to 2r pixels wide (JPEG speckle, the seam of a fading digit). */
function close(on: Uint8Array, w: number, h: number, r: number): Uint8Array {
	return morph(morph(on, w, h, r, 1), w, h, r, 0);
}

/**
 * Black-on-white image of the pixels in `rect` that pass `test` (coloured text on a light, patterned
 * background, where a brightness threshold would lose the faded digits), scaled so the text is about
 * `targetHeight` pixels tall, with a white margin.
 */
function maskText(img: RgbaImage, rect: Rect, test: ColorTest, targetHeight: number): RgbaImage {
	// Mask at full size, then shrink the mask (colours blurred by shrinking first would fail the test at the edges).
	const full = crop(img, rect);
	// Only the columns with text (wide blank margins put Tesseract off).
	let left = full.width;
	let right = -1;
	for (let i = 0; i < full.width * full.height; i++) {
		if (!test(full.data[i * 4], full.data[i * 4 + 1], full.data[i * 4 + 2])) continue;
		left = Math.min(left, i % full.width);
		right = Math.max(right, i % full.width);
	}
	const src = right < left ? full : crop(full, { x: left, y: 0, width: right - left + 1, height: full.height });
	const on = new Uint8Array(src.width * src.height);
	for (let i = 0; i < on.length; i++) on[i] = test(src.data[i * 4], src.data[i * 4 + 1], src.data[i * 4 + 2]) ? 1 : 0;
	const closed = close(on, src.width, src.height, Math.max(1, Math.round(src.height / 40)));
	const mask = new Uint8ClampedArray(src.width * src.height * 4).fill(255);
	for (let i = 0; i < closed.length; i++) if (closed[i]) mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = 0;
	const scale = targetHeight / src.height;
	const small = resize({ width: src.width, height: src.height, data: mask }, Math.max(1, Math.round(src.width * scale)), Math.round(targetHeight));
	const margin = Math.round(small.height * 0.3);
	const width = small.width + margin * 2;
	const height = small.height + margin * 2;
	const out = new Uint8ClampedArray(width * height * 4).fill(255);
	for (let y = 0; y < small.height; y++) {
		for (let x = 0; x < small.width; x++) {
			if (small.data[(y * small.width + x) * 4] >= 128) continue;
			const o = ((y + margin) * width + x + margin) * 4;
			out[o] = out[o + 1] = out[o + 2] = 0;
		}
	}
	return { width, height, data: out };
}

const recipeCandidates: Candidate<string>[] = recipes.map((r) => ({
	key: r.id,
	names: [r.name, (zhRecipes as Record<string, string>)[r.id], (jaRecipes as Record<string, string>)[r.id]].filter(Boolean),
}));

/** The recipe whose name (in any language) is closest to OCR text from the banner. */
export function matchRecipe(text: string): string | undefined {
	return bestMatch(text, recipeCandidates)?.key;
}

/** "211,909" (commas sometimes read as dots or dropped) → 211909; undefined if implausible. */
export function parseEnergy(text: string): number | undefined {
	const digits = text.normalize("NFKC").replace(/[^0-9]/g, "");
	if (digits.length < 3 || digits.length > 8) return undefined;
	return Number(digits);
}

/**
 * Most a dish's energy can be over its base: recipe level 70 (×3.58), a field bonus up to +100% (×2) and an
 * event doubling dish energy (×2) come to ×14.3, rounded up for headroom.
 */
const maxEnergyFactor = 16;

/**
 * The energies a dish can show: at least its base energy (recipe level 1, no field bonus), doubled when
 * Extra Tasty; at most maxEnergyFactor times the base, times 3 when Extra Tasty (on Sunday). A digit dropped or
 * added by OCR is off by ×10, so it falls outside unless the dish is near the edge of the range.
 */
export function energyRange(recipeId: string, extraTasty: boolean): [number, number] {
	const recipe = recipes.find((r) => r.id === recipeId);
	if (!recipe) return [0, Number.POSITIVE_INFINITY];
	const base = dishStrength(recipe, 1, 0);
	return [Math.floor(base * (extraTasty ? 2 : 1) * 0.99), base * maxEnergyFactor * (extraTasty ? 3 : 1)];
}

/** The value most readings agree on; on a tie, the one with the most digits (OCR drops digits more than it adds them). */
export function agreedValue(values: (number | undefined)[]): { value: number; votes: number } | undefined {
	const counts = new Map<number, number>();
	for (const v of values) if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
	let best: [number, number] | undefined;
	for (const [v, n] of counts) {
		if (!best || n > best[1] || (n === best[1] && String(v).length > String(best[0]).length)) best = [v, n];
	}
	if (!best) return undefined;
	return { value: best[0], votes: best[1] };
}

/**
 * Average of (blue − green) over the accent pixels in `rect`: positive for the Extra Tasty pink
 * (green 101, blue 119), very negative for the orange (green 137, blue 22).
 */
function pinkness(img: RgbaImage, rect: Rect): number {
	let sum = 0;
	let n = 0;
	for (let y = Math.max(0, Math.round(rect.y)); y < Math.min(img.height, rect.y + rect.height); y++) {
		for (let x = Math.max(0, Math.round(rect.x)); x < Math.min(img.width, rect.x + rect.width); x++) {
			const [r, g, b] = pixel(img, x, y);
			if (!isAccent(r, g, b)) continue;
			sum += b - g;
			n++;
		}
	}
	return n ? sum / n : Number.NEGATIVE_INFINITY;
}

/**
 * The dish name banner: the first band of rows that is mostly its yellow across the middle of the screen
 * (rows through the dish name's text are less yellow, hence the gap).
 */
function findBanner(img: RgbaImage): Band | undefined {
	const W = img.width;
	return rowBands(img, W * 0.25, W * 0.75, isBanner, 0.6, Math.round(W * 0.03)).find((b) => b.bottom - b.top > W * 0.04);
}

/** Heights (px) the energy number is read at. */
const energyTextHeights = [18, 20, 22];

async function readResult(img: RgbaImage, banner: Band, reader: TextReader): Promise<CookingReading> {
	const W = img.width;
	const warnings: CookingWarning[] = [];
	const raw: Record<string, string> = {};

	// Dish name: dark text in the middle of the banner (its ends are arrow-shaped).
	const bannerHeight = banner.bottom - banner.top;
	const nameRect = { x: W * 0.17, y: banner.top + bannerHeight * 0.12, width: W * 0.66, height: bannerHeight * 0.76 };
	raw.recipe = await reader.read(binarizeText(crop(img, nameRect)));
	const recipeId = matchRecipe(raw.recipe);
	if (!recipeId) warnings.push("recipe");

	// Extra Tasty tag: over the banner's left end.
	const tag = fraction(img, { x: W * 0.1, y: banner.top - W * 0.07, width: W * 0.3, height: W * 0.07 }, isTag) > 0.05;

	// Title and number: coloured text above the dish picture (which starts about half a width above the
	// banner); the number is the tallest band.
	const above = rowBands(img, W * 0.1, W * 0.9, isAccent, 0.05, Math.round(W * 0.01)).filter(
		(b) => b.bottom < banner.top - W * 0.5 && b.bottom - b.top > W * 0.02,
	);
	const number = above.reduce<Band | undefined>(
		(best, b) => (!best || b.bottom - b.top > best.bottom - best.top ? b : best),
		undefined,
	);
	let energy: number | undefined;
	let pink = false;
	if (number) {
		const rect = { x: W * 0.05, y: number.top - 2, width: W * 0.9, height: number.bottom - number.top + 4 };
		// Tesseract reads this font best with digits about 20 px tall, and sometimes drops a leading "1" at
		// other sizes: read at three sizes, drop readings the dish can't have, and go with the majority.
		const texts: string[] = [];
		for (const height of energyTextHeights) texts.push(await reader.read(maskText(img, rect, isAccent, height), { chars: "0123456789," }));
		raw.energy = texts.join(" | ");
		const [min, max] = recipeId ? energyRange(recipeId, tag) : [0, Number.POSITIVE_INFINITY];
		const agreed = agreedValue(texts.map(parseEnergy).map((v) => (v !== undefined && v >= min && v <= max ? v : undefined)));
		energy = agreed?.value;
		// Kept as a guess to check unless at least two readings agree.
		if (agreed && agreed.votes < 2) warnings.push("energy");
		pink = pinkness(img, rect) > 0;
	}
	if (energy === undefined) warnings.push("energy");
	if (number && tag !== pink) warnings.push("extraTasty");
	return { kind: "result", recipeId, energy, extraTasty: tag, warnings, raw };
}

/** The pot screen's two big buttons ("隨機料理", "自選料理"): flat orange, about rgb(254, 187, 68). */
const isPotButton: ColorTest = (r, g, b) => r > 245 && g > 175 && g < 200 && b > 45 && b < 95;

/** The pot screen has two big orange buttons, each about a sixth of the width tall, one under the other. */
function isPotScreen(img: RgbaImage): boolean {
	const W = img.width;
	// Rows through the buttons' white text are less orange, hence the gap.
	const buttons = rowBands(img, W * 0.45, W * 0.85, isPotButton, 0.6, Math.round(W * 0.03)).filter(
		(b) => b.bottom - b.top > W * 0.1 && b.bottom - b.top < W * 0.25,
	);
	return buttons.length >= 2;
}

/**
 * Digits in a "+20%" label from its size: "+" is about 0.72 of the label's height wide, each digit 0.75 and
 * "%" 0.92 (measured on the game's labels). Undefined unless it comes out 1 or 2 (the bonus is at most 70).
 */
export function labelDigitCount(width: number, height: number): number | undefined {
	const n = Math.round((width - 1.64 * height) / (0.75 * height));
	return n === 1 || n === 2 ? n : undefined;
}

/**
 * The white letters of outlined text, black on white: light pixels that can't be reached from the image's
 * edge without crossing the darker outline. (At the label's size the outline fills the digits' holes, so
 * "0" comes out solid enough to read.)
 */
function enclosedLight(img: RgbaImage, threshold: number): RgbaImage {
	const { width: w, height: h } = img;
	const light = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		light[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2] > threshold ? 1 : 0;
	}
	const outside = new Uint8Array(w * h);
	const stack: number[] = [];
	for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
	for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
	while (stack.length) {
		const i = stack.pop() as number;
		if (outside[i] || !light[i]) continue;
		outside[i] = 1;
		const x = i % w;
		if (x > 0) stack.push(i - 1);
		if (x < w - 1) stack.push(i + 1);
		if (i >= w) stack.push(i - w);
		if (i < w * (h - 1)) stack.push(i + w);
	}
	const out = new Uint8ClampedArray(w * h * 4).fill(255);
	for (let i = 0; i < w * h; i++) if (light[i] && !outside[i]) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 0;
	return { width: w, height: h, data: out };
}

/** Black-on-white `img` scaled to `height`, smoothed (blocky edges blurred and re-thresholded), with a white margin. */
function smoothText(img: RgbaImage, height: number): RgbaImage {
	const k = height / img.height;
	const up = resize(img, Math.max(1, Math.round(img.width * k * 2)), height * 2);
	const small = resize(up, Math.max(1, Math.round(up.width / 2)), height);
	const margin = Math.round(height * 0.4);
	const width = small.width + margin * 2;
	const out = new Uint8ClampedArray(width * (height + margin * 2) * 4).fill(255);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < small.width; x++) {
			if (small.data[(y * small.width + x) * 4] >= 140) continue;
			const o = ((y + margin) * width + x + margin) * 4;
			out[o] = out[o + 1] = out[o + 2] = 0;
		}
	}
	return { width, height: height + margin * 2, data: out };
}

/** Brightness thresholds and text heights the bonus digits are read at (every combination votes). */
const bonusThresholds = [205, 210, 215, 220, 225];
const bonusTextHeights = [40, 44, 48, 52, 56];

/**
 * The bonus in a "+20%" label, from its digits only (the "+" and "%" are cut off by position, see
 * labelDigitCount): the white fill read at several thresholds and sizes, keeping the majority of the
 * readings with the right number of digits.
 */
async function readBonusLabel(
	img: RgbaImage,
	box: Rect,
	digits: number,
	reader: TextReader,
	raw: Record<string, string>,
): Promise<{ value: number; sure: boolean } | undefined> {
	// The label enlarged to about 42 px tall (from 14 px in a chat app's copy, 28 px in an original), with a
	// margin so the outside can be flood-filled all round.
	const scale = Math.max(1, 42 / box.height);
	const label = crop(img, { x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 });
	const big = resize(label, Math.round(label.width * scale), Math.round(label.height * scale));
	const digitBox = {
		x: Math.round((2 + 0.72 * box.height) * scale),
		y: 0,
		width: Math.round((box.width - 1.64 * box.height) * scale),
		height: big.height,
	};
	const values: (number | undefined)[] = [];
	const texts: string[] = [];
	for (const threshold of bonusThresholds) {
		const fill = crop(enclosedLight(big, threshold), digitBox);
		for (const height of bonusTextHeights) {
			const text = (await reader.read(smoothText(fill, height), { chars: "0123456789" })).replace(/\D/g, "");
			texts.push(text);
			values.push(text.length === digits && Number(text) <= maxTastyBonus ? Number(text) : undefined);
		}
	}
	raw.bonus = texts.join(" ");
	const agreed = agreedValue(values);
	if (!agreed) return undefined;
	// Sure when the winner has a clear majority of the readings that came out the right length.
	const counted = values.filter((v) => v !== undefined).length;
	return { value: agreed.value, sure: agreed.votes >= 5 && agreed.votes * 2 > counted };
}

/** The Extra Tasty bonus is capped at 70 percentage points (see core/tasty.ts). */
const maxTastyBonus = 70;

/**
 * Reads the pot screen's Extra Tasty bonus. The round buttons down the right edge have labels under them
 * ("MAX+36" under the pot, "+20%" under the "!"). Each label is read once to tell them apart (the pot's has
 * letters); the bonus label's digits are then read by readBonusLabel with `digitReader`. With no bonus built
 * up there's no "!" button: the bonus is 0.
 */
async function readPot(
	img: RgbaImage,
	reader: TextReader,
	digitReader: () => Promise<TextReader>,
	raw: Record<string, string>,
): Promise<CookingReading> {
	const W = img.width;
	const bands = rowBands(img, W * 0.83, W * 0.98, isLabel, 0.05, Math.round(W * 0.01)).filter(
		(b) => b.top > W * 0.15 && b.bottom < W * 1.2 && b.bottom - b.top > W * 0.012,
	);
	for (const [i, b] of bands.entries()) {
		const pad = W * 0.008;
		const rect = { x: W * 0.83, y: b.top - pad, width: W * 0.16, height: b.bottom - b.top + pad * 2 };
		// The outline is darker than the text and its surroundings, so a brightness threshold finds the letters.
		const text = await reader.read(binarizeText(crop(img, rect)), { chars: "+0123456789%MAX" });
		raw[`label${i}`] = text;
		if (/[A-Z]/i.test(text) || !/\d/.test(text)) continue;
		// The label's own box: its outline's extent.
		const box = boundingBox(img, rect, isLabel);
		const digits = box && labelDigitCount(box.width, box.height);
		if (!box || !digits) return { kind: "pot", warnings: ["tastyBonus"], raw };
		const bonus = await readBonusLabel(img, box, digits, await digitReader(), raw);
		if (!bonus) return { kind: "pot", warnings: ["tastyBonus"], raw };
		return { kind: "pot", tastyBonus: bonus.value, warnings: bonus.sure ? [] : ["tastyBonus"], raw };
	}
	return { kind: "pot", tastyBonus: 0, warnings: [], raw };
}

/** The smallest rectangle around the pixels in `rect` that pass `test`. */
function boundingBox(img: RgbaImage, rect: Rect, test: ColorTest): Rect | undefined {
	let [x0, y0, x1, y1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1, -1];
	for (let y = Math.max(0, Math.round(rect.y)); y < Math.min(img.height, rect.y + rect.height); y++) {
		for (let x = Math.max(0, Math.round(rect.x)); x < Math.min(img.width, rect.x + rect.width); x++) {
			const [r, g, b] = pixel(img, x, y);
			if (!test(r, g, b)) continue;
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
	}
	return x1 < 0 ? undefined : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Reads a cooking result screenshot or a pot screenshot (told apart by the result's dish name banner and the
 * pot screen's two big buttons). `digitReader`: a reader for the pot screen's small bonus digits (Tesseract's
 * English model reads them far better than the Chinese or Japanese one); asked for only when needed. Defaults
 * to `reader`.
 */
export async function readCookingScreenshot(
	img: RgbaImage,
	reader: TextReader,
	digitReader: () => Promise<TextReader> = async () => reader,
): Promise<CookingReading> {
	const banner = findBanner(img);
	if (banner) return readResult(img, banner, reader);
	if (isPotScreen(img)) return readPot(img, reader, digitReader, {});
	return { kind: "unknown", warnings: ["layout"], raw: {} };
}
