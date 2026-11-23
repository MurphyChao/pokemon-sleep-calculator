import { type ReactNode, useMemo, useState } from "react";
import type { BoxEntry } from "../core/box";
import type { Rank } from "../core/rank";
import { type EnergyMember, type EnergyProblem, maxRecipeLevel, type SwapOption, teamHealSources } from "../core/energy";
import {
	analyzeEnergy,
	type EnergyAnalysis,
	energyMembers,
	energyProblem,
	swapCandidates,
	swapResult,
	teamSlots,
} from "../core/energyTab";
import { sundayBaseChance, weekdayBaseChance } from "../core/tasty";
import { dailyDemand, mealsPerDay, type Recipe } from "../core/recipes";
import type { Heal, StrengthOptions, YieldDetail } from "../core/yield";
import { getFavoriteBerries } from "../vendor/pokesleep-tool/data/fields";
import { type IngredientName, type PokemonType, PokemonTypes } from "../vendor/pokesleep-tool/data/pokemons";
import { islandLabel, Rich, t, tRich, typeLabel } from "./i18n";
import { buildEntryLabelParts, buildEntryLabels, type EntryLabelParts, entryTooltip, formatAmount, formatPercent } from "./names";
import { cacheEnergy, cacheEnergySwap, cachedEnergy } from "./energyCache";
import { PokemonIconCell } from "./PokemonIcon";
import { EntryLabel, InlineEntry } from "./EntryLabel";
import IconSelect from "./IconSelect";
import { IngredientIcon, IngredientIcons } from "./IngredientIcons";
import { BanIcon, PlusIcon, UndoIcon } from "./icons";
import RankCell from "./RankCell";
import TableHelp from "./TableHelp";

export interface EnergySettings extends StrengthOptions {
	recipeLevel: number;
}

export const defaultEnergySettings: EnergySettings = { favorites: "none", fieldBonus: 0, recipeLevel: 1 };

/** Common recipe levels, for one-click entry. */
const keyRecipeLevels = [30, 40, 50, 60, 70];

/** Islands with fixed favorite berries (pokesleep-tool field indices 1–6). */
const islands = [1, 2, 3, 4, 5, 6].map((index) => ({ index, types: getFavoriteBerries(index) }));
export const formatStrength = (n: number) => Math.round(n).toLocaleString("en-US");

function favoritesKey(f: StrengthOptions["favorites"]): string {
	if (!Array.isArray(f)) return f;
	const island = islands.findIndex((x) => x.types.length === 3 && x.types.every((t) => f.includes(t)));
	return island >= 0 ? `island${island}` : "custom";
}

