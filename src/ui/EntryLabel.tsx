import { type BoxEntry, subSkillLevels } from "../core/box";
import Nature from "../vendor/pokesleep-tool/util/Nature";
import { IngredientIcons } from "./IngredientIcons";
import { NatureEffects } from "./NatureEffects";
import type { EntryLabelParts } from "./names";
import { SubSkillIcons } from "./SubSkillIcons";

/**
 * A box entry's label with the nature and subskills that tell it apart (see buildEntryLabelParts)
 * drawn as icons; a neutral nature, having no effects to draw, keeps its name.
 */
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
					·{" "}
					{new Nature(entry.nature).isNeautral ? parts.detail.nature : <NatureEffects nature={entry.nature} named />}
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

/** EntryLabel followed by the entry's ingredient icons on the same line, for use within sentences. */
export function InlineEntry(props: { entry: BoxEntry | undefined; parts: EntryLabelParts | undefined }) {
	return (
		<span className="inline-entry">
			<EntryLabel entry={props.entry} parts={props.parts} />
			{props.entry && (
				<>
					{" "}
					<IngredientIcons entry={props.entry} />
				</>
			)}
		</span>
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
