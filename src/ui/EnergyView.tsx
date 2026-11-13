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
	type SwapOption,
	swapAnalysis,
} from "../core/energy";
import { sundayBaseChance, weekdayBaseChance } from "../core/tasty";
import { dailyDemand, mealsPerDay, type Recipe } from "../core/recipes";
import type { Heal, StrengthOptions, YieldDetail } from "../core/yield";
import { getFavoriteBerries } from "../vendor/pokesleep-tool/data/fields";
import { type IngredientName, type PokemonType, PokemonTypes } from "../vendor/pokesleep-tool/data/pokemons";
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
const islands = [
	"Cyan Beach",
	"Taupe Hollow",
	"Snowdrop Tundra",
	"Lapis Lakeside",
	"Old Gold Power Plant",
	"Amber Canyon",
].map((name, i) => ({ name, types: getFavoriteBerries(i + 1) }));

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
					<p className="muted">Add Pokémon on the Box tab first.</p>
				</section>
			) : (
				<>
					<section className="card headline">
						<h2>Best team</h2>
						<p>
							<strong className="big">{formatStrength(e.total)} strength / day</strong>
							<span className="muted">
								{" "}
								· {best.slots.toFixed(2)} / {teamSlots} slots · {best.ids.length} Pokémon
							</span>
						</p>
						<p className="muted">
							<span>
								{" "}
								Berries {formatStrength(e.berry)} · skills {formatStrength(e.skill)} · dishes {formatStrength(e.dish)}
							</span>
						</p>
						<p className="muted">
							Dish: {formatStrength(problem.dishStrength)} per meal × {mealsPerDay} meals × cooked{" "}
							<strong className={e.coverage < 1 - 1e-9 ? "warn" : "ok"}>{formatPercent(e.coverage)}</strong> of meals ×
							Extra Tasty ×{e.tastyMultiplier.toFixed(3)} (weekly average)
						</p>
						<p className="muted small">
							{healedDetail ? (
								<>
									Energy is simulated: it drains during the day.{" "}
									{teamHealSources(bestMembers).length > 0 ? (
										<>
											This team's healers restore about{" "}
											<strong>{Math.round(teamHealing)} energy per member per day</strong>
											, which is included below.
										</>
									) : (
										"No healer on this team restores the whole team's energy."
									)}
								</>
							) : (
								"Energy is always full, so healers add nothing. Switch Energy to Simulated at the top to count them."
							)}
						</p>
						<table>
							<thead>
								<tr>
									<th>Pokémon</th>
									{ings.map((i) => (
										<th key={i}>{ingredientLabel(i)}</th>
									))}
									<th>Berries</th>
									<th>Skill</th>
									<th>Slot used</th>
									<th>Without it</th>
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
												{m.tasty && <span className="tag">Extra Tasty</span>}
{m.heal && <span className="tag">Healer</span>}
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
													Pin
												</label>
												<button type="button" className="secondary" onClick={() => exclude(id)}>
													Exclude
												</button>
											</td>
										</tr>
									);
								})}
								<tr className="total">
									<td>Total / needed</td>
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
							<strong>Slot used</strong>: the share of the time a Pokémon is on the team, as in the slot solver. Shares
							add up to at most {teamSlots} slots, so more than {teamSlots} Pokémon can take part by swapping, e.g. two
							gatherers at 0.50 each when the dish only needs half of each one's ingredients. Berries, skill and
							ingredients columns are per full day on the team; totals are weighted by slot used. Extra Tasty Pokémon
							and healers are tried at 0, ½ or a full slot. The team is re-optimised whenever something changes:{" "}
							<strong>Pin</strong> gives a Pokémon a full slot, <strong>Exclude</strong> keeps it off.{" "}
							<strong>Without it</strong>: strength per day of the best team without this Pokémon, minus this team's.
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
						<h2>Bench</h2>
						<p className="muted small">
							<strong>Best team with it</strong>: strength per day of the best team that gives this Pokémon a full slot,
							minus the best team's. Sorted by this.
						</p>
						{bench.length === 0 ? (
							<p className="muted">Every Pokémon in your box is on the team.</p>
						) : (
							<table>
								<thead>
									<tr>
										<th>Pokémon</th>
										{ings.map((i) => (
											<th key={i}>{ingredientLabel(i)}</th>
										))}
										<th>Berries</th>
										<th>Skill</th>
										<th>Best team with it</th>
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
													{m.tasty && <span className="tag">Extra Tasty</span>}
{m.heal && <span className="tag">Healer</span>}
													{isExcluded && <span className="tag">excluded</span>}
												</td>
												{ings.map((i) => (
													<td key={i}>{(m.yield[i] ?? 0) > 0 ? formatAmount(m.yield[i] ?? 0) : "–"}</td>
												))}
												<td>{formatStrength(m.berry)}</td>
												<td>{m.skill > 0 ? formatStrength(m.skill) : "–"}</td>
												<td>{w && <Diff value={w.energy.total - e.total} />}</td>
												<td className="row-actions">
													<button type="button" className="secondary" onClick={() => forceIn(id)}>
														Force in
													</button>
													{isExcluded && (
														<button type="button" className="secondary" onClick={() => allow(id)}>
															Allow
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
			<h2>Island</h2>
			<div className="form-grid">
				<label>
					Favorite berries (×2)
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
						<option value="none">None</option>
						<option value="custom">Greengrass Isle (choose 3)</option>
						{islands.map((x, i) => (
							<option key={x.name} value={`island${i}`}>
								{x.name} ({x.types.map(capitalize).join(", ")})
							</option>
						))}
						<option value="all">All berries</option>
					</select>
				</label>
				<label>
					Island bonus (%)
					<input
						type="number"
						min={0}
						value={settings.fieldBonus}
						onChange={(ev) => setSettings({ ...settings, fieldBonus: Math.max(0, Number(ev.target.value) || 0) })}
					/>
				</label>
				<div className="field">
					<label htmlFor="recipe-level">Recipe level</label>
					<div className="stepper">
						<button
							type="button"
							className="secondary"
							aria-label="Recipe level down"
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
							aria-label="Recipe level up"
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
							Berry {slot + 1}
							<select
								value={custom[slot]}
								onChange={(ev) => {
									const next = [...custom];
									next[slot] = ev.target.value as PokemonType;
									setSettings({ ...settings, favorites: next });
								}}
							>
								{PokemonTypes.map((t) => (
									<option key={t} value={t} disabled={custom.includes(t) && custom[slot] !== t}>
										{capitalize(t)}
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
	const t = o.policy.threshold;
	if (t === 0) return `Always ${partner}`;
	if (last) return `Always ${swapIn}`;
	return `${swapIn} while chance ≤ ${chanceLimit(t, weekdayBaseChance)} (Sun ${chanceLimit(t, sundayBaseChance)})`;
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
		const othersHeal = teamHealSources(members.filter((m) => others.some((o) => o.member.id === m.id)));
		const resolve = (id: string) => {
			const m = byId.get(id) as EnergyMember;
			return resolveMembers([m], [...othersHeal, ...teamHealSources([m])])[0];
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
				<h2>Swap partner</h2>
				<p className="muted">
					No Pokémon in your box raises the Extra Tasty chance (Tasty Chance S, Bulk Up, Mystical Fire), so there is
					nothing to swap by Extra Tasty bonus.
				</p>
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
			<h2>Swap partner</h2>
			<p className="muted small">
				Two Pokémon share one slot, and the other {teamSlots - 1} slots go to the best team without them. The two are swapped after every meal, depending on the Extra Tasty chance shown on the
				cooking screen: the Extra Tasty Pokémon while the chance is low, the partner once it's high. The bonus from skills
				carries over until an Extra Tasty dish resets it, so once it's high, more skill triggers are mostly wasted.
				Assumes three equal 8-hour windows, swapping at night too, items collected before each swap, and no other effect
				of swapping (energy, skill chance progress).
			</p>
			<div className="form-grid">
				<label>
					Extra Tasty Pokémon
					<select value={swapInId} onChange={(e) => setChosenIn(e.target.value)}>
						{tastyIds.map((id) => (
							<option key={id} value={id}>
								{label(id)}
								{best.ids.includes(id) ? " (on team)" : ""}
							</option>
						))}
					</select>
				</label>
				<label>
					Partner
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
				<p className="muted">Pick a partner.</p>
			) : (
				<>
					<p>
						<strong>{ruleText(analysis.best, inName, partnerName, isLast(analysis.best))}</strong>
						{analysis.best.policy.threshold !== 0 && !isLast(analysis.best) && <>, otherwise {partnerName}</>}
					</p>
					<p className="muted">
						{formatStrength(analysis.best.energy.total)} strength / day ·{" "}
						<Diff value={analysis.best.energy.total - bestTotal} /> vs. the best team · {inName} on the team{" "}
						{formatPercent(analysis.best.policy.share)} of the time · Extra Tasty Mon–Sat{" "}
						{formatPercent(analysis.best.policy.weekdayChance)}, Sunday {formatPercent(analysis.best.policy.sundayChance)}
						{analysis.slotSize < 0.995 && (
							<> · the two share {analysis.slotSize.toFixed(2)} of a slot</>
						)}
					</p>
					<details>
						<summary>All thresholds</summary>
						<table>
							<thead>
								<tr>
									<th>Rule</th>
									<th>{inName} on team</th>
									<th>Extra Tasty (Mon–Sat / Sun)</th>
									<th>Cooked</th>
									<th>Strength / day</th>
									<th>vs. best team</th>
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

