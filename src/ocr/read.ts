/**
 * Reads a Pokémon details screenshot into a box entry: species, level, main skill level, nature,
 * subskills (OCR + fuzzy matching against the game's names) and ingredients (icon matching).
 */
import { type BoxEntry, type SubSkillLevel, subSkillLevels } from "../core/box";
import jaData from "../vendor/pokesleep-tool/i18n/ja/data.json";
import jaPokemons from "../vendor/pokesleep-tool/i18n/ja/pokemons.json";
import zhData from "../vendor/pokesleep-tool/i18n/zh-TW/data.json";
import zhPokemons from "../vendor/pokesleep-tool/i18n/zh-TW/pokemons.json";
import pokemons, { getPokemonRarity, type IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import Nature from "../vendor/pokesleep-tool/util/Nature";
import type { IngredientType } from "../vendor/pokesleep-tool/util/PokemonIv";
import SubSkill, { type SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import { binarizeText, crop, type RgbaImage } from "./image";
import { type IconMatch, matchIngredientIcon } from "./ingredients";
import { boxRarity, detectLayout, LayoutError, type Rarity } from "./layout";
import { bestMatch, type Candidate } from "./match";
import { type IconReference, matchPokemonIcon, normalizeIcon } from "./pokemonIcon";

/** Reads one line of text from a prepared (black on white) image. */
export interface TextReader {
	/** `digits`: only "Lv." and digits; `chars`: only these characters (overrides `digits`). */
	read(img: RgbaImage, opts?: { digits?: boolean; chars?: string }): Promise<string>;
}

export type ImportWarning =
	| "layout"
	| "pokemon"
	/** Several forms share the name shown in the game (e.g. Pumpkaboo sizes) and the icons didn't tell them apart. */
	| "form"
	/** The icon and the name point to different Pokémon (the icon was used); see iconPokemon / namePokemon. */
	| "iconName"
	| "level"
	| "skillLevel"
	| "nature"
	| "ingredients"
	| SubSkillLevel;

export interface ScreenshotReading {
	/** Entry ready for review; pokemonName is "" when the species wasn't recognized. */
	entry: BoxEntry;
	/** Fields that couldn't be read and were left at a default. */
	warnings: ImportWarning[];
	/** Best-matching ingredient for the Lv30 / Lv60 icons, also when the species is unknown. */
	ingredientIcons?: { lv30?: IngredientName; lv60?: IngredientName };
	/** Raw OCR text, for debugging. */
	raw: Record<string, string>;
	/** The Pokémon's icon from the name card, normalized (see pokemonIcon.ts), to learn from once confirmed. */
	pokemonIcon?: RgbaImage;
	/** Pokémon recognized from the icon, if any. */
	iconPokemon?: string;
	/** Pokémon recognized from the name, if any (a nickname or a misreading gives none). */
	namePokemon?: string;
}

type Translations = { subskill: Record<string, string>; natures: Record<string, string> };
const zh = zhData as unknown as Translations;
const ja = jaData as unknown as Translations;
const zhNames = (zhPokemons as { pokemons: Record<string, string> }).pokemons;
const jaNames = (jaPokemons as { pokemons: Record<string, string> }).pokemons;

const names = (en: string, ...maps: Record<string, string>[]) => [en, ...maps.map((m) => m[en]).filter(Boolean)];

const subSkillCandidates: (Candidate<SubSkillType> & { rarity: Rarity })[] = SubSkill.allSubSkills.map((s) => ({
	key: s.name,
	names: names(s.name, zh.subskill, ja.subskill),
	rarity: s.isGold ? "gold" : s.isBlue ? "blue" : "white",
}));
const natureCandidates: Candidate<string>[] = Nature.allNatures.map((n) => ({
	key: n.name,
	names: names(n.name, zh.natures, ja.natures),
}));
/** "南瓜精 (小顆種)" → "南瓜精": the game shows forms without the part in brackets. */
const withoutForm = (name: string) => name.replace(/\s*[(（].*?[)）]/g, "");

// Mythical Pokémon aren't supported by the box yet.
const pokemonCandidates: (Candidate<string> & { shown: string[] })[] = pokemons
	.filter((p) => getPokemonRarity(p) !== "mythical")
	.map((p) => {
		const shown = names(p.name, zhNames, jaNames).map(withoutForm);
		return { key: p.name, names: [...new Set([...names(p.name, zhNames, jaNames), ...shown])], shown };
	});

/** Pokémon (forms) shown in the game under the same name as `name`, base form first. */
export function formsSharingName(name: string): string[] {
	const shown = pokemonCandidates.find((c) => c.key === name)?.shown ?? [];
	return pokemonCandidates.filter((c) => c.shown.some((n) => shown.includes(n))).map((c) => c.key);
}

function readLevel(text: string): number | undefined {
	const m = text.normalize("NFKC").match(/L\s*[vV][.,]?\s*(\d{1,3})/) ?? text.normalize("NFKC").match(/(\d{1,3})/);
	const n = m ? Number(m[1]) : Number.NaN;
	return n >= 1 && n <= 100 ? n : undefined;
}

function withoutLevel(text: string): string {
	return text.normalize("NFKC").replace(/L\s*[vV][.,]?\s*\d{0,3}/, "").replace(/\d/g, "");
}

/** Letter of the first ingredient slot (A, B, C) holding `ingredient`. */
function slotLetter(slots: (IngredientName | undefined)[], ingredient: IngredientName): string {
	return "ABC"[slots.indexOf(ingredient)];
}

/**
 * Reads a "Pokémon details" screenshot. The species comes from the icon on the name card when one of
 * `pokemonIcons` matches it confidently, otherwise from the name (which also gives the level); a form
 * sharing the name (e.g. Pumpkaboo sizes) is then chosen by the ingredient icons.
 */
export async function readScreenshot(
	img: RgbaImage,
	reader: TextReader,
	ingredientIcons: Partial<Record<IngredientName, RgbaImage>>,
	pokemonIcons: IconReference[] = [],
): Promise<ScreenshotReading> {
	const warnings: ImportWarning[] = [];
	const raw: Record<string, string> = {};
	const entry: BoxEntry = { id: "", pokemonName: "", level: 30, ingredient: "AAA", nature: "Serious", subSkills: {} };

	let layout: ReturnType<typeof detectLayout>;
	try {
		layout = detectLayout(img);
	} catch (e) {
		if (e instanceof LayoutError) return { entry, warnings: ["layout"], raw };
		throw e;
	}
	const readText = (rect: (typeof layout)["nature"], opts?: { digits?: boolean }) =>
		reader.read(binarizeText(crop(img, rect)), opts);

	// Name card: "Lv. 22 古月鳥"
	raw.name = await readText(layout.nameLine);
	const level = readLevel(raw.name);
	if (level) entry.level = level;
	else warnings.push("level");
	const namePokemon = bestMatch(withoutLevel(raw.name), pokemonCandidates, { partial: true })?.key;
	// Forms that share a name look alike: their references count as one Pokémon (the ingredients decide).
	const pokemonIcon = normalizeIcon(img, layout.nameIcon);
	const iconPokemon = matchPokemonIcon(
		pokemonIcon,
		pokemonIcons.map((r) => ({ ...r, pokemonName: formsSharingName(r.pokemonName)[0] ?? r.pokemonName })),
	)?.pokemonName;
	const found = iconPokemon ?? namePokemon;
	const forms = found ? formsSharingName(found) : [];
	if (found) entry.pokemonName = forms[0];
	else warnings.push("pokemon");
	if (iconPokemon && namePokemon && !forms.includes(namePokemon)) warnings.push("iconName");
	// Choose among same-named forms by their ingredients (below); the main skill level check uses the first.
	let species = pokemons.find((p) => p.name === entry.pokemonName);

	raw.skillLevel = await readText(layout.skillLevel, { digits: true });
	const skillLevel = readLevel(raw.skillLevel);
	if (skillLevel && (!species || skillLevel <= getMaxSkillLevel(species.skill))) entry.skillLevel = skillLevel;
	else warnings.push("skillLevel");

	for (const cell of layout.subSkills) {
		const text = await readText(cell.text);
		raw[cell.level] = text;
		const rarity = boxRarity(img, cell.background);
		// The box colour narrows it down; fall back to all subskills if the colour was misjudged.
		const match =
			bestMatch(
				text,
				subSkillCandidates.filter((c) => c.rarity === rarity),
			) ?? bestMatch(text, subSkillCandidates, { maxScore: 0.25 });
		entry.subSkills[cell.level] = match?.key ?? null;
		if (!match) warnings.push(cell.level);
	}
	// The same subskill can't appear twice; keep the closer reading and flag the other.
	const seen = new Set<string>();
	for (const lv of subSkillLevels) {
		const s = entry.subSkills[lv];
		if (s && seen.has(s)) {
			entry.subSkills[lv] = null;
			warnings.push(lv);
		}
		if (s) seen.add(s);
	}

	raw.nature = await readText(layout.nature);
	const nature = bestMatch(raw.nature, natureCandidates);
	if (nature) entry.nature = nature.key;
	else warnings.push("nature");

	// Ingredients: Lv1 is always slot A (and is usually hidden behind the name card).
	// Lv30 is A or B, Lv60 is A, B or C.
	const all = Object.keys(ingredientIcons) as IngredientName[];
	const best = (area: (typeof layout.ingredients)["lv30"], candidates: IngredientName[]): IconMatch | undefined =>
		matchIngredientIcon(img, area, ingredientIcons, candidates)[0];
	const icons = { lv30: best(layout.ingredients.lv30, all)?.ingredient, lv60: best(layout.ingredients.lv60, all)?.ingredient };
	const readings = forms.flatMap((name) => {
		const p = pokemons.find((x) => x.name === name);
		if (!p) return [];
		const slots = [p.ing1?.name, p.ing2?.name, p.ing3?.name];
		const options = (n: number) => [...new Set(slots.slice(0, n).filter((s): s is IngredientName => !!s))];
		const lv30 = best(layout.ingredients.lv30, options(2));
		const lv60 = best(layout.ingredients.lv60, options(3));
		if (!lv30 || !lv60) return [];
		const ingredient = `A${slotLetter(slots, lv30.ingredient)}${slotLetter(slots, lv60.ingredient)}` as IngredientType;
		return [{ name, ingredient, distance: lv30.distance + lv60.distance, slots: slots.join() }];
	});
	if (readings.length > 0) {
		const top = readings.reduce((a, b) => (b.distance < a.distance ? b : a));
		entry.pokemonName = top.name;
		entry.ingredient = top.ingredient;
		species = pokemons.find((p) => p.name === top.name);
		// Forms with the same ingredients can't be told apart by the icons.
		if (readings.filter((r) => r.slots === top.slots).length > 1) warnings.push("form");
	} else {
		warnings.push("ingredients");
		if (forms.length > 1) warnings.push("form");
	}
	if (entry.skillLevel && species && entry.skillLevel > getMaxSkillLevel(species.skill)) {
		entry.skillLevel = undefined;
		warnings.push("skillLevel");
	}
	return {
		entry,
		warnings,
		ingredientIcons: icons,
		raw,
		pokemonIcon,
		...(iconPokemon && { iconPokemon }),
		...(namePokemon && { namePokemon }),
	};
}
