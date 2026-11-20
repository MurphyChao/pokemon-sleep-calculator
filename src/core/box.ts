import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import Nature from "../vendor/pokesleep-tool/util/Nature";
import PokemonIv, { type IngredientType } from "../vendor/pokesleep-tool/util/PokemonIv";
import SubSkill, { type SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import SubSkillList from "../vendor/pokesleep-tool/util/SubSkillList";

export const subSkillLevels = ["lv10", "lv25", "lv50", "lv70", "lv80"] as const;
export type SubSkillLevel = (typeof subSkillLevels)[number];

/** A Pokémon the user owns, as entered on the Box screen. */
export interface BoxEntry {
	id: string;
	/** Optional name chosen by the user, shown instead of the generated label. */
	nickname?: string;
	pokemonName: string;
	level: number;
	/** Main skill level. Older saved entries may lack it; pokesleep-tool then uses its default. */
	skillLevel?: number;
	/** Ingredient combination, e.g. "ABC" means slot 1 = ing1, slot 2 = ing2, slot 3 = ing3. */
	ingredient: IngredientType;
	nature: string;
	subSkills: Partial<Record<SubSkillLevel, SubSkillType | null>>;
	/**
	 * For a branching line (Ralts, Slowpoke, Eevee): the final form the user plans to evolve it into, used
	 * whenever it's counted as its final form ({@link evolveToFinal}). Missing: {@link defaultEvolution}.
	 */
	evolveTo?: string;
	/** Set only on the solvers' level-scaled copies (never saved): the entry's real level. */
	scaledFrom?: number;
	/** Set only on the solvers' evolved copies (never saved): the Pokémon before evolving. */
	evolvedFrom?: string;
	/** Set only on the solvers' copies with Sub Skill Seeds applied (never saved): the subskills before. */
	seededFrom?: Partial<Record<SubSkillLevel, SubSkillType>>;
}

/** The next quality of a subskill (Helping Speed S → M, Inventory Up M → L), if there is one. */
export function nextSubSkill(name: SubSkillType): SubSkillType | undefined {
	const next = name.endsWith(" S") ? `${name.slice(0, -1)}M` : name.endsWith(" M") ? `${name.slice(0, -1)}L` : undefined;
	return SubSkill.allSubSkillNames.find((n) => n === next);
}

/**
 * The box as the solvers see it with Sub Skill Seeds used as far as they go: each unlocked subskill
 * (slot level ≤ the Pokémon's level) is upgraded one quality at a time (S → M → L) while the upgraded
 * subskill isn't already one of the Pokémon's subskills, since a Pokémon can't have the same subskill
 * twice. Repeats until nothing changes, so Inventory Up S + M ends as M + L. Returns the box itself
 * when off.
 */
export function maxSubSkillSeeds(box: BoxEntry[], on: boolean | undefined): BoxEntry[] {
	if (!on) return box;
	return box.map((e) => {
		const subSkills = { ...e.subSkills };
		const seededFrom: Partial<Record<SubSkillLevel, SubSkillType>> = {};
		for (let changed = true; changed; ) {
			changed = false;
			for (const lv of subSkillLevels) {
				const name = subSkills[lv];
				if (!name || e.level < Number(lv.slice(2))) continue;
				const next = nextSubSkill(name);
				if (!next || subSkillLevels.some((l) => subSkills[l] === next)) continue;
				seededFrom[lv] ??= name;
				subSkills[lv] = next;
				changed = true;
			}
		}
		return Object.keys(seededFrom).length === 0 ? e : { ...e, subSkills, seededFrom };
	});
}

/**
 * What a branching line evolves into by default: the form most players evolve it into for the job it's
 * kept for (Ralts and Slowpoke keep their skill; Eevee most often becomes Espeon). The user can choose
 * another ({@link BoxEntry.evolveTo}).
 */
export const defaultEvolution: Record<string, string> = {
	Ralts: "Gardevoir",
	Kirlia: "Gardevoir",
	Slowpoke: "Slowking",
	Eevee: "Espeon",
};

/**
 * The final forms a Pokémon can evolve into, when there's a choice (Ralts → Gardevoir or Gallade); empty
 * when it's final already, doesn't evolve, or has one path (Toxel's is decided by its nature).
 */
export function evolutionChoices(entry: Pick<BoxEntry, "pokemonName" | "nature">): string[] {
	try {
		const iv = toPokemonIv({ id: "", level: 30, ingredient: "AAA", subSkills: {}, ...entry });
		const finals = iv.decendants.filter((f) => f.id !== iv.pokemon.id);
		return finals.length > 1 ? finals.map((f) => f.name) : [];
	} catch {
		return [];
	}
}

/** The final form an entry is counted as: its only one, or for a branching line the user's choice or the default. */
export function finalFormOf(entry: BoxEntry): string | undefined {
	const choices = evolutionChoices(entry);
	if (choices.length === 0) return undefined;
	return [entry.evolveTo, defaultEvolution[entry.pokemonName]].find((name) => name && choices.includes(name));
}

/**
 * The box as the solvers see it with "final evolution": every Pokémon that can still evolve becomes its
 * final form, with the main skill level +1 per evolution (capped at the new skill's maximum), as
 * pokesleep-tool's "evolved" option does. Lines that branch (Eevee, Ralts, Slowpoke) become the form the
 * user chose, or {@link defaultEvolution}; Toxel evolves by nature. Ingredients, nature and subskills
 * stay. Returns the box itself when off.
 */
export function evolveToFinal(box: BoxEntry[], on: boolean | undefined): BoxEntry[] {
	if (!on) return box;
	return box.map((e) => {
		try {
			const iv = toPokemonIv(e);
			// A branching line: the chosen (or default) form; one with no choice made and no default stays.
			const branch = finalFormOf(e);
			const finals = branch ? iv.decendants.filter((f) => f.name === branch) : iv.decendants;
			// Already final, doesn't evolve, or a branching line without a choice (Toxel's is decided by nature).
			if (finals.length !== 1 || finals[0].id === iv.pokemon.id) return e;
			const final = finals[0];
			const evolved = iv.clone({ pokemonName: final.name });
			const skillLevel = Math.min(evolved.skillLevel, getMaxSkillLevel(final.skill));
			return { ...e, pokemonName: final.name, skillLevel, evolvedFrom: e.pokemonName };
		} catch {
			return e;
		}
	});
}

/**
 * The box as the solvers see it with level scaling: every Pokémon below `level` is treated as being at
 * `level` (its ingredient slots and subskills unlock accordingly); the real level is kept in `scaledFrom`.
 * Returns the box itself when scaling is off.
 */
export function scaleLevels(box: BoxEntry[], level: number | null | undefined): BoxEntry[] {
	if (!level || level <= 1) return box;
	return box.map((e) => (e.level >= level ? e : { ...e, level, scaledFrom: e.level }));
}

export function toPokemonIv(entry: BoxEntry): PokemonIv {
	const subSkills: Partial<Record<SubSkillLevel, SubSkill | null>> = {};
	for (const lv of subSkillLevels) {
		const name = entry.subSkills[lv];
		subSkills[lv] = name ? new SubSkill(name) : null;
	}
	return new PokemonIv({
		pokemonName: entry.pokemonName,
		level: entry.level,
		...(entry.skillLevel !== undefined && { skillLevel: entry.skillLevel }),
		ingredient: entry.ingredient,
		nature: new Nature(entry.nature),
		subSkills: new SubSkillList(subSkills),
	});
}
