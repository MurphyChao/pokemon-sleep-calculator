import { type BoxEntry, subSkillLevels } from "../core/box";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { subSkillLabel } from "./i18n";

// Cut from the game's subskill badges (src/data/subskill-icons/<name>.png, e.g. helping-bonus.png).
const urls = import.meta.glob("../data/subskill-icons/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;
const bySlug = new Map(Object.entries(urls).map(([path, url]) => [path.replace(/^.*\/|\.png$/g, ""), url]));

export function subSkillIconUrl(name: SubSkillType): string | undefined {
	return bySlug.get(name.toLowerCase().replace(/ /g, "-"));
}

/**
 * A subskill's icon, named in its tooltip and alt text.
 * @param decorative the name is written next to it: no tooltip or alt text, and nothing without an icon.
 */
export function SubSkillIcon(props: { name: SubSkillType; title?: string; className?: string; decorative?: boolean }) {
	const url = subSkillIconUrl(props.name);
	const label = subSkillLabel(props.name);
	const className = ["subskill-icon", props.className].filter(Boolean).join(" ");
	if (props.decorative) return url ? <img src={url} alt="" className={className} /> : null;
	return url ? (
		<img src={url} alt={label} title={props.title ?? label} className={className} />
	) : (
		<span className={className}>{label}</span>
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
