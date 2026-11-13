import { useEffect, useState } from "react";
import Nature, { type NatureEffect } from "../vendor/pokesleep-tool/util/Nature";
import { type Key, natureLabel, t } from "./i18n";

type Stat = Exclude<NatureEffect, "No effect">;

const stats: { stat: Stat; label: Key }[] = [
	{ stat: "Speed of help", label: "statHelpSpeed" },
	{ stat: "Energy recovery", label: "statEnergy" },
	{ stat: "Ingredient finding", label: "statIngredients" },
	{ stat: "Main skill chance", label: "statSkill" },
	{ stat: "EXP gains", label: "statExp" },
];

/** Nature name for every (up, down) pair. Neutral natures all behave the same; Serious stands in for them. */
const natureByEffects = new Map<string, string>();
for (const n of Nature.allNatures) {
	if (!n.isNeautral) natureByEffects.set(`${n.upEffect}|${n.downEffect}`, n.name);
}
const neutralNature = "Serious";

function describe(nature: Nature): string {
	if (nature.isNeautral) return t("noEffect");
	const label = (e: NatureEffect) => {
		const key = stats.find((s) => s.stat === e)?.label;
		return key ? t(key) : e;
	};
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
								aria-label={t(row === "up" ? "increaseStat" : "decreaseStat", { stat: t(label) })}
								disabled={other === stat}
								onClick={() => (row === "up" ? pick(selected ? null : stat, down) : pick(up, selected ? null : stat))}
							>
								{t(label)}
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
					{t("neutral")}
				</button>
				{pending ? (
					<span className="warn">{t("pickStat", { arrow: up === null ? "▲" : "▼", name: natureLabel(current.name) })}</span>
				) : (
					<span>
						<strong>{natureLabel(current.name)}</strong> <span className="muted">({describe(current)})</span>
					</span>
				)}
			</div>
		</div>
	);
}
