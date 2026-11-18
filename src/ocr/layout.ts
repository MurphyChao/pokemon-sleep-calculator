/**
 * Finds the parts of a Pokémon Sleep "Pokémon details" screenshot we read.
 *
 * Everything in the game's layout scales with the screen width, so positions are fractions of the
 * width (W), measured from two anchors that are easy to find at any scroll position: the green
 * "Main skill / Subskills" and "Details" section headers. Measured on iPhone (1206 px wide) and
 * Android (1080 px wide) screenshots in Traditional Chinese and Japanese.
 */
import { type Rect, type RgbaImage, pixel } from "./image";
import type { SubSkillLevel } from "../core/box";

export interface Layout {
	/** Line with "Lv. 22 <species name>" on the name card. */
	nameLine: Rect;
	/** Square around the Pokémon's round icon at the left of the name card. */
	nameIcon: Rect;
	/** "Lv.1" next to the main skill name. */
	skillLevel: Rect;
	/** Text area of each subskill box, plus a patch of its background to tell gold/blue/white apart. */
	subSkills: { level: SubSkillLevel; text: Rect; background: Rect }[];
	nature: Rect;
	/** Areas to search for the Lv30 and Lv60 ingredient icons. */
	ingredients: { lv30: Rect; lv60: Rect };
	width: number;
}

export class LayoutError extends Error {}

interface Bar {
	top: number;
	bottom: number;
}

/** Rows that are mostly the section-header green (about rgb(25, 214, 104)). */
function findHeaderBars(img: RgbaImage): Bar[] {
	const { width: W, height: H } = img;
	const bars: Bar[] = [];
	const step = Math.max(1, Math.floor(W / 300));
	for (let y = 0; y < H; y++) {
		let green = 0;
		let total = 0;
		for (let x = 0; x < W; x += step) {
			const [r, g, b] = pixel(img, x, y);
			if (g > 180 && r < 90 && b > 70 && b < 140) green++;
			total++;
		}
		if (green / total > 0.6) {
			const last = bars[bars.length - 1];
			if (last && y - last.bottom <= 2) last.bottom = y;
			else bars.push({ top: y, bottom: y });
		}
	}
	// Ignore thin lines and headers cut off by the top of the screen.
	return bars.filter((b) => b.bottom - b.top > W * 0.035 && b.top > 0);
}

/** Top of the name card: the first run of rows whose left edge is the card's orange stripe. */
function findNameCardTop(img: RgbaImage): number | undefined {
	const { width: W, height: H } = img;
	const edge = Math.max(1, Math.floor(W * 0.025));
	for (let y = 0; y < H * 0.4; y++) {
		let orange = 0;
		for (let x = 0; x < edge; x++) {
			const [r, g, b] = pixel(img, x, y);
			if (r > 230 && g > 100 && g < 150 && b < 110) orange++;
		}
		if (orange / edge > 0.8) return y;
	}
	return undefined;
}

const levels: SubSkillLevel[] = ["lv10", "lv25", "lv50", "lv70", "lv80"];

export function detectLayout(img: RgbaImage): Layout {
	const W = img.width;
	const bars = findHeaderBars(img);
	// The subskill header and the details header are about one screen width apart
	// (more or less depending on how many lines the main skill description takes).
	let pair: [Bar, Bar] | undefined;
	for (let i = 0; i + 1 < bars.length; i++) {
		const gap = bars[i + 1].top - bars[i].top;
		if (gap > W * 0.8 && gap < W * 1.15) pair = [bars[i], bars[i + 1]];
	}
	if (!pair) throw new LayoutError("Couldn't find the subskill section");
	const [skills, details] = pair;
	const cardTop = findNameCardTop(img) ?? W * 0.133;

	const band = (centerY: number, x0: number, x1: number, height: number): Rect => ({
		x: W * x0,
		y: centerY - (W * height) / 2,
		width: W * (x1 - x0),
		height: W * height,
	});

	const rowCenters = [-0.478, -0.319, -0.16].map((f) => details.top + W * f);
	const columns = [
		[0.073, 0.474],
		[0.527, 0.928],
	];
	const subSkills = levels.map((level, i) => {
		const row = Math.floor(i / 2);
		const [x0, x1] = columns[i % 2];
		const cy = rowCenters[row];
		return {
			level,
			text: band(cy, x0 + 0.017, x1 - 0.017, 0.064),
			background: band(cy, x0 + 0.012, x0 + 0.045, 0.02),
		};
	});

	const iconY = skills.top - W * 0.431;
	return {
		nameLine: band(cardTop + W * 0.112, 0.2, 0.56, 0.06),
		nameIcon: band(cardTop + W * 0.0804, 0.124 - 0.065, 0.124 + 0.065, 0.13),
		skillLevel: band(skills.top + W * 0.185, 0.8, 0.935, 0.06),
		subSkills,
		nature: band(details.top + W * 0.19, 0.12, 0.43, 0.07),
		ingredients: {
			lv30: band(iconY, 0.6, 0.72, 0.14),
			lv60: band(iconY, 0.765, 0.885, 0.14),
		},
		width: W,
	};
}

export type Rarity = "gold" | "blue" | "white";

/** Gold, blue or white subskill box, from the average colour of a patch of its background. */
export function boxRarity(img: RgbaImage, r: Rect): Rarity {
	let sr = 0;
	let sb = 0;
	let n = 0;
	for (let y = Math.round(r.y); y < r.y + r.height; y++) {
		for (let x = Math.round(r.x); x < r.x + r.width; x++) {
			const [pr, , pb] = pixel(img, x, y);
			sr += pr;
			sb += pb;
			n++;
		}
	}
	const red = sr / n;
	const blue = sb / n;
	if (red - blue > 25) return "gold";
	if (blue - red > 8) return "blue";
	return "white";
}
