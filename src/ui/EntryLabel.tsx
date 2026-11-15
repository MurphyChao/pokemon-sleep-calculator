import { type BoxEntry, subSkillLevels } from "../core/box";
import { IngredientIcons } from "./IngredientIcons";
import type { EntryLabelParts } from "./names";
import { SubSkillIcons } from "./SubSkillIcons";

/** A box entry's label with any subskills that tell it apart drawn as icons (see buildEntryLabelParts). */
export function EntryLabel(props: { entry: BoxEntry | undefined; parts: EntryLabelParts | undefined }) {
	const { entry, parts } = props;
	if (!entry || !parts) return null;
	const hasSubSkills = subSkillLevels.some((lv) => entry.subSkills[lv]);
	return (
		<>
			{parts.text}
			{parts.detail && (
				<>
					{" "}
					· {parts.detail.nature}
					{hasSubSkills && (
						<>
							{" "}
							· <SubSkillIcons entry={entry} />
						</>
					)}
				</>
			)}
			{parts.nth && ` #${parts.nth}`}
		</>
	);
}

/** EntryLabel with the entry's ingredient icons underneath, for table cells. */
export function EntryName(props: { entry: BoxEntry | undefined; parts: EntryLabelParts | undefined }) {
	return (
		<>
			<EntryLabel entry={props.entry} parts={props.parts} />
			{props.entry && (
				<div>
					<IngredientIcons entry={props.entry} />
				</div>
			)}
		</>
	);
}
