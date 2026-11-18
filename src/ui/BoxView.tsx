import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { BoxEntry } from "../core/box";
import type { Rating } from "../core/rating";
import type { YieldDetail } from "../core/yield";
import pokemons, {
	getPokemonRarity,
	type IngredientName,
	IngredientNames,
	type PokemonType,
	PokemonTypes,
} from "../vendor/pokesleep-tool/data/pokemons";
import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import { type IngredientType, IngredientTypes } from "../vendor/pokesleep-tool/util/PokemonIv";
import { getLang, type Key, natureLabel, pokemonFromLabel, pokemonLabel, skillLabel, t, typeLabel } from "./i18n";
import { buildEntryLabels, entryTooltip, formatAmount, ingredientLabel } from "./names";
import NaturePicker from "./NaturePicker";
import ScreenshotImport, { type ImportItem, warningText } from "./ScreenshotImport";
import { useStoredState } from "./storage";
import SubSkillPicker from "./SubSkillPicker";
import { PokemonIconCell } from "./PokemonIcon";
import { IngredientIcon, IngredientIcons } from "./IngredientIcons";
import { NatureEffects } from "./NatureEffects";
import { SubSkillIcons } from "./SubSkillIcons";
import { PencilIcon, TrashIcon } from "./icons";
import RatingCell from "./RatingCell";
import RankCell from "./RankCell";
import type { Rank } from "../core/rank";
import { type BoxFilter, matchesFilter, noFilter, toggleChoice, unlockedIngredients } from "./boxFilter";
import { TypeIcon } from "./TypeIcon";
import { comboFromIcons } from "../ocr/combo";
import type { ScreenshotReading } from "../ocr/read";
import { learnIcon } from "./learnedIcons";

// Mythical Pokémon choose their own ingredients, which is not supported yet.
/** pokesleep-tool's Pokémon model accepts levels 1–100. */
const maxPokemonLevel = 100;
export const keyLevels = [30, 50, 60, 70, 80];

const pokemonNames = pokemons.filter((p) => getPokemonRarity(p) !== "mythical").map((p) => p.name);

/** pokesleep-tool's default skill level for a newly caught Pokémon. */
const defaultSkillLevel = (name: string) => {
	const p = pokemons.find((x) => x.name === name);
	return p ? Math.max(p.evolutionCount + 1, 1) : 1;
};

const emptyDraft = (): BoxEntry => ({
	id: "",
	pokemonName: "",
	level: 30,
	ingredient: "AAA",
	nature: "Serious",
	subSkills: {},
});

/** Ingredient names for slots A/B/C of a Pokémon, for labelling ingredient combinations. */
function slotIngredients(pokemonName: string): Record<"A" | "B" | "C", IngredientName | undefined> {
	const p = pokemons.find((x) => x.name === pokemonName);
	return { A: p?.ing1?.name, B: p?.ing2?.name, C: p?.ing3?.name };
}

type SortBy = "added" | "dex" | "level" | "name" | "rating" | "rank";
interface BoxSort {
	by: SortBy;
	/** Opposite of the natural direction (added: oldest first; dex and name: A→Z; level, rarity, rank: highest first). */
	reversed: boolean;
}
const sortOptions: { by: SortBy; label: Key }[] = [
	{ by: "added", label: "sortAdded" },
	{ by: "dex", label: "sortDex" },
	{ by: "level", label: "sortLevel" },
	{ by: "name", label: "sortName" },
	{ by: "rating", label: "sortRating" },
	{ by: "rank", label: "sortRank" },
];

/** Position in pokesleep-tool's list: Pokédex order, with a species' forms after its base form. */
const dexOrder = new Map(pokemons.map((p, i) => [p.name, i]));

