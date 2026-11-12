import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import en from "../vendor/pokesleep-tool/i18n/en/data.json";
import { type BoxEntry, subSkillLevels } from "../core/box";

const ingredientNames = (en as { ingredients: Record<string, string> }).ingredients;

export function ingredientLabel(name: IngredientName): string {
	return ingredientNames[name] ?? name;
}

function baseLabel(entry: BoxEntry): string {
	return `${entry.pokemonName} Lv${entry.level} ${entry.ingredient}`;
}

/** Short form of a subskill, e.g. "Helping Speed M" → "HSM", "Skill Level Up S" → "SLUS". */
export function subSkillAbbrev(name: string): string {
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
		.map((lv) => `${lv.replace("lv", "Lv")} ${entry.subSkills[lv]}`)
		.join(", ");
	return `${baseLabel(entry)} · ${entry.nature}${subs ? ` · ${subs}` : ""}`;
}

/**
 * Display labels for every box entry. Nicknames are used as-is. Entries that would otherwise share
 * a label get their nature and subskills appended, and truly identical ones are numbered.
 */
export function buildEntryLabels(box: BoxEntry[]): Map<string, string> {
	const labels = new Map<string, string>();
	const unnamed = box.filter((e) => !e.nickname?.trim());
	for (const e of box) {
		if (e.nickname?.trim()) labels.set(e.id, e.nickname.trim());
	}
	const groups = new Map<string, BoxEntry[]>();
	for (const e of unnamed) {
		const key = baseLabel(e);
		groups.set(key, [...(groups.get(key) ?? []), e]);
	}
	for (const [base, group] of groups) {
		if (group.length === 1) {
			labels.set(group[0].id, base);
			continue;
		}
		const detailed = group.map((e) => {
			const subs = subSkillSummary(e);
			return `${base} · ${e.nature}${subs ? ` · ${subs}` : ""}`;
		});
		detailed.forEach((label, i) => {
			const same = detailed.filter((x) => x === label).length;
			const nth = detailed.slice(0, i + 1).filter((x) => x === label).length;
			labels.set(group[i].id, same > 1 ? `${label} #${nth}` : label);
		});
	}
	return labels;
}

export function formatAmount(n: number): string {
	return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

export function formatPercent(r: number): string {
	return `${Math.round(r * 100)}%`;
}
