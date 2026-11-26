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
 * The title and number's colour: orange (255, 137, 22), pink when Extra Tasty (254, 101, 119), and the peach
 * of digits still fading in (255, 200, 153). Not the yellow sparkles around them (r − g about 40).
 */
const isAccent: ColorTest = (r, g, b) => r > 200 && r - b > 80 && r - g > 45;
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
	const mask = new Uint8ClampedArray(src.width * src.height * 4).fill(255);
	for (let i = 0; i < src.width * src.height; i++) {
		if (test(src.data[i * 4], src.data[i * 4 + 1], src.data[i * 4 + 2])) mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = 0;
	}
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

/** The Extra Tasty bonus is capped at 70 percentage points (see core/tasty.ts). */
const maxTastyBonus = 70;

/**
 * The bonus in a pot screen label: "+20%" → 20 (sure). The label is white text outlined in orange and small,
 * so the "+" and "%" are often misread ("2050", "2000"): then the leading digits are a guess (not sure).
 * Undefined for a label with letters (the pot's "MAX+36") or no digits.
 */
export function parseTastyBonus(text: string): { value: number; sure: boolean } | undefined {
	const s = text.normalize("NFKC").replace(/\s/g, "");
	if (/[A-Z]/i.test(s)) return undefined;
	const sure = s.match(/^\+?(\d{1,2})%$/);
	if (sure && Number(sure[1]) <= maxTastyBonus) return { value: Number(sure[1]), sure: true };
	const digits = s.replace(/^\+/, "").match(/\d+/)?.[0];
	if (!digits) return undefined;
	const two = Number(digits.slice(0, 2));
	return { value: digits.length >= 2 && two <= maxTastyBonus ? two : Number(digits[0]), sure: false };
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
		// other sizes: read at three sizes and go with the majority.
		const texts: string[] = [];
		for (const height of energyTextHeights) texts.push(await reader.read(maskText(img, rect, isAccent, height), { chars: "0123456789," }));
		raw.energy = texts.join(" | ");
		const agreed = agreedValue(texts.map(parseEnergy));
		energy = agreed?.value;
		// Kept as a guess to check unless at least two readings agree.
		if (agreed && agreed.votes < 2) warnings.push("energy");
		pink = pinkness(img, rect) > 0;
	}
	if (energy === undefined) warnings.push("energy");

	// Extra Tasty tag: over the banner's left end.
	const tag = fraction(img, { x: W * 0.1, y: banner.top - W * 0.07, width: W * 0.3, height: W * 0.07 }, isTag) > 0.05;
	if (number && tag !== pink) warnings.push("extraTasty");
	return { kind: "result", recipeId, energy, extraTasty: tag, warnings, raw };
}

async function readPot(img: RgbaImage, reader: TextReader, raw: Record<string, string>): Promise<CookingReading | undefined> {
	const W = img.width;
	// The round buttons down the right edge have labels under them ("MAX+36" under the pot, "+20%" under
	// the "!"): read each label-coloured band there and keep the one with a percent sign, else the first
	// one with digits and no letters.
	const bands = rowBands(img, W * 0.83, W * 0.98, isLabel, 0.05, Math.round(W * 0.01)).filter(
		(b) => b.top > W * 0.15 && b.bottom < W * 1.2 && b.bottom - b.top > W * 0.012,
	);
	let guess: number | undefined;
	for (const [i, b] of bands.entries()) {
		const pad = W * 0.008;
		const rect = { x: W * 0.83, y: b.top - pad, width: W * 0.16, height: b.bottom - b.top + pad * 2 };
		// The outline is darker than the text and its surroundings, so a brightness threshold finds the letters.
		const text = await reader.read(binarizeText(crop(img, rect)), { chars: "+0123456789%MAX" });
		raw[`label${i}`] = text;
		const bonus = parseTastyBonus(text);
		if (bonus?.sure) return { kind: "pot", tastyBonus: bonus.value, warnings: [], raw };
		if (bonus && guess === undefined) guess = bonus.value;
	}
	if (guess === undefined) return undefined;
	return { kind: "pot", tastyBonus: guess, warnings: ["tastyBonus"], raw };
}

/** Reads a cooking result screenshot or a pot screenshot (which one is told by the dish name banner). */
export async function readCookingScreenshot(img: RgbaImage, reader: TextReader): Promise<CookingReading> {
	const banner = findBanner(img);
	if (banner) return readResult(img, banner, reader);
	const raw: Record<string, string> = {};
	return (await readPot(img, reader, raw)) ?? { kind: "unknown", warnings: ["layout"], raw };
}
