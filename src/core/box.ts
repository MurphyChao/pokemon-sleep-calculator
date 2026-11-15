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
	/** Set only on the solvers' level-scaled copies (never saved): the entry's real level. */
	scaledFrom?: number;
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
