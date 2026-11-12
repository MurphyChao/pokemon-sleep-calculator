import { useEffect, useState } from "react";
import Nature, { type NatureEffect } from "../vendor/pokesleep-tool/util/Nature";

type Stat = Exclude<NatureEffect, "No effect">;

const stats: { stat: Stat; label: string }[] = [
	{ stat: "Speed of help", label: "Help speed" },
	{ stat: "Energy recovery", label: "Energy" },
	{ stat: "Ingredient finding", label: "Ingredients" },
	{ stat: "Main skill chance", label: "Skill" },
	{ stat: "EXP gains", label: "EXP" },
];

/** Nature name for every (up, down) pair. Neutral natures all behave the same; Serious stands in for them. */
const natureByEffects = new Map<string, string>();
for (const n of Nature.allNatures) {
	if (!n.isNeautral) natureByEffects.set(`${n.upEffect}|${n.downEffect}`, n.name);
}
const neutralNature = "Serious";

function describe(nature: Nature): string {
	if (nature.isNeautral) return "no effect";
	const label = (e: NatureEffect) => stats.find((s) => s.stat === e)?.label ?? e;
	return `▲ ${label(nature.upEffect)}, ▼ ${label(nature.downEffect)}`;
}

/**
 * Pick a nature by its effects: one stat in the ▲ row and one in the ▼ row,
 * or "Neutral". The nature only changes once both rows are chosen.
 */
export default function NaturePicker(props: { value: string; onChange: (nature: string) => void }) {
	const { value, onChange } = props;
	const current = new Nature(value);
	const [up, setUp] = useState<Stat | null>(null);
	const [down, setDown] = useState<Stat | null>(null);

	// Follow the value when it changes from outside (e.g. editing another Pokémon).
	useEffect(() => {
		const n = new Nature(value);
		setUp(n.isNeautral ? null : (n.upEffect as Stat));
		setDown(n.isNeautral ? null : (n.downEffect as Stat));
	}, [value]);

	const pick = (nextUp: Stat | null, nextDown: Stat | null) => {
		setUp(nextUp);
		setDown(nextDown);
		if (nextUp && nextDown) {
			const name = natureByEffects.get(`${nextUp}|${nextDown}`);
			if (name) onChange(name);
		}
	};
	const pending = (up === null) !== (down === null);
	const isNeutral = up === null && down === null;

	return (
		<div className="nature-picker">
			{(["up", "down"] as const).map((row) => (
				<div className="nature-row" key={row}>
					<span className={`nature-arrow ${row}`}>{row === "up" ? "▲" : "▼"}</span>
					{stats.map(({ stat, label }) => {
						const selected = row === "up" ? up === stat : down === stat;
						const other = row === "up" ? down : up;
						return (
							<button
								type="button"
								key={stat}
								className={`nature-button ${row} ${selected ? "selected" : ""}`}
								aria-pressed={selected}
								aria-label={`${row === "up" ? "Increase" : "Decrease"} ${label}`}
								disabled={other === stat}
								onClick={() => (row === "up" ? pick(selected ? null : stat, down) : pick(up, selected ? null : stat))}
							>
								{label}
							</button>
						);
					})}
				</div>
			))}
			<div className="nature-result">
				<button
					type="button"
					className={`nature-button neutral ${isNeutral ? "selected" : ""}`}
					aria-pressed={isNeutral}
					onClick={() => {
						pick(null, null);
						onChange(neutralNature);
					}}
				>
					Neutral
				</button>
				{pending ? (
					<span className="warn">Pick a {up === null ? "▲" : "▼"} stat (still {current.name})</span>
				) : (
					<span>
						<strong>{current.name}</strong> <span className="muted">({describe(current)})</span>
					</span>
				)}
			</div>
		</div>
	);
}