/** The box in display order. Ties keep the order the Pokémon were added; unrated Pokémon sort last by rating. */
function sortBox(
	box: BoxEntry[],
	sort: BoxSort,
	ratings: Map<string, Rating | null>,
	ranks: Map<string, Rank | undefined>,
): BoxEntry[] {
	const collator = new Intl.Collator(getLang());
	const dex = (e: BoxEntry) => dexOrder.get(e.pokemonName) ?? Number.MAX_SAFE_INTEGER;
	const name = (e: BoxEntry) => pokemonLabel(e.pokemonName);
	/** Share of random rolls that beat it (lower is better); unrated last. */
	const better = (e: BoxEntry) => ratings.get(e.id)?.better ?? 2;
	const ofBest = (e: BoxEntry) => ratings.get(e.id)?.ofBest ?? 0;
	const rankBetter = (e: BoxEntry) => ranks.get(e.id)?.better ?? 2;
	const rankValue = (e: BoxEntry) => ranks.get(e.id)?.value ?? 0;
	const compare: Record<SortBy, (a: BoxEntry, b: BoxEntry) => number> = {
		added: () => 0,
		dex: (a, b) => dex(a) - dex(b) || b.level - a.level,
		level: (a, b) => b.level - a.level || dex(a) - dex(b),
		name: (a, b) =>
			collator.compare(name(a), name(b)) ||
			collator.compare(a.nickname ?? "", b.nickname ?? "") ||
			b.level - a.level,
		rating: (a, b) => better(a) - better(b) || ofBest(b) - ofBest(a) || dex(a) - dex(b),
		rank: (a, b) => rankBetter(a) - rankBetter(b) || rankValue(b) - rankValue(a) || dex(a) - dex(b),
	};
	const sorted = box
		.map((e, i) => ({ e, i }))
		.sort((a, b) => compare[sort.by](a.e, b.e) || a.i - b.i)
		.map((x) => x.e);
	return sort.reversed ? sorted.reverse() : sorted;
}

function comboLabel(pokemonName: string, combo: IngredientType): string {
	const slots = slotIngredients(pokemonName);
	const names = [...combo].map((c) => {
		const ing = slots[c as "A" | "B" | "C"];
		return ing ? ingredientLabel(ing) : "?";
	});
	return `${combo} — ${names.join(" / ")}`;
}

