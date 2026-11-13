import { useMemo, useState } from "react";
import type { BoxEntry } from "../core/box";
import {
	type BestTeam,
	bestEnergyTeam,
	dishStrength,
	type EnergyMember,
	type EnergyProblem,
	maxRecipeLevel,
	resolveMembers,
	teamHealSources,
	weightedHealSources,
	type SwapOption,
	swapAnalysis,
} from "../core/energy";
import { sundayBaseChance, weekdayBaseChance } from "../core/tasty";
import { dailyDemand, mealsPerDay, type Recipe } from "../core/recipes";
import type { Heal, StrengthOptions, YieldDetail } from "../core/yield";
import { getFavoriteBerries } from "../vendor/pokesleep-tool/data/fields";
import { type IngredientName, type PokemonType, PokemonTypes } from "../vendor/pokesleep-tool/data/pokemons";
import { islandLabel, Rich, t, typeLabel } from "./i18n";
import { buildEntryLabels, entryTooltip, formatAmount, formatPercent, ingredientLabel } from "./names";
import { useStoredState } from "./storage";

export interface EnergySettings extends StrengthOptions {
	recipeLevel: number;
}

export const defaultEnergySettings: EnergySettings = { favorites: "none", fieldBonus: 0, recipeLevel: 1 };

/** Team slots shared by all Pokémon. */
const teamSlots = 5;

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
	/** With simulated energy: yields when healed by the team's healers. */
	healedDetail?: (id: string, heal: Heal | undefined) => YieldDetail;
	settings: EnergySettings;
	setSettings: (s: EnergySettings) => void;
}) {
	const { box, recipe, details, healedDetail, settings, setSettings } = props;
	const [pinnedRaw, setPinned] = useStoredState<string[]>("pscalc.energy.pinned", []);
	const [excludedRaw, setExcluded] = useStoredState<string[]>("pscalc.energy.excluded", []);
	const byId = useMemo(() => new Map(box.map((e) => [e.id, e])), [box]);
	const labels = useMemo(() => buildEntryLabels(box), [box]);
	const pinned = pinnedRaw.filter((id) => byId.has(id));
	const excluded = excludedRaw.filter((id) => byId.has(id) && !pinned.includes(id));

	const members: EnergyMember[] = useMemo(() => {
		const toMember = (id: string, d: YieldDetail | undefined): EnergyMember => {
			const m: EnergyMember = {
				id,
				yield: d?.total ?? {},
				berry: d?.berryStrength ?? 0,
				skill: d?.skillStrength ?? 0,
				...(d?.tasty && { tasty: d.tasty }),
				...(d?.heal && { heal: d.heal }),
			};
			if (healedDetail) m.at = (heal) => toMember(id, healedDetail(id, heal));
			return m;
		};
		return box.map((e) => toMember(e.id, details.get(e.id)));
	}, [box, details, healedDetail]);
	const problem: EnergyProblem = useMemo(
		() => ({ recipe, dishStrength: dishStrength(recipe, settings.recipeLevel, settings.fieldBonus) }),
		[recipe, settings.recipeLevel, settings.fieldBonus],
	);

	const pinKey = pinned.join(",");
	const exKey = excluded.join(",");
	const analysis = useMemo(() => {
		const best = bestEnergyTeam(members, problem, pinned, excluded);
		const others = members.filter((m) => !best.ids.includes(m.id)).map((m) => m.id);
		/** Strength lost if a team member is left out (and the rest re-optimised). */
		const without = new Map<string, BestTeam>();
		for (const id of best.ids) {
			without.set(
				id,
				bestEnergyTeam(
					members,
					problem,
					pinned.filter((x) => x !== id),
					[...excluded, id],
				),
			);
		}
		/** Best team that includes a bench member. */
		const withIt = new Map<string, BestTeam>();
		for (const id of others) {
			withIt.set(
				id,
				bestEnergyTeam(
					members,
					problem,
					[...pinned, id],
					excluded.filter((x) => x !== id),
				),
			);
		}
		const bench = [...others].sort(
			(a, b) => (withIt.get(b)?.energy.total ?? 0) - (withIt.get(a)?.energy.total ?? 0),
		);
		return { best, without, withIt, bench };
	}, [members, problem, pinKey, exKey]);
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
			<EnergySettingsCard settings={settings} setSettings={setSettings} />
			{box.length === 0 ? (
				<section className="card">
					<p className="muted">{t("addOnBoxFirst")}</p>
				</section>
			) : (
				<>
					<section className="card headline">
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
						<table>
							<thead>
								<tr>
									<th>{t("pokemon")}</th>
									{ings.map((i) => (
										<th key={i}>{ingredientLabel(i)}</th>
									))}
									<th>{t("colBerries")}</th>
									<th>{t("colSkill")}</th>
									<th>{t("colSlotUsed")}</th>
									<th>{t("colWithoutIt")}</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{best.ids.map((id) => {
									const m = strengthOf(id);
									const w = without.get(id);
									return (
										<tr key={id}>
											<td title={entryTooltip(byId.get(id) as BoxEntry)}>
												{labels.get(id)}
												{m.tasty && <span className="tag">{t("tagExtraTasty")}</span>}
{m.heal && <span className="tag">{t("tagHealer")}</span>}
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
												<button type="button" className="secondary" onClick={() => exclude(id)}>
													{t("exclude")}
												</button>
											</td>
										</tr>
									);
								})}
								<tr className="total">
									<td>{t("totalNeeded")}</td>
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
						<p className="muted small">
							<Rich text={t("energyTeamHelp", { n: teamSlots })} />
						</p>
					</section>

					<SwapCard
						members={members}
						problem={problem}
						best={best}
						withIt={withIt}
						pinned={pinned}
						excluded={excluded}
						labels={labels}
					/>

					<section className="card">
						<h2>{t("bench")}</h2>
						<p className="muted small">
							<Rich text={t("energyBenchHelp")} />
						</p>
						{bench.length === 0 ? (
							<p className="muted">{t("allOnTeam")}</p>
						) : (
							<table>
								<thead>
									<tr>
										<th>{t("pokemon")}</th>
										{ings.map((i) => (
											<th key={i}>{ingredientLabel(i)}</th>
										))}
										<th>{t("colBerries")}</th>
										<th>{t("colSkill")}</th>
										<th>{t("colBestWithIt")}</th>
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
												<td title={entryTooltip(byId.get(id) as BoxEntry)}>
													{labels.get(id)}
													{m.tasty && <span className="tag">{t("tagExtraTasty")}</span>}
{m.heal && <span className="tag">{t("tagHealer")}</span>}
													{isExcluded && <span className="tag">{t("tagExcluded")}</span>}
												</td>
												{ings.map((i) => (
													<td key={i}>{(m.yield[i] ?? 0) > 0 ? formatAmount(m.yield[i] ?? 0) : "–"}</td>
												))}
												<td>{formatStrength(m.berry)}</td>
												<td>{m.skill > 0 ? formatStrength(m.skill) : "–"}</td>
												<td>{w && <Diff value={w.energy.total - e.total} />}</td>
												<td className="row-actions">
													<button type="button" className="secondary" onClick={() => forceIn(id)}>
														{t("forceIn")}
													</button>
													{isExcluded && (
														<button type="button" className="secondary" onClick={() => allow(id)}>
															{t("allow")}
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

function EnergySettingsCard(props: { settings: EnergySettings; setSettings: (s: EnergySettings) => void }) {
	const { settings, setSettings } = props;
	const key = favoritesKey(settings.favorites);
	const setRecipeLevel = (n: number) =>
		setSettings({ ...settings, recipeLevel: Math.min(maxRecipeLevel, Math.max(1, Math.round(n) || 1)) });
	const custom: PokemonType[] = Array.isArray(settings.favorites) ? settings.favorites : ["normal", "fire", "water"];
	return (
		<section className="card">
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
					{t("islandBonus")}
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

function ruleText(o: SwapOption, swapIn: string, partner: string, last: boolean): string {
	const threshold = o.policy.threshold;
	if (threshold === 0) return t("ruleAlways", { name: partner });
	if (last) return t("ruleAlways", { name: swapIn });
	return t("ruleWhile", {
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
	best: BestTeam;
	withIt: Map<string, BestTeam>;
	pinned: string[];
	excluded: string[];
	labels: Map<string, string>;
}) {
	const { members, problem, best, withIt, pinned, excluded, labels } = props;
	const [chosenIn, setChosenIn] = useState<string | null>(null);
	const [chosenPartner, setChosenPartner] = useState<string | null>(null);
	const byId = new Map(members.map((m) => [m.id, m]));
	const tastyIds = members.filter((m) => m.tasty && !excluded.includes(m.id)).map((m) => m.id);

	// Default: an Extra Tasty Pokémon on the team and whoever replaces it in the best team without it,
	// or the best Extra Tasty Pokémon on the bench and whoever it would replace.
	const defaultIn =
		best.ids.find((id) => tastyIds.includes(id)) ??
		[...tastyIds].sort((a, b) => (withIt.get(b)?.energy.total ?? 0) - (withIt.get(a)?.energy.total ?? 0))[0];
	const swapInId = chosenIn !== null && tastyIds.includes(chosenIn) ? chosenIn : defaultIn;
	const partnerChoices = members.map((m) => m.id).filter((id) => id !== swapInId && !excluded.includes(id));

	/**
	 * The pair shares exactly one slot; the other slots go to the best team without the two of them.
	 * Those members keep their shares and output; the pair is healed by their healers (and its own).
	 */
	const analyse = (inId: string, partnerId: string) => {
		const rest = bestEnergyTeam(
			members,
			problem,
			pinned.filter((id) => id !== inId && id !== partnerId),
			[...excluded, inId, partnerId],
			teamSlots - 1,
		);
		const others = rest.entries;
		const slotSize = Math.min(1, teamSlots - rest.slots);
		// Healers among the others heal for the share of the time they're on the team; a healer sharing the
		// slot heals for its time in the slot (approximated by the slot size).
		const othersHeal = weightedHealSources(
			others.map((o) => ({ member: byId.get(o.member.id) as EnergyMember, share: o.share })),
		);
		const resolve = (id: string) => {
			const m = byId.get(id) as EnergyMember;
			return resolveMembers([m], [...othersHeal, ...weightedHealSources([{ member: m, share: slotSize }])])[0];
		};
		const analysis = swapAnalysis(others, resolve(inId), resolve(partnerId), problem, slotSize);
		return analysis && { ...analysis, slotSize, rest };
	};

	const result = useMemo(() => {
		if (swapInId === undefined) return undefined;
		if (chosenPartner !== null && partnerChoices.includes(chosenPartner)) {
			return { partnerId: chosenPartner, analysis: analyse(swapInId, chosenPartner) };
		}
		// Default partner: the best of the team's members and the top of the bench.
		const benchTop = [...partnerChoices]
			.filter((id) => !best.ids.includes(id))
			.sort((a, b) => (withIt.get(b)?.energy.total ?? 0) - (withIt.get(a)?.energy.total ?? 0))
			.slice(0, 3);
		const candidates = [...best.ids.filter((id) => partnerChoices.includes(id)), ...benchTop];
		let pick: { partnerId: string; analysis: ReturnType<typeof analyse> } | undefined;
		for (const id of candidates) {
			const analysis = analyse(swapInId, id);
			if (!pick || (analysis?.best.energy.total ?? 0) > (pick.analysis?.best.energy.total ?? 0)) {
				pick = { partnerId: id, analysis };
			}
		}
		return pick;
	}, [swapInId, chosenPartner, members, problem, best, pinned.join(","), excluded.join(",")]);
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
	const inName = label(swapInId);
	const partnerName = label(partnerId);
	const analysis = result?.analysis;
	const last = analysis ? analysis.options.length - 1 : 0;
	const isLast = (o: SwapOption) => analysis !== undefined && o === analysis.options[last];
	const bestTotal = best.energy.total;

	return (
		<section className="card">
			<h2>{t("swapPartner")}</h2>
			<p className="muted small">{t("swapHelp", { n: teamSlots - 1 })}</p>
			<div className="form-grid">
				<label>
					{t("extraTastyPokemon")}
					<select value={swapInId} onChange={(e) => setChosenIn(e.target.value)}>
						{tastyIds.map((id) => (
							<option key={id} value={id}>
								{label(id)}
								{best.ids.includes(id) ? t("onTeamSuffix") : ""}
							</option>
						))}
					</select>
				</label>
				<label>
					{t("partner")}
					<select value={partnerId ?? ""} onChange={(e) => setChosenPartner(e.target.value)}>
						{partnerChoices.map((id) => (
							<option key={id} value={id}>
								{label(id)}
							</option>
						))}
					</select>
				</label>
			</div>
			{analysis === undefined ? (
				<p className="muted">{t("pickPartner")}</p>
			) : (
				<>
					<p>
						<strong>{ruleText(analysis.best, inName, partnerName, isLast(analysis.best))}</strong>
						{analysis.best.policy.threshold !== 0 && !isLast(analysis.best) && t("ruleOtherwise", { name: partnerName })}
					</p>
					<p className="muted">
						{t("strengthPerDay", { n: formatStrength(analysis.best.energy.total) })} ·{" "}
						<Diff value={analysis.best.energy.total - bestTotal} /> {t("vsBestTeam")} ·{" "}
						{t("onTeamShare", { name: inName, n: formatPercent(analysis.best.policy.share) })} ·{" "}
						{t("swapTasty", {
							wd: formatPercent(analysis.best.policy.weekdayChance),
							sd: formatPercent(analysis.best.policy.sundayChance),
						})}
						{analysis.slotSize < 0.995 && <> · {t("shareSlot", { n: analysis.slotSize.toFixed(2) })}</>}
					</p>
					<details>
						<summary>{t("allThresholds")}</summary>
						<table>
							<thead>
								<tr>
									<th>{t("colRule")}</th>
									<th>{t("colOnTeam", { name: inName })}</th>
									<th>{t("colExtraTasty")}</th>
									<th>{t("colCooked")}</th>
									<th>{t("colStrengthPerDay")}</th>
									<th>{t("colVsBest")}</th>
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

