import { useId } from "react";
import type { NatureEffect } from "../vendor/pokesleep-tool/util/Nature";
import SubSkill, { type SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";

/**
 * Vector subskill icons, redrawn after the game's subskill badges: the same symbols and gold / blue /
 * silver tiers, with a soft top-to-bottom gradient and an outlined corner mark (+ for the gold
 * bonuses, S/M/L for the sized ones) so they stay crisp and bright at any size.
 */
type Tier = "gold" | "blue" | "silver";

const tierColors: Record<Tier, [string, string]> = {
	gold: ["#ffd45e", "#ee9a00"],
	blue: ["#62c6ff", "#1179ec"],
	silver: ["#c3cddb", "#7a8aa2"],
};

type Shape =
	| "shard"
	| "helpingBonus"
	| "berry"
	| "smile"
	| "exp"
	| "research"
	| "speed"
	| "bag"
	| "levelUp"
	| "apple"
	| "bolt";

const shapes: Record<SubSkillType, Shape> = {
	"Dream Shard Bonus": "shard",
	"Helping Bonus": "helpingBonus",
	"Berry Finding S": "berry",
	"Energy Recovery Bonus": "smile",
	"Sleep EXP Bonus": "exp",
	"Research EXP Bonus": "research",
	"Helping Speed S": "speed",
	"Helping Speed M": "speed",
	"Inventory Up S": "bag",
	"Inventory Up M": "bag",
	"Inventory Up L": "bag",
	"Skill Level Up S": "levelUp",
	"Skill Level Up M": "levelUp",
	"Ingredient Finder S": "apple",
	"Ingredient Finder M": "apple",
	"Skill Trigger S": "bolt",
	"Skill Trigger M": "bolt",
};

function tierOf(name: SubSkillType): Tier {
	const s = new SubSkill(name);
	return s.isGold ? "gold" : s.isBlue ? "blue" : "silver";
}

/** The corner mark: the size letter (S/M/L) at the end of the name, else "+" (as in the game, Berry Finding S has a +). */
function markOf(name: SubSkillType): string {
	const size = / ([SML])$/.exec(name)?.[1];
	return name === "Berry Finding S" || !size ? "+" : size;
}

/** The symbol, drawn in a 20×20 area at the bottom left of the 24×24 icon; `p` is the paint. */
function Symbol(props: { shape: Shape; p: string }) {
	const { shape, p } = props;
	const line = { fill: "none", stroke: p, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;
	switch (shape) {
		case "speed":
			return (
				<>
					<path d="M3.5 13.5 10 8l6.5 5.5" {...line} strokeWidth={3} />
					<path d="M3.5 20 10 14.5l6.5 5.5" {...line} strokeWidth={3} />
				</>
			);
		case "helpingBonus":
			return (
				<>
					<circle cx="10" cy="14.5" r="7.6" {...line} strokeWidth={2.2} />
					<path d="M6.6 14.6 10 11.8l3.4 2.8M6.6 18.2 10 15.4l3.4 2.8" {...line} strokeWidth={2} />
				</>
			);
		case "smile":
			return (
				<>
					<circle cx="10" cy="14.5" r="7.6" {...line} strokeWidth={2.2} />
					<circle cx="7.3" cy="12.6" r="1.25" fill={p} />
					<circle cx="12.7" cy="12.6" r="1.25" fill={p} />
					<path d="M6.6 15.8q3.4 3.4 6.8 0" {...line} strokeWidth={2} />
				</>
			);
		case "exp":
			// Drawn as strokes rather than <text>, so the icon adds no characters to the page text.
			return <path d="M1.6 11.6v7.6h3.6M1.6 11.6h3.6M1.6 15.4h3M7.2 11.6l3.6 7.6M10.8 11.6l-3.6 7.6M13.2 19.2v-7.6h2.1a2.1 2.1 0 0 1 0 4.2h-2.1" {...line} strokeWidth={1.8} />;
		case "research":
			return (
				<>
					<path d="M4.5 5.5h7l4 4V21a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" {...line} strokeWidth={2} />
					<path d="M11.5 5.5v4h4" {...line} strokeWidth={1.6} />
					<circle cx="9" cy="15" r="3" {...line} strokeWidth={2} />
					<path d="m11.2 17.2 2.6 2.6" {...line} strokeWidth={2.2} />
				</>
			);
		case "shard":
			return (
				<>
					<path d="M10 4.5 16.5 11 10 22.5 3.5 11Z" fill={p} />
					<path d="M3.5 11h13M10 4.5 7.6 11 10 22.5 12.4 11Z" fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
				</>
			);
		case "berry":
			// Acorn-like, as in the game: a cap over a rounded nut.
			return (
				<>
					<path d="M4.6 12.6h10.8v1.2c0 4.1-2.6 7.4-5.4 8.7-2.8-1.3-5.4-4.6-5.4-8.7Z" fill={p} />
					<path d="M3.6 12.8c0-3.4 2.9-5.6 6.4-5.6s6.4 2.2 6.4 5.6Z" fill={p} />
					<path d="M4.3 12.9h11.4" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.1} />
					<path d="M10 7.4V4.8" {...line} strokeWidth={1.8} />
					<ellipse cx="7.4" cy="16" rx="1.1" ry="1.8" fill="#fff" fillOpacity={0.55} transform="rotate(15 7.4 16)" />
				</>
			);
		case "bag":
			return (
				<>
					<path d="M7 9V7.5a3 3 0 0 1 6 0V9" {...line} strokeWidth={2} />
					<rect x="3.2" y="9" width="13.6" height="13" rx="3" {...line} strokeWidth={2.2} />
					<path d="M6.8 14.2h6.4" {...line} strokeWidth={2} />
					<rect x="8.4" y="13.2" width="3.2" height="3" rx="0.8" fill={p} />
				</>
			);
		case "levelUp":
			return (
				<>
					<path d="M10 3.8 16 10h-3.4v4h-5.2v-4H4Z" fill={p} stroke={p} strokeWidth={1} strokeLinejoin="round" />
					<path d="M4.5 18h11M4.5 21.6h11" {...line} strokeWidth={2.2} />
				</>
			);
		case "apple":
			return (
				<>
					<path
						d="M10 10.2c-1.8-1.3-6.2-1.2-6.2 3.9 0 4.1 2.8 7.9 4.4 7.9.8 0 1.1-.5 1.8-.5s1 .5 1.8.5c1.6 0 4.4-3.8 4.4-7.9 0-5.1-4.4-5.2-6.2-3.9Z"
						fill={p}
					/>
					<path d="M10 10.2c0-1.9.5-3.1 1.6-4" {...line} strokeWidth={1.6} />
					<path d="M11.4 7.4c.6-1.6 2.2-2.4 3.9-2.1-.5 1.6-2 2.5-3.9 2.1Z" fill={p} />
					<ellipse cx="7" cy="13.6" rx="1.3" ry="2" fill="#fff" fillOpacity={0.5} transform="rotate(20 7 13.6)" />
				</>
			);
		case "bolt":
			return <path d="M12.6 3.5 4.5 14.2h5.3L7.6 22.5l8.6-11.2h-5.4l1.8-7.8Z" fill={p} stroke={p} strokeWidth={0.8} strokeLinejoin="round" />;
	}
}

/** Corner marks as strokes (a <text> would add characters to the page text). */
const markPaths: Record<string, string> = {
	"+": "M20.5 1.8v6M17.5 4.8h6",
	S: "M22.4 2.7c-.5-.6-1.2-.9-2-.9-1.1 0-2 .7-2 1.6 0 2 4.3 1.2 4.3 3.2 0 1-.9 1.7-2.2 1.7-.9 0-1.7-.4-2.2-1",
	M: "M17.4 8.2V1.8l3.1 4 3.1-4v6.4",
	L: "M18.6 1.8v6.4h4",
};

/** A subskill's vector icon (24×24 viewBox; size it with CSS). Decorative: label it on a wrapper. */
export function SubSkillGlyph(props: { name: SubSkillType; className?: string }) {
	const id = useId().replace(/:/g, "");
	const [top, bottom] = tierColors[tierOf(props.name)];
	const paint = `url(#g${id})`;
	const mark = markPaths[markOf(props.name)];
	// Outline around the corner mark in the card colour, separating it from the symbol in light and dark themes.
	const halo = { stroke: "var(--card, #fff)" };
	const markStroke = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
	return (
		<svg viewBox="0 0 24 24" className={props.className} aria-hidden="true" focusable="false">
			<defs>
				<linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="3" x2="0" y2="23">
					<stop offset="0" stopColor={top} />
					<stop offset="1" stopColor={bottom} />
				</linearGradient>
			</defs>
			<Symbol shape={shapes[props.name]} p={paint} />
			<path d={mark} {...markStroke} style={halo} strokeWidth={4} />
			<path d={mark} {...markStroke} stroke={paint} strokeWidth={markOf(props.name) === "+" ? 2 : 1.7} />
		</svg>
	);
}

export type NatureStat = Exclude<NatureEffect, "No effect">;

const statShapes: Record<NatureStat, Shape> = {
	"Speed of help": "speed",
	"Energy recovery": "smile",
	"Ingredient finding": "apple",
	"Main skill chance": "bolt",
	"EXP gains": "exp",
};

/**
 * The symbol of a stat a nature raises or lowers, matching the subskill icons (speed chevrons, smile,
 * apple, lightning, EXP), drawn in the current text colour without a corner mark. Decorative.
 */
export function StatGlyph(props: { stat: NatureStat; className?: string }) {
	return (
		<svg viewBox="0 3 20 20" className={props.className} aria-hidden="true" focusable="false">
			<Symbol shape={statShapes[props.stat]} p="currentColor" />
		</svg>
	);
}
