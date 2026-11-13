import { type SubSkillLevel, subSkillLevels } from "../core/box";
import SubSkill, { type SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { subSkillLabel, t } from "./i18n";

export type SubSkillSelection = Partial<Record<SubSkillLevel, SubSkillType | null>>;

const levelLabel = (lv: SubSkillLevel) => lv.replace("lv", "Lv");

// Gold first, then blue, then white, as in the game.
const allSubSkills = [...SubSkill.allSubSkills].sort((a, b) => rarityRank(a) - rarityRank(b));

function rarityRank(s: SubSkill): number {
	return s.isGold ? 0 : s.isBlue ? 1 : 2;
}

function rarityClass(s: SubSkill): string {
	return s.isGold ? "gold" : s.isBlue ? "blue" : "white";
}

/**
 * Click a subskill to put it in the first empty level (Lv10 → 25 → 50 → 70 → 80).
 * Click a chosen one again to remove it; its level is left empty so the next click fills it.
 */
export default function SubSkillPicker(props: {
	value: SubSkillSelection;
	onChange: (value: SubSkillSelection) => void;
}) {
	const { value, onChange } = props;
	const levelOf = new Map<SubSkillType, SubSkillLevel>();
	for (const lv of subSkillLevels) {
		const name = value[lv];
		if (name) levelOf.set(name, lv);
	}
	const nextEmpty = subSkillLevels.find((lv) => !value[lv]);

	const toggle = (name: SubSkillType) => {
		const lv = levelOf.get(name);
		if (lv) {
			onChange({ ...value, [lv]: null });
		} else if (nextEmpty) {
			onChange({ ...value, [nextEmpty]: name });
		}
	};

	return (
		<div className="subskill-picker">
			<div className="subskill-slots">
				{subSkillLevels.map((lv) => {
					const name = value[lv];
					return (
						<button
							type="button"
							key={lv}
							className={`subskill-slot ${name ? rarityClass(new SubSkill(name)) : "empty"} ${
								lv === nextEmpty ? "next" : ""
							}`}
							disabled={!name}
							title={name ? t("removeSubskill", { name: subSkillLabel(name) }) : undefined}
							onClick={() => name && onChange({ ...value, [lv]: null })}
						>
							<span className="lv">{levelLabel(lv)}</span>
							{name ? subSkillLabel(name) : "—"}
						</button>
					);
				})}
				<button
					type="button"
					className="secondary"
					disabled={levelOf.size === 0}
					onClick={() => onChange(Object.fromEntries(subSkillLevels.map((lv) => [lv, null])))}
				>
					{t("clear")}
				</button>
			</div>
			<div className="subskill-grid">
				{allSubSkills.map((s) => {
					const lv = levelOf.get(s.name);
					return (
						<button
							type="button"
							key={s.name}
							className={`subskill-button ${rarityClass(s)} ${lv ? "selected" : ""}`}
							disabled={!lv && !nextEmpty}
							aria-pressed={lv !== undefined}
							onClick={() => toggle(s.name)}
						>
							{subSkillLabel(s.name)}
							{lv && <span className="lv">{levelLabel(lv)}</span>}
						</button>
					);
				})}
			</div>
		</div>
	);
}
