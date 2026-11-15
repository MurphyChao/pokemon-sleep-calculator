/** Small line icons for buttons; they take the button's text colour. */
const svgProps = {
	width: 16,
	height: 16,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": true,
} as const;

export function PencilIcon() {
	return (
		<svg {...svgProps}>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

export function TrashIcon() {
	return (
		<svg {...svgProps}>
			<path d="M3 6h18" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
			<path d="M10 11v6M14 11v6" />
		</svg>
	);
}

export function MinusIcon() {
	return (
		<svg {...svgProps}>
			<path d="M5 12h14" />
		</svg>
	);
}

export function PlusIcon() {
	return (
		<svg {...svgProps}>
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}

/** "Not allowed": a circle with a slash. */
export function BanIcon() {
	return (
		<svg {...svgProps}>
			<circle cx="12" cy="12" r="9" />
			<path d="M5.6 5.6l12.8 12.8" />
		</svg>
	);
}

/** Undo: an arrow curving back. */
export function UndoIcon() {
	return (
		<svg {...svgProps}>
			<path d="M3 7v6h6" />
			<path d="M3.5 13a9 9 0 1 0 2.2-8.3L3 7" />
		</svg>
	);
}
