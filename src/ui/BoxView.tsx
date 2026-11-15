import { useMemo, useRef, useState } from "react";
import type { BoxEntry } from "../core/box";
import type { YieldDetail } from "../core/yield";
import pokemons, { getPokemonRarity, type IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import { type IngredientType, IngredientTypes } from "../vendor/pokesleep-tool/util/PokemonIv";
import { getLang, type Key, natureLabel, pokemonFromLabel, pokemonLabel, skillLabel, t } from "./i18n";
import { buildEntryLabels, entryTooltip, formatAmount, ingredientLabel, subSkillSummary } from "./names";
import NaturePicker from "./NaturePicker";
import ScreenshotImport, { type ImportItem, warningText } from "./ScreenshotImport";
import { useStoredState } from "./storage";
import SubSkillPicker from "./SubSkillPicker";

// Mythical Pokémon choose their own ingredients, which is not supported yet.
/** pokesleep-tool's Pokémon model accepts levels 1–100. */
const maxPokemonLevel = 100;
const keyLevels = [30, 50, 60, 70, 80];

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

type SortBy = "added" | "dex" | "level" | "name";
interface BoxSort {
	by: SortBy;
	/** Opposite of the natural direction (added: oldest first; dex and name: A→Z; level: highest first). */
	reversed: boolean;
}
const sortOptions: { by: SortBy; label: Key }[] = [
	{ by: "added", label: "sortAdded" },
	{ by: "dex", label: "sortDex" },
	{ by: "level", label: "sortLevel" },
	{ by: "name", label: "sortName" },
];

/** Position in pokesleep-tool's list: Pokédex order, with a species' forms after its base form. */
const dexOrder = new Map(pokemons.map((p, i) => [p.name, i]));

/** The box in display order. Ties keep the order the Pokémon were added. */
function sortBox(box: BoxEntry[], sort: BoxSort): BoxEntry[] {
	const collator = new Intl.Collator(getLang());
	const dex = (e: BoxEntry) => dexOrder.get(e.pokemonName) ?? Number.MAX_SAFE_INTEGER;
	const name = (e: BoxEntry) => pokemonLabel(e.pokemonName);
	const compare: Record<SortBy, (a: BoxEntry, b: BoxEntry) => number> = {
		added: () => 0,
		dex: (a, b) => dex(a) - dex(b) || b.level - a.level,
		level: (a, b) => b.level - a.level || dex(a) - dex(b),
		name: (a, b) =>
			collator.compare(name(a), name(b)) ||
			collator.compare(a.nickname ?? "", b.nickname ?? "") ||
			b.level - a.level,
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
	setBox: (box: BoxEntry[]) => void;
	details: Map<string, YieldDetail>;
}) {
	const { box, setBox, details } = props;
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
	const sortedBox = useMemo(() => sortBox(box, sort), [box, sort.by, sort.reversed]);
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
			// Done with this screenshot: drop it and move on to the next one that's been read.
			URL.revokeObjectURL(reviewing.url);
			const rest = imports.filter((i) => i.id !== reviewing.id);
			setImports(rest);
			review(rest.find((i) => i.status === "done"));
		} else {
			startDraft(emptyDraft());
		}
	};

	return (
		<div className="box-view">
			<ScreenshotImport
				items={imports}
				setItems={setImports}
				reviewingId={reviewingId}
				onReview={review}
			/>
			<section className="card" ref={formRef}>
				<h2>{isEditing ? t("editPokemon") : reviewing ? t("reviewPokemon") : t("addPokemon")}</h2>
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
								setDraft({ ...draft, pokemonName: name, skillLevel: undefined });
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
					{(isEditing || reviewing) && (
						<button type="button" className="secondary" onClick={() => review(undefined)}>
							{t("cancel")}
						</button>
					)}
				</div>
			</section>

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
				{box.length === 0 ? (
					<p className="muted">{t("emptyBox")}</p>
				) : (
					<table>
						<thead>
							<tr>
								<th>{t("pokemon")}</th>
								<th>{t("colLv")}</th>
								<th>{t("colIngredients")}</th>
								<th>{t("colSkillLv")}</th>
								<th>{t("colNature")}</th>
								<th>{t("colSubskills")}</th>
								<th>{t("colIngPerDay")}</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{sortedBox.map((e) => (
								<tr key={e.id}>
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
									</td>
									<td>{e.level}</td>
									<td>{e.ingredient}</td>
									<td>{e.skillLevel ?? "–"}</td>
									<td>{natureLabel(e.nature)}</td>
									<td title={entryTooltip(e)}>{subSkillSummary(e) || "–"}</td>
									<td>
										<YieldSummary detail={details.get(e.id)} />
									</td>
									<td className="row-actions">
										<button
											type="button"
											className="secondary"
											onClick={() => {
												setReviewingId(undefined);
												startDraft(e);
											}}
										>
											{t("edit")}
										</button>
										<button
											type="button"
											className="danger"
											onClick={() => {
												setBox(box.filter((x) => x.id !== e.id));
												if (draft.id === e.id) startDraft(emptyDraft());
											}}
										>
											{t("delete")}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}

/** Help ingredients first, then skill-only ingredients, e.g. "Soft Potato 16 (+3.1 skill)". */
function YieldSummary(props: { detail: YieldDetail | undefined }) {
	const detail = props.detail;
	if (!detail) return null;
	const help = Object.entries(detail.help) as [IngredientName, number][];
	const skillTotal = Object.values(detail.skill).reduce((a, b) => a + (b ?? 0), 0);
	const skillKinds = Object.keys(detail.skill).length;
	return (
		<>
			{help.map(([ing, n]) => {
				const fromSkill = detail.skill[ing] ?? 0;
				return (
					<div key={ing}>
						{ingredientLabel(ing)} {formatAmount(n + fromSkill)}
						{fromSkill > 0 && <span className="muted"> {t("inclFromSkill", { n: formatAmount(fromSkill) })}</span>}
					</div>
				);
			})}
			{skillKinds <= 5
				? (Object.entries(detail.skill) as [IngredientName, number][])
						.filter(([ing]) => !(ing in detail.help))
						.map(([ing, n]) => (
							<div key={ing}>
								{ingredientLabel(ing)} {formatAmount(n)} <span className="muted">{t("fromSkill")}</span>
							</div>
						))
				: skillTotal > 0 && (
						<div className="muted">{t("skillRandom", { n: formatAmount(skillTotal), k: skillKinds })}</div>
					)}
		</>
	);
}

/** "#2" if the label was numbered because of an identical entry, otherwise undefined. */
function duplicateNumber(label: string | undefined): string | undefined {
	return label?.match(/ (#\d+)$/)?.[1];
}