export default function EnergyView(props: {
	box: BoxEntry[];
	recipe: Recipe;
	details: Map<string, YieldDetail>;
	/** With simulated energy: yields when healed by the team's healers, with `helpers` teammates' Helping Bonus. */
	healedDetail?: (id: string, heal: Heal | undefined, helpers?: number) => YieldDetail;
	/** Yields on its own (as in `details`) with `helpers` teammates' worth of Helping Bonus. */
	helpedDetail: (id: string, helpers: number) => YieldDetail;
	/** Each Pokémon's cross-species rank (see core/rank.ts). */
	ranks: Map<string, Rank | null>;
	settings: EnergySettings;
	/** The event bonus's dish strength multiplier (1 without one). */
	dishMultiplier: number;
	/** Identifies the results (see core/energyTab.ts): the same key, the same team. */
	energyKey: string;
	/** Pinned and excluded Pokémon in the box (kept by App, which works the results out ahead too). */
	pinned: string[];
	excluded: string[];
	setPinned: (ids: string[]) => void;
	setExcluded: (ids: string[]) => void;
}) {
	const { box, recipe, details, healedDetail, helpedDetail, ranks, settings, dishMultiplier, energyKey } = props;
	const { pinned, excluded, setPinned, setExcluded } = props;
	const byId = useMemo(() => new Map(box.map((e) => [e.id, e])), [box]);
	const labels = useMemo(() => buildEntryLabels(box), [box]);
	const shortLabels = useMemo(() => buildEntryLabelParts(box, { ingredients: false }), [box]);

	const members: EnergyMember[] = useMemo(
		() => energyMembers(box, { details, helpedDetail, healedDetail }),
		[box, details, healedDetail, helpedDetail],
	);
	const problem: EnergyProblem = useMemo(
		() => energyProblem(recipe, settings.recipeLevel, settings.fieldBonus, dishMultiplier),
		[recipe, settings.recipeLevel, settings.fieldBonus, dishMultiplier],
	);
	// Worked out ahead in the background (useEnergyWarmup) or earlier on this tab, or now.
	const analysis = useMemo(() => {
		const cached = cachedEnergy(energyKey);
		if (cached) return cached.analysis;
		const fresh = analyzeEnergy(members, problem, pinned, excluded);
		cacheEnergy(energyKey, { analysis: fresh });
		return fresh;
	}, [energyKey, members, problem]);
	const { best, without, withIt, bench } = analysis;
	const e = best.energy;

	const togglePin = (id: string) => setPinned(pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);
	const exclude = (id: string) => {
		setExcluded([...excluded, id]);
		if (pinned.includes(id)) setPinned(pinned.filter((x) => x !== id));
	};
	const allow = (id: string) => setExcluded(excluded.filter((x) => x !== id));
	const forceIn = (id: string) => {
		setPinned([...pinned, id]);
		allow(id);
	};

	const ings = Object.keys(recipe.ingredients) as IngredientName[];
	const demand = dailyDemand(recipe);
	/** Team members as they perform on this team (healing applied); bench members on their best team. */
	const strengthOf = (id: string) =>
		best.entries.find((x) => x.member.id === id)?.member ??
		withIt.get(id)?.entries.find((x) => x.member.id === id)?.member ??
		(members.find((m) => m.id === id) as EnergyMember);
	const bestMembers = best.entries.map((x) => x.member);
	const teamHealing = best.entries.reduce(
		(a, x) => a + (teamHealSources([x.member])[0] ? (x.member.heal?.team ?? 0) * (x.member.heal?.triggersPerDay ?? 0) * x.share : 0),
		0,
	);

	return (
		<div className="energy-view">
			{box.length === 0 ? (
				<section className="card">
					<p className="muted">{t("addOnBoxFirst")}</p>
				</section>
			) : (
				<>
					<section className="card headline best-team">
						<h2>{t("bestTeam")}</h2>
						<p>
							<strong className="big">{t("strengthPerDay", { n: formatStrength(e.total) })}</strong>
							<span className="muted">
								{" "}
								· {t("slotsOf", { used: best.slots.toFixed(2), total: teamSlots })} ·{" "}
								{t("nPokemon", { n: best.ids.length })}
							</span>
						</p>
						<p className="muted">
							{t("breakdown", { b: formatStrength(e.berry), s: formatStrength(e.skill), d: formatStrength(e.dish) })}
						</p>
						{best.helpers > 0 && (
							<p className="muted">
								{t("helpingBonusLine", { n: best.helpers.toFixed(1), pct: formatPercent(0.05 * Math.min(4, best.helpers)) })}
							</p>
						)}
						<p className="muted">
							{t("dishLineStart", { per: formatStrength(problem.dishStrength), meals: mealsPerDay })}{" "}
							<strong className={e.coverage < 1 - 1e-9 ? "warn" : "ok"}>{formatPercent(e.coverage)}</strong>{" "}
							{t("dishLineEnd", { mult: e.tastyMultiplier.toFixed(3) })}
						</p>
						<p className="muted small">
							{healedDetail ? (
								<>
									{t("energyIsSimulated")}{" "}
									{teamHealSources(bestMembers).length > 0 ? (
										<Rich text={t("healersRestore", { n: Math.round(teamHealing) })} />
									) : (
										t("noTeamHealer")
									)}
								</>
							) : (
								t("energyFullNote")
							)}
						</p>
						<table className="stack">
							<thead>
								<tr>
									<th className="icon-cell" />
									<th>{t("pokemon")}</th>
									{ings.map((i) => (
										<th key={i} className="ing-col">
											<IngredientIcon name={i} className="header" />
										</th>
									))}
									<th>{t("colBerries")}</th>
									<th>{t("colSkill")}</th>
									<th data-short={t("colSlotUsedShort")}>{t("colSlotUsed")}</th>
									<th data-short={t("colWithoutItShort")}>{t("colWithoutIt")}</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{best.ids.map((id) => {
									const m = strengthOf(id);
									const w = without.get(id);
									return (
										<tr key={id}>
											<PokemonIconCell name={byId.get(id)?.pokemonName} />
											<td title={entryTooltip(byId.get(id) as BoxEntry)}>
												<EntryLabel entry={byId.get(id)} parts={shortLabels.get(id)} />
												{m.tasty && <span className="tag">{t("tagExtraTasty")}</span>}
{m.heal && <span className="tag">{t("tagHealer")}</span>}
													{m.helpingBonus && <span className="tag">{t("tagHelpingBonus")}</span>}
												<div>
													<IngredientIcons entry={byId.get(id) as BoxEntry} />
												</div>
											</td>
											{ings.map((i) => (
												<td key={i}>{(m.yield[i] ?? 0) > 0 ? formatAmount(m.yield[i] ?? 0) : "–"}</td>
											))}
											<td>{formatStrength(m.berry)}</td>
											<td>{m.skill > 0 ? formatStrength(m.skill) : "–"}</td>
											<td>{(best.usage.get(id) ?? 0).toFixed(2)}</td>
											<td>{w && <Diff value={w.energy.total - e.total} />}</td>
											<td className="row-actions">
												<label className="check small">
													<input type="checkbox" checked={pinned.includes(id)} onChange={() => togglePin(id)} />
													{t("pin")}
												</label>
												<button
													type="button"
													className="secondary icon-button"
													aria-label={t("exclude")}
													title={t("exclude")}
													onClick={() => exclude(id)}
												>
													<BanIcon />
												</button>
											</td>
										</tr>
									);
								})}
								<tr className="total">
									<td colSpan={2}>{t("totalNeeded")}</td>
									{ings.map((i) => {
										const supply = best.entries.reduce((a, x) => a + x.share * (x.member.yield[i] ?? 0), 0);
										const cov = supply / (demand[i] as number);
										return (
											<td key={i}>
												{formatAmount(supply)} / {demand[i]}
												<div className="bar">
													<div
														className={cov >= 1 - 1e-9 ? "fill ok" : "fill warn"}
														style={{ width: `${Math.min(100, cov * 100)}%` }}
													/>
												</div>
											</td>
										);
									})}
									<td>{formatStrength(e.berry)}</td>
									<td>{formatStrength(e.skill)}</td>
									<td>
										{best.slots.toFixed(2)} / {teamSlots}
									</td>
									<td colSpan={2} />
								</tr>
							</tbody>
						</table>
						<TableHelp>
							<Rich text={t("energyTeamHelp", { n: teamSlots })} />
						</TableHelp>
					</section>

					<SwapCard
						members={members}
						problem={problem}
						analysis={analysis}
						energyKey={energyKey}
						pinned={pinned}
						excluded={excluded}
						labels={labels}
						entries={byId}
						shortLabels={shortLabels}
					/>

					<section className="card bench-card">
						<h2>{t("bench")}</h2>
						<TableHelp>
							<Rich text={t("energyBenchHelp")} />
						</TableHelp>
						{bench.length === 0 ? (
							<p className="muted">{t("allOnTeam")}</p>
						) : (
							<table className="stack">
								<thead>
									<tr>
										<th className="icon-cell" />
									<th>{t("pokemon")}</th>
										{ings.map((i) => (
											<th key={i} className="ing-col">
											<IngredientIcon name={i} className="header" />
										</th>
										))}
										<th>{t("colBerries")}</th>
										<th>{t("colSkill")}</th>
										{/* Phone cards: just the grade and "Top x%" (no category), and a short label (App.css). */}
										<th className="brief" data-short={t("colRank")}>{t("colRank")}</th>
										<th data-short={t("colBestWithItShort")}>{t("colBestWithIt")}</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{bench.map((id) => {
										const m = strengthOf(id);
										const w = withIt.get(id);
										const isExcluded = excluded.includes(id);
										return (
											<tr key={id} className={isExcluded ? "muted" : ""}>
												<PokemonIconCell name={byId.get(id)?.pokemonName} />
												<td title={entryTooltip(byId.get(id) as BoxEntry)}>
													<EntryLabel entry={byId.get(id)} parts={shortLabels.get(id)} />
													{m.tasty && <span className="tag">{t("tagExtraTasty")}</span>}
{m.heal && <span className="tag">{t("tagHealer")}</span>}
													{m.helpingBonus && <span className="tag">{t("tagHelpingBonus")}</span>}
													{isExcluded && <span className="tag">{t("tagExcluded")}</span>}
													<div>
														<IngredientIcons entry={byId.get(id) as BoxEntry} />
													</div>
												</td>
												{ings.map((i) => (
													<td key={i}>{(m.yield[i] ?? 0) > 0 ? formatAmount(m.yield[i] ?? 0) : "–"}</td>
												))}
												<td>{formatStrength(m.berry)}</td>
												<td>{m.skill > 0 ? formatStrength(m.skill) : "–"}</td>
												<td>
													<RankCell rank={ranks.get(id)} />
												</td>
												<td>{w && <Diff value={w.energy.total - e.total} />}</td>
												<td className="row-actions">
													<button
														type="button"
														className="secondary icon-button"
														aria-label={t("forceIn")}
														title={t("forceIn")}
														onClick={() => forceIn(id)}
													>
														<PlusIcon />
													</button>
													{isExcluded && (
														<button
															type="button"
															className="secondary icon-button"
															aria-label={t("allow")}
															title={t("allow")}
															onClick={() => allow(id)}
														>
															<UndoIcon />
														</button>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						)}
					</section>
				</>
			)}
		</div>
	);
}

function Diff(props: { value: number }) {
	const v = Math.round(props.value);
	if (v === 0) return <span className="muted">±0</span>;
	return <span className={v > 0 ? "ok" : "warn"}>{`${v > 0 ? "+" : "−"}${formatStrength(Math.abs(v))}`}</span>;
}

/** The Island card: favorite berries, island bonus and recipe level (shown above the Dish card, see App). */
export function EnergySettingsCard(props: { settings: EnergySettings; setSettings: (s: EnergySettings) => void }) {
	const { settings, setSettings } = props;
	const key = favoritesKey(settings.favorites);
	const setRecipeLevel = (n: number) =>
		setSettings({ ...settings, recipeLevel: Math.min(maxRecipeLevel, Math.max(1, Math.round(n) || 1)) });
	const custom: PokemonType[] = Array.isArray(settings.favorites) ? settings.favorites : ["normal", "fire", "water"];
	return (
		<section className="card island-card">
			<h2>{t("island")}</h2>
			<div className="form-grid">
				<label>
					{t("favoriteBerries")}
					<select
						value={key}
						onChange={(ev) => {
							const v = ev.target.value;
							const favorites: StrengthOptions["favorites"] =
								v === "none" || v === "all"
									? v
									: v === "custom"
										? custom
										: islands[Number(v.replace("island", ""))].types;
							setSettings({ ...settings, favorites });
						}}
					>
						<option value="none">{t("none")}</option>
						<option value="custom">{t("greengrassChoose")}</option>
						{islands.map((x, i) => (
							<option key={x.index} value={`island${i}`}>
								{islandLabel(x.index)} ({x.types.map(typeLabel).join(", ")})
							</option>
						))}
						<option value="all">{t("allBerries")}</option>
					</select>
				</label>
				<label>
					<span className="label-long">{t("islandBonus")}</span>
					<span className="label-short">{t("islandBonusShort")}</span>
					<input
						type="number"
						min={0}
						value={settings.fieldBonus}
						onChange={(ev) => setSettings({ ...settings, fieldBonus: Math.max(0, Number(ev.target.value) || 0) })}
					/>
				</label>
				<div className="field">
					<label htmlFor="recipe-level">{t("recipeLevel")}</label>
					<div className="stepper">
						<button
							type="button"
							className="secondary"
							aria-label={t("recipeLevelDown")}
							disabled={settings.recipeLevel <= 1}
							onClick={() => setRecipeLevel(settings.recipeLevel - 1)}
						>
							▼
						</button>
						<input
							id="recipe-level"
							type="number"
							min={1}
							max={maxRecipeLevel}
							value={settings.recipeLevel}
							onChange={(ev) => setRecipeLevel(Number(ev.target.value))}
						/>
						<button
							type="button"
							className="secondary"
							aria-label={t("recipeLevelUp")}
							disabled={settings.recipeLevel >= maxRecipeLevel}
							onClick={() => setRecipeLevel(settings.recipeLevel + 1)}
						>
							▲
						</button>
					</div>
					<div className="key-levels">
						{keyRecipeLevels.map((lv) => (
							<button
								type="button"
								key={lv}
								className={settings.recipeLevel === lv ? "" : "secondary"}
								aria-pressed={settings.recipeLevel === lv}
								onClick={() => setRecipeLevel(lv)}
							>
								{lv}
							</button>
						))}
					</div>
				</div>
			</div>
			{key === "custom" && (
				<div className="form-grid">
					{[0, 1, 2].map((slot) => (
						<label key={slot}>
							{t("berryN", { n: slot + 1 })}
							<select
								value={custom[slot]}
								onChange={(ev) => {
									const next = [...custom];
									next[slot] = ev.target.value as PokemonType;
									setSettings({ ...settings, favorites: next });
								}}
							>
								{PokemonTypes.map((type) => (
									<option key={type} value={type} disabled={custom.includes(type) && custom[slot] !== type}>
										{typeLabel(type)}
									</option>
								))}
							</select>
						</label>
					))}
				</div>
			)}
		</section>
	);
}

/** "Chance ≤ 29%" style description of a threshold rule, for a base chance. */
function chanceLimit(threshold: number, base: number): string {
	return `${Math.min(100, base + threshold - 1)}%`;
}

function ruleText(o: SwapOption, swapIn: ReactNode, partner: ReactNode, last: boolean): ReactNode {
	const threshold = o.policy.threshold;
	if (threshold === 0) return tRich("ruleAlways", { name: partner });
	if (last) return tRich("ruleAlways", { name: swapIn });
	return tRich("ruleWhile", {
		name: swapIn,
		wd: chanceLimit(threshold, weekdayBaseChance),
		sd: chanceLimit(threshold, sundayBaseChance),
	});
}

/**
 * Two Pokémon share the last slot and are swapped after each meal depending on the current
 * Extra Tasty bonus: the Extra Tasty Pokémon while the bonus is low, the partner once it is high.
 */
function SwapCard(props: {
	members: EnergyMember[];
	problem: EnergyProblem;
	analysis: EnergyAnalysis;
	energyKey: string;
	pinned: string[];
	excluded: string[];
	labels: Map<string, string>;
	/** For the explanations: names with nature, subskill and ingredient icons. */
	entries: Map<string, BoxEntry>;
	shortLabels: Map<string, EntryLabelParts>;
}) {
	const { members, problem, analysis: teams, energyKey, pinned, excluded, labels, entries, shortLabels } = props;
	const { best } = teams;
	const [chosenIn, setChosenIn] = useState<string | null>(null);
	const [chosenPartner, setChosenPartner] = useState<string | null>(null);
	const tastyIds = swapCandidates(members, excluded);
	// The default pair is worked out ahead with the rest (useEnergyWarmup); a chosen one now.
	const result = useMemo(() => {
		if (chosenIn === null && chosenPartner === null) {
			const cached = cachedEnergy(energyKey)?.swap;
			if (cached) return cached;
			const fresh = swapResult(members, problem, teams, pinned, excluded, null, null);
			cacheEnergySwap(energyKey, fresh);
			return fresh;
		}
		return swapResult(members, problem, teams, pinned, excluded, chosenIn, chosenPartner);
	}, [energyKey, chosenIn, chosenPartner, members, problem, teams]);
	const swapInId = result?.swapInId;
	const partnerChoices = result?.partnerChoices ?? [];
	const partnerId = result?.partnerId;

	if (tastyIds.length === 0) {
		return (
			<section className="card">
				<h2>{t("swapPartner")}</h2>
				<p className="muted">{t("swapNoTasty")}</p>
			</section>
		);
	}
	const label = (id: string | undefined) => (id ? (labels.get(id) ?? id) : "?");
	// Names with nature, subskill and ingredient icons, in the dropdowns and explanations.
	const named = (id: string | undefined) =>
		id && entries.has(id) ? <InlineEntry entry={entries.get(id)} parts={shortLabels.get(id)} /> : label(id);
	const inName = named(swapInId);
	const partnerName = named(partnerId);
	const analysis = result?.analysis;
	const last = analysis ? analysis.options.length - 1 : 0;
	const isLast = (o: SwapOption) => analysis !== undefined && o === analysis.options[last];
	const bestTotal = best.energy.total;

	return (
		<section className="card swap-card">
			<h2>{t("swapPartner")}</h2>
			<TableHelp>{t("swapHelp", { n: teamSlots - 1 })}</TableHelp>
			<div className="form-grid swap-pickers">
				<label>
					{t("extraTastyPokemon")}
					<IconSelect
						value={swapInId ?? ""}
						onChange={setChosenIn}
						options={tastyIds.map((id) => ({
							value: id,
							text: label(id) + (best.ids.includes(id) ? t("onTeamSuffix") : ""),
							content: (
								<>
									{named(id)}
									{best.ids.includes(id) && <span className="muted">{t("onTeamSuffix")}</span>}
								</>
							),
						}))}
					/>
				</label>
				<label>
					{t("partner")}
					<IconSelect
						value={partnerId ?? ""}
						onChange={setChosenPartner}
						options={partnerChoices.map((id) => ({
							value: id,
							text: label(id),
							content: (
								<>
									{named(id)}
								</>
							),
						}))}
					/>
				</label>
			</div>
			{analysis === undefined ? (
				<p className="muted">{t("pickPartner")}</p>
			) : (
				<>
					<p>
						<strong>{ruleText(analysis.best, inName, partnerName, isLast(analysis.best))}</strong>
						{analysis.best.policy.threshold !== 0 && !isLast(analysis.best) && tRich("ruleOtherwise", { name: partnerName })}
					</p>
					<p className="muted">
						{t("strengthPerDay", { n: formatStrength(analysis.best.energy.total) })} ·{" "}
						<Diff value={analysis.best.energy.total - bestTotal} /> {t("vsBestTeam")} ·{" "}
						{tRich("onTeamShare", { name: inName, n: formatPercent(analysis.best.policy.share) })} ·{" "}
						{t("swapTasty", {
							wd: formatPercent(analysis.best.policy.weekdayChance),
							sd: formatPercent(analysis.best.policy.sundayChance),
						})}
						{analysis.slotSize < 0.995 && <> · {t("shareSlot", { n: analysis.slotSize.toFixed(2) })}</>}
					</p>
					<details>
						<summary>{t("allThresholds")}</summary>
						<table className="stack swap-options">
							<thead>
								<tr>
									<th className="line nolabel">{t("colRule")}</th>
									<th data-short={t("colOnTeamShort")}>{tRich("colOnTeam", { name: inName })}</th>
									<th data-short={t("colExtraTastyShort")}>{t("colExtraTasty")}</th>
									<th>{t("colCooked")}</th>
									<th data-short={t("colStrengthShort")}>{t("colStrengthPerDay")}</th>
									<th data-short={t("colVsBestShort")}>{t("colVsBest")}</th>
								</tr>
							</thead>
							<tbody>
								{analysis.options.map((o) => (
									<tr key={o.policy.threshold} className={o === analysis.best ? "highlight" : ""}>
										<td>{ruleText(o, inName, partnerName, isLast(o))}</td>
										<td>{formatPercent(o.policy.share)}</td>
										<td>
											{formatPercent(o.policy.weekdayChance)} / {formatPercent(o.policy.sundayChance)}
										</td>
										<td>{formatPercent(o.energy.coverage)}</td>
										<td>{formatStrength(o.energy.total)}</td>
										<td>
											<Diff value={o.energy.total - bestTotal} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</details>
				</>
			)}
		</section>
	);
}