export default function BoxView(props: {
	box: BoxEntry[];
	/**
	 * The box as the numbers see it: evolved, level-scaled and seeded when those options are on (same ids).
	 * The table shows the real Pokémon and marks what changed.
	 */
	adjusted: BoxEntry[];
	setBox: (box: BoxEntry[]) => void;
	details: Map<string, YieldDetail>;
	/** Whether the pop-up with the screenshot import and the add/edit form is open (opened from the tab bar). */
	panelOpen: boolean;
	setPanelOpen: (open: boolean) => void;
	/** Each Pokémon's rarity for its role; missing while still being worked out, null if it can't be rated. */
	ratings: Map<string, Rating | null>;
	/** Each Pokémon's cross-species rank (see core/rank.ts). */
	ranks: Map<string, Rank | undefined>;
}) {
	const { box, adjusted, setBox, details, ratings, ranks, panelOpen, setPanelOpen } = props;
	const adjustedById = useMemo(() => new Map(adjusted.map((e) => [e.id, e])), [adjusted]);
	const [draft, setDraft] = useState<BoxEntry>(emptyDraft);
	/** What's typed in the Pokémon box (in either language); draft.pokemonName is the English name. */
	const [nameInput, setNameInput] = useState("");
	const startDraft = (entry: BoxEntry) => {
		setDraft(entry);
		setNameInput(entry.pokemonName ? pokemonLabel(entry.pokemonName) : "");
	};
	const isEditing = draft.id !== "";
	const [imports, setImports] = useState<ImportItem[]>([]);
	/** Screenshot whose reading is in the form, waiting to be checked and added. */
	const [reviewingId, setReviewingId] = useState<string | undefined>();
	const reviewing = imports.find((i) => i.id === reviewingId);
	const formRef = useRef<HTMLElement>(null);
	/** Closes the pop-up; screenshots still waiting to be checked stay for next time. */
	const closePanel = () => {
		setPanelOpen(false);
		setReviewingId(undefined);
		startDraft(emptyDraft());
	};
	useEffect(() => {
		if (!panelOpen) return;
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key === "Escape") closePanel();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [panelOpen]);
	const review = (item: ImportItem | undefined) => {
		setReviewingId(item?.id);
		if (item?.reading) {
			startDraft({ ...item.reading.entry, id: "" });
			formRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
		} else {
			startDraft(emptyDraft());
		}
	};
	const labels = useMemo(() => buildEntryLabels(box), [box]);
	const [storedSort, setSort] = useStoredState<BoxSort>("pscalc.boxSort", { by: "added", reversed: false });
	const sort: BoxSort = sortOptions.some((o) => o.by === storedSort.by) ? storedSort : { by: "added", reversed: false };
	const sortRatings = sort.by === "rating" ? ratings : noRatings;
	const sortRanks = sort.by === "rank" ? ranks : noRanks;
	const sortedBox = useMemo(
		() => sortBox(box, sort, sortRatings, sortRanks),
		[box, sort.by, sort.reversed, sortRatings, sortRanks],
	);
	const [storedFilter, setFilter] = useStoredState<BoxFilter>("pscalc.boxFilter", noFilter);
	/** Ingredients some Pokémon in the box has unlocked, in the game's order: the ingredient filter's choices. */
	const ingredientChoices = useMemo(() => {
		const present = new Set(adjusted.flatMap(unlockedIngredients));
		return IngredientNames.filter((i) => present.has(i));
	}, [adjusted]);
	// Choices no longer in the box (e.g. after deleting a Pokémon) don't filter anything out.
	const filter: BoxFilter = {
		types: (storedFilter.types ?? []).filter((x) => PokemonTypes.includes(x)),
		ingredients: (storedFilter.ingredients ?? []).filter((x) => ingredientChoices.includes(x)),
	};
	const shownBox = sortedBox.filter((e) => matchesFilter(e, adjustedById.get(e.id) ?? e, filter));
	const validName = pokemonNames.includes(draft.pokemonName);
	const draftPokemon = pokemons.find((p) => p.name === draft.pokemonName);
	const maxSkillLevel = draftPokemon ? getMaxSkillLevel(draftPokemon.skill) : 1;
	const skillLevel = Math.min(draft.skillLevel ?? defaultSkillLevel(draft.pokemonName), maxSkillLevel);

	const save = () => {
		if (!validName) return;
		if (isEditing) {
			setBox(box.map((e) => (e.id === draft.id ? { ...draft, skillLevel } : e)));
		} else {
			setBox([...box, { ...draft, skillLevel, id: crypto.randomUUID() }]);
		}
		if (reviewing) {
			// Done with this screenshot: drop it and move on to the next one that's been read. The pop-up
			// stays open while other screenshots are waiting.
			learnFromReading(reviewing.reading, draft.pokemonName);
			URL.revokeObjectURL(reviewing.url);
			const rest = imports.filter((i) => i.id !== reviewing.id);
			setImports(rest);
			review(rest.find((i) => i.status === "done"));
			if (rest.length === 0) setPanelOpen(false);
		} else {
			closePanel();
		}
	};

	const formTitle = isEditing ? t("editPokemon") : reviewing ? t("reviewPokemon") : t("addPokemon");
	return (
		<div className="box-view">
			{panelOpen && (
				<div
					className="modal-backdrop"
					onClick={(ev) => {
						if (ev.target === ev.currentTarget) closePanel();
					}}
				>
					<div className="modal" role="dialog" aria-modal="true" aria-label={formTitle}>
						<button
							type="button"
							className="secondary icon-button modal-close"
							aria-label={t("close")}
							title={t("close")}
							onClick={closePanel}
						>
							×
						</button>
						{!isEditing && (
							<ScreenshotImport
								items={imports}
								setItems={setImports}
								reviewingId={reviewingId}
								onReview={review}
							/>
						)}
						<section className="card" ref={formRef}>
							<h2>{formTitle}</h2>
							{reviewing?.reading && (
								<div className="review-note">
									<a href={reviewing.url} target="_blank" rel="noreferrer">
										<img src={reviewing.url} alt={reviewing.fileName} />
									</a>
									<div>
										<p>{t("reviewHelp")}</p>
										{reviewing.reading.warnings.length > 0 && (
											<ul className="warnings">
												{reviewing.reading.warnings.map((w) => (
													<li key={w}>{warningText(w, reviewing.reading as NonNullable<typeof reviewing.reading>)}</li>
												))}
											</ul>
										)}
									</div>
								</div>
							)}
							<div className="form-grid">
								<label>
									{t("pokemon")}
									<input
										list="pokemon-names"
										value={nameInput}
										onChange={(e) => {
											setNameInput(e.target.value);
											const name = pokemonFromLabel(e.target.value, pokemonNames) ?? e.target.value;
											// While reviewing a screenshot, the recognized ingredient icons fill in the combination.
											const combo = reviewing?.reading && comboFromIcons(name, reviewing.reading.ingredientIcons);
											setDraft({ ...draft, pokemonName: name, skillLevel: undefined, ...(combo && { ingredient: combo }) });
										}}
										placeholder={t("typeToSearch")}
									/>
									<datalist id="pokemon-names">
										{pokemonNames.map((n) => (
											<option key={n} value={pokemonLabel(n)} />
										))}
									</datalist>
								</label>
								<label>
									{t("nicknameOptional")}
									<input
										value={draft.nickname ?? ""}
										placeholder={t("nicknamePlaceholder")}
										onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
									/>
								</label>
								<div className="field">
									<label htmlFor="level-input">{t("level")}</label>
									<input
										id="level-input"
										type="number"
										min={1}
										max={maxPokemonLevel}
										value={draft.level}
										onChange={(e) =>
											setDraft({ ...draft, level: Math.min(maxPokemonLevel, Math.max(1, Number(e.target.value) || 1)) })
										}
									/>
									<div className="key-levels">
										{keyLevels.map((lv) => (
											<button
												type="button"
												key={lv}
												className={draft.level === lv ? "" : "secondary"}
												aria-pressed={draft.level === lv}
												onClick={() => setDraft({ ...draft, level: lv })}
											>
												{lv}
											</button>
										))}
									</div>
								</div>
								<label>
									{t("ingredientsCombo")}
									<select
										value={draft.ingredient}
										onChange={(e) => setDraft({ ...draft, ingredient: e.target.value as IngredientType })}
									>
										{IngredientTypes.map((t) => (
											<option key={t} value={t}>
												{validName ? comboLabel(draft.pokemonName, t) : t}
											</option>
										))}
									</select>
								</label>
								<label>
									{draftPokemon ? t("mainSkillLevel", { skill: skillLabel(draftPokemon.skill) }) : t("mainSkillLevelNoSkill")}
									<select
										value={skillLevel}
										disabled={!validName}
										onChange={(e) => setDraft({ ...draft, skillLevel: Number(e.target.value) })}
									>
										{Array.from({ length: maxSkillLevel }, (_, i) => i + 1).map((lv) => (
											<option key={lv} value={lv}>
												{lv}
											</option>
										))}
									</select>
								</label>
							</div>
							<div className="subskill-field">
								<span className="field-label">{t("natureField")}</span>
								<NaturePicker value={draft.nature} onChange={(nature) => setDraft({ ...draft, nature })} />
							</div>
							<div className="subskill-field">
								<span className="field-label">{t("subskillsField")}</span>
								<SubSkillPicker value={draft.subSkills} onChange={(subSkills) => setDraft({ ...draft, subSkills })} />
							</div>
							<div className="actions">
								<button type="button" onClick={save} disabled={!validName}>
									{isEditing ? t("saveChanges") : t("addToBox")}
								</button>
								<button type="button" className="secondary" onClick={closePanel}>
									{t("cancel")}
								</button>
							</div>
						</section>
					</div>
				</div>
			)}

			<section className="card">
				<div className="box-header">
					<h2>{t("yourBox")}</h2>
					{box.length > 1 && (
						<div className="box-sort">
							<label>
								{t("sortBy")}{" "}
								<select value={sort.by} onChange={(e) => setSort({ by: e.target.value as SortBy, reversed: false })}>
									{sortOptions.map((o) => (
										<option key={o.by} value={o.by}>
											{t(o.label)}
										</option>
									))}
								</select>
							</label>
							<button
								type="button"
								className="secondary"
								aria-pressed={sort.reversed}
								title={t("sortReverse")}
								aria-label={t("sortReverse")}
								onClick={() => setSort({ ...sort, reversed: !sort.reversed })}
							>
								⇅
							</button>
						</div>
					)}
				</div>
				{box.length > 0 && (
					<div className="box-filters">
						<FilterRow
							label={t("filterType")}
							choices={PokemonTypes}
							selected={filter.types}
							onChange={(types) => setFilter({ ...filter, types })}
							name={typeLabel}
							icon={(type: PokemonType) => <TypeIcon type={type} decorative />}
						/>
						<FilterRow
							label={t("filterIngredient")}
							choices={ingredientChoices}
							selected={filter.ingredients}
							onChange={(ingredients) => setFilter({ ...filter, ingredients })}
							name={ingredientLabel}
							icon={(ing: IngredientName) => <IngredientIcon name={ing} decorative />}
						/>
						{shownBox.length < box.length && (
							<p className="muted small">{t("filterShowing", { n: shownBox.length, total: box.length })}</p>
						)}
					</div>
				)}
				{box.length === 0 ? (
					<p className="muted">{t("emptyBox")}</p>
				) : shownBox.length === 0 ? (
					<p className="muted">{t("noMatches")}</p>
				) : (
					<table className="stack">
						<thead>
							<tr>
								<th className="icon-cell" />
								<th>{t("pokemon")}</th>
								{/* Classes only shape the phone cards (App.css): "nolabel" hides the label, "line" gets its own line. */}
								<th>{t("colLv")}</th>
								<th>{t("colSkillLv")}</th>
								<th className="nolabel">{t("colNature")}</th>
								<th className="line nolabel">{t("colSubskills")}</th>
								<th className="line">{t("colRating")}</th>
								<th className="line">{t("colRank")}</th>
								<th className="line nolabel yield">{t("colIngPerDay")}</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{shownBox.map((e) => {
								const a = adjustedById.get(e.id) ?? e;
								return (
								<tr key={e.id}>
									<PokemonIconCell name={e.pokemonName} />
									<td title={entryTooltip(e)}>
										{e.nickname?.trim() ? (
											<>
												{e.nickname.trim()}
												<div className="muted small">{pokemonLabel(e.pokemonName)}</div>
											</>
										) : (
											pokemonLabel(e.pokemonName)
										)}
										{duplicateNumber(labels.get(e.id)) && <span className="tag">{duplicateNumber(labels.get(e.id))}</span>}
										{a.evolvedFrom && (
											<div className="muted small" title={t("finalEvolution")}>
												→ {pokemonLabel(a.pokemonName)}
											</div>
										)}
										<div>
											<IngredientIcons entry={a} />
										</div>
									</td>
									<td>{a.scaledFrom !== undefined ? `${e.level}→${a.level}` : e.level}</td>
									<td>
										{a.skillLevel !== e.skillLevel
											? `${e.skillLevel ?? defaultSkillLevel(e.pokemonName)}→${a.skillLevel}`
											: (e.skillLevel ?? "–")}
									</td>
									<td>
										{natureLabel(e.nature)}
										<div>
											<NatureEffects nature={e.nature} />
										</div>
									</td>
									<td>
										<SubSkillIcons entry={a} />
									</td>
									<td>
										<RatingCell rating={ratings.get(e.id)} />
									</td>
									<td>
										<RankCell rank={ranks.get(e.id)} />
									</td>
									<td>
										<YieldSummary detail={details.get(e.id)} />
									</td>
									<td className="row-actions">
										<button
											type="button"
											className="secondary icon-button"
											aria-label={t("edit")}
											title={t("edit")}
											onClick={() => {
												setReviewingId(undefined);
												startDraft(e);
												setPanelOpen(true);
											}}
										>
											<PencilIcon />
										</button>
										<button
											type="button"
											className="danger icon-button"
											aria-label={t("delete")}
											title={t("delete")}
											onClick={() => {
												setBox(box.filter((x) => x.id !== e.id));
												if (draft.id === e.id) startDraft(emptyDraft());
											}}
										>
											<TrashIcon />
										</button>
									</td>
								</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}

const noRatings = new Map<string, Rating | null>();
const noRanks = new Map<string, Rank | undefined>();

/**
 * Once a screenshot's reading is confirmed as `pokemonName`, its icon is learned for that Pokémon unless the
 * icon was already recognized as it (or a form sharing its name). The OCR module is loaded by then.
 */
function learnFromReading(reading: ScreenshotReading | undefined, pokemonName: string) {
	const icon = reading?.pokemonIcon;
	if (!icon || !pokemonName) return;
	void import("../ocr/read").then(({ formsSharingName }) => {
		if (reading.iconPokemon && formsSharingName(reading.iconPokemon).includes(pokemonName)) return;
		learnIcon(pokemonName, icon);
	});
}

/**
 * A row of icon buttons filtering the box. With none selected everything is shown; the first click shows
 * only that choice, more clicks add or remove choices, and "All" clears them.
 */
function FilterRow<T extends string>(props: {
	label: string;
	choices: readonly T[];
	selected: T[];
	onChange: (selected: T[]) => void;
	name: (choice: T) => string;
	icon: (choice: T) => ReactNode;
}) {
	const { label, choices, selected, onChange, name, icon } = props;
	const all = selected.length === 0;
	return (
		<div className="filter-row" role="group" aria-label={label} title={t("filterHelp")}>
			<span className="field-label">{label}</span>
			<button type="button" className={all ? "filter-all" : "filter-all secondary"} aria-pressed={all} onClick={() => onChange([])}>
				{t("filterAll")}
			</button>
			{choices.map((c) => {
				const on = selected.includes(c);
				return (
					<button
						type="button"
						key={c}
						className={`filter-choice${on ? " selected" : all ? "" : " dim"}`}
						aria-pressed={on}
						aria-label={name(c)}
						title={name(c)}
						onClick={() => onChange(toggleChoice(selected, c))}
					>
						{icon(c)}
					</button>
				);
			})}
		</div>
	);
}

/** Help ingredients first, then skill-only ingredients, e.g. "Soft Potato 16 (+3.1 skill)". */
function YieldSummary(props: { detail: YieldDetail | undefined }) {
	const detail = props.detail;
	if (!detail) return null;
	const help = Object.entries(detail.help) as [IngredientName, number][];
	// Skills spreading over many kinds (Ingredient Magnet) would list them all: those only count where
	// they add to an ingredient the Pokémon gathers anyway.
	const skillKinds = Object.keys(detail.skill).length;
	return (
		<>
			{help.map(([ing, n]) => {
				const fromSkill = detail.skill[ing] ?? 0;
				return (
					<div key={ing}>
						<IngredientIcon name={ing} /> {formatAmount(n + fromSkill)}
						{fromSkill > 0 && <span className="muted"> {t("inclFromSkill", { n: formatAmount(fromSkill) })}</span>}
					</div>
				);
			})}
			{skillKinds <= 5 &&
				(Object.entries(detail.skill) as [IngredientName, number][])
					.filter(([ing]) => !(ing in detail.help))
					.map(([ing, n]) => (
						<div key={ing}>
							<IngredientIcon name={ing} /> {formatAmount(n)} <span className="muted">{t("fromSkill")}</span>
						</div>
					))}
		</>
	);
}

/** "#2" if the label was numbered because of an identical entry, otherwise undefined. */
function duplicateNumber(label: string | undefined): string | undefined {
	return label?.match(/ (#\d+)$/)?.[1];
}
