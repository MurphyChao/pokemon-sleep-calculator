/**
 * Recognizes ingredient icons by comparing them with reference icons (src/data/ingredient-icons).
 *
 * Locked ingredient slots are drawn faded towards the background, and the "Lv. 30" label overlaps
 * the top of the icon, so the comparison fits a fade factor and only looks at the lower part of
 * each reference icon. The reference icons are drawn at a fixed scale relative to the game's
 * screen width, so the screenshot is shrunk to that scale and the reference slid over the area.
 */
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { crop, pixel, type Rect, type RgbaImage, resize } from "./image";

/** Screen width divided by this = how many screenshot pixels one reference-icon pixel covers. */
const referenceScale = 294.5;
/** Background of an ingredient slot in the game (light cream circle). */
const slotBackground = [255, 251, 236];

interface Reference {
	img: RgbaImage;
	background: [number, number, number];
	/** Pixel indices (y * width + x) of the icon's lower part, where it's not background. */
	mask: number[];
}

const prepared = new WeakMap<RgbaImage, Reference>();

function prepare(img: RgbaImage): Reference {
	let ref = prepared.get(img);
	if (ref) return ref;
	const background = pixel(img, 0, 0);
	const fg: { i: number; y: number }[] = [];
	for (let y = 0; y < img.height; y++) {
		for (let x = 0; x < img.width; x++) {
			const p = pixel(img, x, y);
			if (Math.max(...p.map((v, c) => Math.abs(v - background[c]))) > 40) fg.push({ i: y * img.width + x, y });
		}
	}
	const top = Math.min(...fg.map((p) => p.y));
	const bottom = Math.max(...fg.map((p) => p.y));
	const cut = bottom - (bottom - top) * 0.65;
	ref = { img, background, mask: fg.filter((p) => p.y >= cut).map((p) => p.i) };
	prepared.set(img, ref);
	return ref;
}

/** How different the reference is from the screenshot at its best position (lower = more alike). */
function distance(area: RgbaImage, ref: Reference): number {
	const { img } = ref;
	let best = Number.POSITIVE_INFINITY;
	for (let oy = 0; oy + img.height <= area.height; oy++) {
		for (let ox = 0; ox + img.width <= area.width; ox++) {
			// Least-squares fade factor a: (screenshot - slot bg) ≈ a * (reference - reference bg).
			let qr = 0;
			let rr = 0;
			for (const i of ref.mask) {
				const x = (i % img.width) + ox;
				const y = Math.floor(i / img.width) + oy;
				const q = pixel(area, x, y);
				for (let c = 0; c < 3; c++) {
					const rv = img.data[i * 4 + c] - ref.background[c];
					qr += (q[c] - slotBackground[c]) * rv;
					rr += rv * rv;
				}
			}
			const a = Math.min(1, Math.max(0.2, qr / Math.max(rr, 1e-6)));
			let sum = 0;
			for (const i of ref.mask) {
				const x = (i % img.width) + ox;
				const y = Math.floor(i / img.width) + oy;
				const q = pixel(area, x, y);
				for (let c = 0; c < 3; c++) {
					const d = q[c] - slotBackground[c] - a * (img.data[i * 4 + c] - ref.background[c]);
					sum += d * d;
				}
			}
			best = Math.min(best, Math.sqrt(sum / (ref.mask.length * 3)));
		}
	}
	return best;
}

export interface IconMatch {
	ingredient: IngredientName;
	distance: number;
}

/** Candidates sorted from most to least alike. */
export function matchIngredientIcon(
	screenshot: RgbaImage,
	area: Rect,
	references: Partial<Record<IngredientName, RgbaImage>>,
	candidates: IngredientName[],
): IconMatch[] {
	const scale = screenshot.width / referenceScale;
	const region = crop(screenshot, area);
	const small = resize(region, Math.round(region.width / scale), Math.round(region.height / scale));
	return candidates
		.flatMap((ingredient) => {
			const img = references[ingredient];
			return img ? [{ ingredient, distance: distance(small, prepare(img)) }] : [];
		})
		.sort((a, b) => a.distance - b.distance);
}
