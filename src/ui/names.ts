import { type BoxEntry, subSkillLevels } from "../core/box";
import { getLang, natureLabel, pokemonLabel, subSkillLabel } from "./i18n";

export { ingredientLabel } from "./i18n";

function baseLabel(entry: BoxEntry, withIngredients = true): string {
	const label = `${pokemonLabel(entry.pokemonName)} Lv${entry.level}`;
	return withIngredients ? `${label} ${entry.ingredient}` : label;
}

/**
 * Short form of a subskill: English initials, e.g. "Helping Speed M" → "HSM", "Skill Level Up S" → "SLUS";
 * in Chinese the (already short) translated name.
 */
export function subSkillAbbrev(name: string): string {
	if (getLang() !== "en") return subSkillLabel(name);
	return name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase();
}

/** Subskills in level order, e.g. "HSM/IFM/HB" (empty levels skipped). */
export function subSkillSummary(entry: BoxEntry): string {
	return subSkillLevels
		.map((lv) => entry.subSkills[lv])
		.filter((s): s is NonNullable<typeof s> => !!s)
		.map(subSkillAbbrev)
		.join("/");
}

/** Full description for tooltips: nature and every subskill with its level. */
export function entryTooltip(entry: BoxEntry): string {
	const subs = subSkillLevels
		.filter((lv) => entry.subSkills[lv])
		.map((lv) => `${lv.replace("lv", "Lv")} ${subSkillLabel(entry.subSkills[lv] as string)}`)
		.join(", ");
	return `${baseLabel(entry)} · ${natureLabel(entry.nature)}${subs ? ` · ${subs}` : ""}`;
}

/** A box entry's display label in parts, so table cells can draw the subskills as icons. */
export interface EntryLabelParts {
	/** The nickname, or "Pokémon LvN" (plus ingredient letters when asked for). */
	text: string;
	/** Added when other entries would share the label: the nature, then the subskills (if any). */
	detail?: { nature: string };
	/** Numbers entries that are identical even with their details. */
	nth?: number;
}

/**
 * Display labels for every box entry. Nicknames are used as-is. Entries that would otherwise share
 * a label get their nature and subskills appended, and truly identical ones are numbered.
 * @param opts.ingredients include the ingredient letters ("AAB"); leave them out where ingredient
 *   icons are shown next to the label (entries that differ only in ingredients still count as different).
 */
export function buildEntryLabelParts(
	box: BoxEntry[],
	opts: { ingredients?: boolean } = {},
): Map<string, EntryLabelParts> {
	const withIngredients = opts.ingredients ?? true;
	const labels = new Map<string, EntryLabelParts>();
	const unnamed = box.filter((e) => !e.nickname?.trim());
	for (const e of box) {
		if (e.nickname?.trim()) labels.set(e.id, { text: e.nickname.trim() });
	}
	const groups = new Map<string, BoxEntry[]>();
	for (const e of unnamed) {
		const key = baseLabel(e);
		groups.set(key, [...(groups.get(key) ?? []), e]);
	}
	for (const [key, group] of groups) {
		const text = withIngredients ? key : baseLabel(group[0], false);
		if (group.length === 1) {
			labels.set(group[0].id, { text });
			continue;
		}
		// Compare in full text form; ingredient letters are left out of `text` only for display.
		const detailed = group.map((e) => entryLabelText(e, { text: key, detail: { nature: natureLabel(e.nature) } }));
		detailed.forEach((label, i) => {
			const same = detailed.filter((x) => x === label).length;
			const nth = detailed.slice(0, i + 1).filter((x) => x === label).length;
			labels.set(group[i].id, {
				text,
				detail: { nature: natureLabel(group[i].nature) },
				...(same > 1 && { nth }),
			});
		});
	}
	return labels;
}

/** A label as plain text, e.g. "Crustle Lv70 ABC · Gentle · HB/HSM #2". */
export function entryLabelText(entry: BoxEntry, parts: EntryLabelParts): string {
	let label = parts.text;
	if (parts.detail) {
		const subs = subSkillSummary(entry);
		label += ` · ${parts.detail.nature}${subs ? ` · ${subs}` : ""}`;
	}
	return parts.nth ? `${label} #${parts.nth}` : label;
}

/** Display labels for every box entry as plain text (see buildEntryLabelParts). */
export function buildEntryLabels(box: BoxEntry[], opts: { ingredients?: boolean } = {}): Map<string, string> {
	const byId = new Map(box.map((e) => [e.id, e]));
	return new Map(
		[...buildEntryLabelParts(box, opts)].map(([id, parts]) => [id, entryLabelText(byId.get(id) as BoxEntry, parts)]),
	);
}

export function formatAmount(n: number): string {
	return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export function formatPercent(r: number): string {
	return `${Math.round(r * 100)}%`;
}
