/**
 * Recognizes a Pokémon by the round icon on the left of the "Pokémon details" name card, by comparing it
 * with reference icons cut from the same screen (src/data/sleep-icons, plus ones learned from the user's
 * own imports). Both are shrunk to a small fixed size, and only the inside of the circle is compared,
 * allowing a small shift for where the circle was found.
 */
import { crop, type Rect, type RgbaImage, resize } from "./image";

/** Side of the normalized icons compared (and stored as references), in pixels. */
export const iconSize = 48;
/** Largest shift tried between two icons, in normalized pixels. */
const maxShift = 2;
/** Radius of the compared disc, in normalized pixels: inside the icon's circle. */
const discRadius = iconSize * 0.44;

/** The icon cut from a screenshot and shrunk to iconSize × iconSize. */
export function normalizeIcon(img: RgbaImage, rect: Rect): RgbaImage {
	return resize(crop(img, rect), iconSize, iconSize);
}

const disc: number[] = [];
for (let y = 0; y < iconSize; y++) {
	for (let x = 0; x < iconSize; x++) {
		const c = (iconSize - 1) / 2;
		if (Math.hypot(x - c, y - c) <= discRadius - maxShift) disc.push(y * iconSize + x);
	}
}

/**
 * How different two normalized icons are: the average colour difference (0–1) inside the circle, at the
 * best shift of up to maxShift pixels.
 */
export function iconDistance(a: RgbaImage, b: RgbaImage): number {
	let best = Number.POSITIVE_INFINITY;
	for (let dy = -maxShift; dy <= maxShift; dy++) {
		for (let dx = -maxShift; dx <= maxShift; dx++) {
			let sum = 0;
			for (const i of disc) {
				const x = (i % iconSize) + dx;
				const y = Math.floor(i / iconSize) + dy;
				const j = (y * iconSize + x) * 4;
				const k = i * 4;
				sum += Math.abs(a.data[k] - b.data[j]) + Math.abs(a.data[k + 1] - b.data[j + 1]) + Math.abs(a.data[k + 2] - b.data[j + 2]);
			}
			best = Math.min(best, sum / (disc.length * 3 * 255));
		}
	}
	return best;
}

/** A reference icon (normalized) and the Pokémon it shows. */
export interface IconReference {
	pokemonName: string;
	icon: RgbaImage;
}

export interface IconMatch {
	pokemonName: string;
	distance: number;
}

/**
 * Accepting a match: the icon must be this close to the reference (the same icon on other screen sizes
 * stays within about 0.016; different Pokémon in the reference screenshots are 0.08 or more apart)…
 */
export const maxMatchDistance = 0.04;
/** …and this much closer than the best reference of any other Pokémon. */
export const minMatchMargin = 0.03;

/**
 * The Pokémon whose reference icon matches `icon`, or undefined when no reference is close enough or two
 * different Pokémon are too close to call. Several references of the same Pokémon count as one.
 */
export function matchPokemonIcon(icon: RgbaImage, references: IconReference[]): IconMatch | undefined {
	const best = new Map<string, number>();
	for (const r of references) {
		const d = iconDistance(icon, r.icon);
		if (d < (best.get(r.pokemonName) ?? Number.POSITIVE_INFINITY)) best.set(r.pokemonName, d);
	}
	const ranked = [...best].sort((a, b) => a[1] - b[1]);
	const [top, next] = ranked;
	if (!top || top[1] > maxMatchDistance) return undefined;
	if (next && next[1] - top[1] < minMatchMargin) return undefined;
	return { pokemonName: top[0], distance: top[1] };
}
