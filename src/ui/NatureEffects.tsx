import Nature from "../vendor/pokesleep-tool/util/Nature";
import { type Key, natureLabel, t } from "./i18n";
import { type NatureStat, StatGlyph } from "./SubSkillGlyph";

export const statLabels: Record<NatureStat, Key> = {
	"Speed of help": "statHelpSpeed",
	"Energy recovery": "statEnergy",
	"Ingredient finding": "statIngredients",
	"Main skill chance": "statSkill",
	"EXP gains": "statExp",
};

/**
 * ▲ and the icon of the stat a nature raises, ▼ and the one it lowers (nothing for neutral natures).
 * @param named the icons stand in for the nature's name, so the tooltip names it too.
 */
export function NatureEffects(props: { nature: string; named?: boolean }) {
	const nature = new Nature(props.nature);
	if (nature.isNeautral) return null;
	const up = nature.upEffect as NatureStat;
	const down = nature.downEffect as NatureStat;
	const effects = `▲ ${t(statLabels[up])}, ▼ ${t(statLabels[down])}`;
	const label = props.named ? `${natureLabel(props.nature)}: ${effects}` : effects;
	return (
		<span className="nature-effects" role="img" aria-label={label} title={label}>
			<span className="up">
				▲<StatGlyph stat={up} className="stat-icon" />
			</span>
			<span className="down">
				▼<StatGlyph stat={down} className="stat-icon" />
			</span>
		</span>
	);
}
