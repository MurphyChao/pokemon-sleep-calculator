import { type BoxEntry, subSkillLevels } from "../core/box";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { subSkillLabel } from "./i18n";
import { SubSkillGlyph } from "./SubSkillGlyph";

/**
 * A subskill's icon, named in its tooltip and accessible label.
 * @param decorative the name is written next to it: no tooltip or label.
 */
export function SubSkillIcon(props: { name: SubSkillType; title?: string; className?: string; decorative?: boolean }) {
	const label = subSkillLabel(props.name);
	const className = ["subskill-icon", props.className].filter(Boolean).join(" ");
	if (props.decorative) return <SubSkillGlyph name={props.name} className={className} />;
	return (
		<span className={className} role="img" aria-label={label} title={props.title ?? label}>
			<SubSkillGlyph name={props.name} />
		</span>
	);
}

/** The entry's subskills as icons in level order; ones above its level (not unlocked yet) are faded. */
export function SubSkillIcons(props: { entry: BoxEntry }) {
	const { entry } = props;
	const levels = subSkillLevels.filter((lv) => entry.subSkills[lv]);
	if (levels.length === 0) return <>–</>;
	return (
		<span className="subskill-icons">
			{levels.map((lv) => {
				const name = entry.subSkills[lv] as SubSkillType;
				const unlocked = entry.level >= Number(lv.slice(2));
				return (
					<SubSkillIcon
						key={lv}
						name={name}
						title={`${lv.replace("lv", "Lv")} ${subSkillLabel(name)}`}
						className={unlocked ? undefined : "locked"}
					/>
				);
			})}
		</span>
	);
}
