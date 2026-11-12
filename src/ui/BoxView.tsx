import { useMemo, useState } from "react";
import type { BoxEntry } from "../core/box";
import type { YieldDetail } from "../core/yield";
import pokemons, { getPokemonRarity, type IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { getMaxSkillLevel } from "../vendor/pokesleep-tool/util/MainSkill";
import { type IngredientType, IngredientTypes } from "../vendor/pokesleep-tool/util/PokemonIv";
import { buildEntryLabels, entryTooltip, formatAmount, ingredientLabel, subSkillSummary } from "./names";
import NaturePicker from "./NaturePicker";
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
	const isEditing = draft.id !== "";
	const labels = useMemo(() => buildEntryLabels(box), [box]);
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
		setDraft(emptyDraft());
	};

	return (
		<div className="box-view">
			<section className="card">
				<h2>{isEditing ? "Edit Pokémon" : "Add Pokémon"}</h2>
				<div className="form-grid">
					<label>
						Pokémon
						<input
							list="pokemon-names"
							value={draft.pokemonName}
							onChange={(e) => setDraft({ ...draft, pokemonName: e.target.value, skillLevel: undefined })}
							placeholder="Type to search"
						/>
						<datalist id="pokemon-names">
							{pokemonNames.map((n) => (
								<option key={n} value={n} />
							))}
						</datalist>
					</label>
					<label>
						Nickname (optional)
						<input
							value={draft.nickname ?? ""}
							placeholder="e.g. Sandslash HSM"
							onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
						/>
					</label>
					<div className="field">
						<label htmlFor="level-input">Level</label>
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
						Ingredients (Lv1 / Lv30 / Lv60)
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
						Main skill{draftPokemon ? ` (${draftPokemon.skill})` : ""} level
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
					<span className="field-label">Nature (pick one ▲ and one ▼)</span>
					<NaturePicker value={draft.nature} onChange={(nature) => setDraft({ ...draft, nature })} />
				</div>
				<div className="subskill-field">
					<span className="field-label">Subskills (click in order: Lv10 → 25 → 50 → 70 → 80)</span>
					<SubSkillPicker value={draft.subSkills} onChange={(subSkills) => setDraft({ ...draft, subSkills })} />
				</div>
				<div className="actions">
					<button type="button" onClick={save} disabled={!validName}>
						{isEditing ? "Save changes" : "Add to box"}
					</button>
					{isEditing && (
						<button type="button" className="secondary" onClick={() => setDraft(emptyDraft())}>
							Cancel
						</button>
					)}
				</div>
			</section>

			<section className="card">
				<h2>Your box</h2>
				{box.length === 0 ? (
					<p className="muted">No Pokémon yet. Add the ones you might put on your team.</p>
				) : (
					<table>
						<thead>
							<tr>
								<th>Pokémon</th>
								<th>Lv</th>
								<th>Ingredients</th>
								<th>Skill Lv</th>
								<th>Nature</th>
								<th>Subskills</th>
								<th>Ingredients / day</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{box.map((e) => (
								<tr key={e.id}>
									<td title={entryTooltip(e)}>
										{e.nickname?.trim() ? (
											<>
												{e.nickname.trim()}
												<div className="muted small">{e.pokemonName}</div>
											</>
										) : (
											e.pokemonName
										)}
										{duplicateNumber(labels.get(e.id)) && <span className="tag">{duplicateNumber(labels.get(e.id))}</span>}
									</td>
									<td>{e.level}</td>
									<td>{e.ingredient}</td>
									<td>{e.skillLevel ?? "–"}</td>
									<td>{e.nature}</td>
									<td title={entryTooltip(e)}>{subSkillSummary(e) || "–"}</td>
									<td>
										<YieldSummary detail={details.get(e.id)} />
									</td>
									<td className="row-actions">
										<button type="button" className="secondary" onClick={() => setDraft(e)}>
											Edit
										</button>
										<button
											type="button"
											className="danger"
											onClick={() => {
												setBox(box.filter((x) => x.id !== e.id));
												if (draft.id === e.id) setDraft(emptyDraft());
											}}
										>
											Delete
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
						{fromSkill > 0 && <span className="muted"> (incl. {formatAmount(fromSkill)} from skill)</span>}
					</div>
				);
			})}
			{skillKinds <= 5
				? (Object.entries(detail.skill) as [IngredientName, number][])
						.filter(([ing]) => !(ing in detail.help))
						.map(([ing, n]) => (
							<div key={ing}>
								{ingredientLabel(ing)} {formatAmount(n)} <span className="muted">(from skill)</span>
							</div>
						))
				: skillTotal > 0 && (
						<div className="muted">
							Skill: {formatAmount(skillTotal)} random ingredients/day, split over {skillKinds} kinds
						</div>
					)}
		</>
	);
}

/** "#2" if the label was numbered because of an identical entry, otherwise undefined. */
function duplicateNumber(label: string | undefined): string | undefined {
	return label?.match(/ (#\d+)$/)?.[1];
}
