import { useMemo } from "react";
import type { BoxEntry } from "../core/box";
import { dailyDemand, mealsPerDay, type Recipe } from "../core/recipes";
import {
	achievableDemand,
	autoTeam,
	type BenchScore,
	type Demand,
	fullSupply,
	type Member,
	minSlots,
	benchScores,
	savingsVsBestWithout,
} from "../core/slots";
import { extraTasty, type TastySlotValue, type TastySource, tastySlotValue } from "../core/tasty";
import type { IngredientYield } from "../core/yield";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { Rich, t } from "./i18n";
import { buildEntryLabels, entryTooltip, formatAmount, formatPercent, ingredientLabel } from "./names";
import { useStoredState } from "./storage";

export const teamSize = 5;

export default function SolverView(props: {
	box: BoxEntry[];
	recipe: Recipe;
	yields: Map<string, IngredientYield>;
	tasty: Map<string, TastySource>;
}) {
	const { box, recipe, yields, tasty } = props;
	const [pinnedRaw, setPinned] = useStoredState<string[]>("pscalc.pinned", []);
	/** Team per recipe; a recipe without an entry gets the auto-filled team. */
	const [teams, setTeams] = useStoredState<Record<string, string[]>>("pscalc.teams", {});

	const demand = useMemo(() => dailyDemand(recipe), [recipe]);

	const members: Member[] = useMemo(() => box.map((e) => ({ id: e.id, yield: yields.get(e.id) ?? {} })), [box, yields]);
	const byId = useMemo(() => new Map(box.map((e) => [e.id, e])), [box]);
	const labels = useMemo(() => buildEntryLabels(box), [box]);
	const pinned = pinnedRaw.filter((id) => byId.has(id));
	const target = useMemo(() => achievableDemand(members, demand), [members, demand]);

	const storedTeam = teams[recipe.id]?.filter((id) => byId.has(id));
	const team = useMemo(
		() => storedTeam ?? autoTeam(members, target.demand, pinned),
		[storedTeam?.join(","), members, target, pinned.join(",")],
	);
	const setTeam = (ids: string[]) => setTeams({ ...teams, [recipe.id]: ids });

	const teamMembers = members.filter((m) => team.includes(m.id));
	const result = useMemo(() => minSlots(teamMembers, target.demand, pinned), [teamMembers, target, pinned.join(",")]);
	const teamTasty = team.flatMap((id) => (tasty.has(id) ? [{ id, source: tasty.get(id) as TastySource }] : []));
	const tastyNow = useMemo(() => extraTasty(teamTasty.map((t) => t.source)), [teamTasty.map((t) => t.id).join(",")]);
	// Extra Tasty value in slot-equivalents, relative to the slots this team needs for its ingredients.
	const tastySlots = Number.isFinite(result.slots) ? result.slots : null;
	const memberTastyValue = useMemo(() => {
		const out = new Map<string, TastySlotValue>();
		if (tastySlots === null) return out;
		for (const t of teamTasty) {
			const others = teamTasty.filter((x) => x.id !== t.id).map((x) => x.source);
			out.set(t.id, tastySlotValue(others, t.source, tastySlots));
		}
		return out;
	}, [teamTasty.map((t) => t.id).join(","), tastySlots]);

	const bench = useMemo(() => {
		const scores = benchScores(members, team, pinned, target.demand);
		const tastyValue = new Map<string, TastySlotValue>();
		if (tastySlots !== null) {
			const teamSources = teamTasty.map((t) => t.source);
			for (const s of scores) {
				const own = tasty.get(s.id);
				if (own) tastyValue.set(s.id, tastySlotValue(teamSources, own, tastySlots));
			}
		}
		// Rank by ingredient slots saved plus weekly Extra Tasty value; "makes it possible" stays on top.
		const key = (s: BenchScore) =>
			s.reduction === Number.POSITIVE_INFINITY
				? Number.POSITIVE_INFINITY
				: (s.reduction ?? 0) + (tastyValue.get(s.id)?.week ?? 0);
		const sorted = [...scores].sort((a, b) => key(b) - key(a) || b.coverageGain - a.coverageGain);
		return { scores: sorted, tastyValue };
	}, [members, team, target, pinned.join(","), tasty, tastySlots]);

	const vsBest = useMemo(
		() =>
			savingsVsBestWithout(
				members,
				target.demand,
				pinned,
				bench.scores.map((s) => s.id),
			),
		[members, target, pinned.join(","), bench.scores.map((s) => s.id).join(",")],
	);

	const moveToBench = (id: string) => {
		setTeam(team.filter((x) => x !== id));
		if (pinned.includes(id)) setPinned(pinned.filter((x) => x !== id));
	};
	const moveToTeam = (id: string) => setTeam([...team, id]);
	const togglePin = (id: string) => setPinned(pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);
	const autoFill = () => {
		const next = { ...teams };
		delete next[recipe.id];
		setTeams(next);
	};

	return (
		<>
			{box.length === 0 ? (
				<section className="card">
					<p className="muted">{t("addOnBoxFirst")}</p>
				</section>
			) : (
				<>
					{Object.keys(target.shortfall).length > 0 && (
						<section className="card">
							<p className="warn">{t("shortfall", { n: mealsPerDay })}</p>
							<ul>
								{(Object.entries(target.shortfall) as [IngredientName, number][]).map(([i, n]) => (
									<li key={i}>
										{t("shortfallLine", {
											ing: ingredientLabel(i),
											have: formatAmount((demand[i] ?? 0) - n),
											need: demand[i] ?? 0,
										})}
									</li>
								))}
							</ul>
							<p className="muted small">{t("shortfallNote")}</p>
						</section>
					)}

					<section className="card headline">
						<div className="card-title">
							<h2>{t("currentTeam")}</h2>
							<button type="button" className="secondary" onClick={autoFill} disabled={storedTeam === undefined}>
								{t("autoFill")}
							</button>
						</div>
						<p>
							{Number.isFinite(result.slots) ? (
								<>
									<strong className="big">{t("slotsNeeded", { n: result.slots.toFixed(2) })}</strong>
									<span className="muted"> · {t("nPokemon", { n: team.length })}</span>
								</>
							) : (
								<strong className="big warn">{t("cantCover")}</strong>
							)}
						</p>
						<p className="muted">
							<Rich
								text={t("tastyChanceLine", {
									wd: formatPercent(tastyNow.weekdayChance),
									wm: tastyNow.weekdayMultiplier.toFixed(2),
									sd: formatPercent(tastyNow.sundayChance),
									sm: tastyNow.sundayMultiplier.toFixed(2),
								})}
							/>
						</p>
						{team.length > teamSize && (
							<p className="warn">{t("moreThanTeam", { n: teamSize })}</p>
						)}
						<TeamTable
							ids={team}
							demand={demand}
							byId={byId}
							labels={labels}
							yields={yields}
							usage={Number.isFinite(result.slots) ? result.usage : undefined}
							tastyValue={memberTastyValue}
							pinned={pinned}
							onPin={togglePin}
							onMove={moveToBench}
						/>
						<p className="muted small">
							<Rich text={t("slotHelp")} />
						</p>
					</section>

					<section className="card">
						<h2>{t("bench")}</h2>
						<p className="muted small">
							<Rich text={t("benchHelp")} />
						</p>
						<BenchTable
							scores={bench.scores}
							tastyValue={bench.tastyValue}
							vsBest={vsBest}
							demand={demand}
							byId={byId}
							labels={labels}
							yields={yields}
							onMove={moveToTeam}
						/>
					</section>
				</>
			)}
		</>
	);
}

function YieldCells(props: { id: string; ings: IngredientName[]; yields: Map<string, IngredientYield> }) {
	const y = props.yields.get(props.id) ?? {};
	return (
		<>
			{props.ings.map((i) => (
				<td key={i}>{(y[i] ?? 0) > 0 ? formatAmount(y[i] ?? 0) : "–"}</td>
			))}
		</>
	);
}

function TeamTable(props: {
	ids: string[];
	demand: Demand;
	byId: Map<string, BoxEntry>;
	labels: Map<string, string>;
	yields: Map<string, IngredientYield>;
	usage: Map<string, number> | undefined;
	tastyValue: Map<string, TastySlotValue>;
	pinned: string[];
	onPin: (id: string) => void;
	onMove: (id: string) => void;
}) {
	const { ids, demand, byId, labels, yields, usage, tastyValue, pinned, onPin, onMove } = props;
	const ings = Object.keys(demand) as IngredientName[];
	const supply = fullSupply(
		ids.map((id) => ({ id, yield: yields.get(id) ?? {} })),
		demand,
	);
	return (
		<table>
			<thead>
				<tr>
					<th>{t("pokemon")}</th>
					{ings.map((i) => (
						<th key={i}>{ingredientLabel(i)}</th>
					))}
					<th>{t("colSlotUsed")}</th>
					<th>{t("colExtraTasty")}</th>
					<th />
				</tr>
			</thead>
			<tbody>
				{ids.map((id) => {
					const u = usage?.get(id);
					return (
						<tr key={id}>
							<td title={entryTooltip(byId.get(id) as BoxEntry)}>{labels.get(id)}</td>
							<YieldCells id={id} ings={ings} yields={yields} />
							<td>{u === undefined ? "–" : u > 1e-7 ? u.toFixed(2) : <span className="muted">{t("notNeeded")}</span>}</td>
							<TastyCell value={tastyValue.get(id)} />
							<td className="row-actions">
								<label className="check small">
									<input type="checkbox" checked={pinned.includes(id)} onChange={() => onPin(id)} />
									{t("pin")}
								</label>
								<button type="button" className="secondary" onClick={() => onMove(id)}>
									{t("toBench")}
								</button>
							</td>
						</tr>
					);
				})}
				<tr className="total">
					<td>{t("totalNeeded")}</td>
					{ings.map((i) => {
						const cov = (supply[i] ?? 0) / (demand[i] as number);
						return (
							<td key={i}>
								{formatAmount(supply[i] ?? 0)} / {demand[i]}
								<div className="bar">
									<div className={cov >= 1 - 1e-9 ? "fill ok" : "fill warn"} style={{ width: `${Math.min(100, cov * 100)}%` }} />
								</div>
							</td>
						);
					})}
					<td colSpan={3} />
				</tr>
			</tbody>
		</table>
	);
}

function reductionLabel(s: BenchScore): React.ReactNode {
	if (s.reduction === Number.POSITIVE_INFINITY) return <span className="ok">{t("makesPossible")}</span>;
	if (s.reduction === null) {
		return s.coverageGain > 1e-7 ? t("coverageGain", { n: formatPercent(s.coverageGain) }) : <span className="muted">–</span>;
	}
	return s.reduction > 1e-7 ? <span className="ok">−{s.reduction.toFixed(2)}</span> : <span className="muted">0</span>;
}

function vsBestLabel(n: number | undefined): React.ReactNode {
	if (n === undefined) return null;
	if (n === Number.POSITIVE_INFINITY) return <span className="ok">{t("essential")}</span>;
	return n > 1e-7 ? <span className="ok">−{n.toFixed(2)}</span> : <span className="muted">0</span>;
}

function BenchTable(props: {
	scores: BenchScore[];
	tastyValue: Map<string, TastySlotValue>;
	vsBest: Map<string, number>;
	demand: Demand;
	byId: Map<string, BoxEntry>;
	labels: Map<string, string>;
	yields: Map<string, IngredientYield>;
	onMove: (id: string) => void;
}) {
	const { scores, tastyValue, vsBest, demand, byId, labels, yields, onMove } = props;
	const ings = Object.keys(demand) as IngredientName[];
	if (scores.length === 0) return <p className="muted">{t("allOnTeam")}</p>;
	return (
		<table>
			<thead>
				<tr>
					<th>{t("pokemon")}</th>
					{ings.map((i) => (
						<th key={i}>{ingredientLabel(i)}</th>
					))}
					<th>{t("savesCurrent")}</th>
					<th>{t("savesVsBest")}</th>
					<th>{t("colExtraTasty")}</th>
					<th>{t("replaces")}</th>
					<th />
				</tr>
			</thead>
			<tbody>
				{scores.map((s) => (
					<tr key={s.id}>
						<td title={entryTooltip(byId.get(s.id) as BoxEntry)}>{labels.get(s.id)}</td>
						<YieldCells id={s.id} ings={ings} yields={yields} />
						<td>{reductionLabel(s)}</td>
						<td>{vsBestLabel(vsBest.get(s.id))}</td>
						<TastyCell value={tastyValue.get(s.id)} />
						<td>{s.replaces.map((id) => labels.get(id)).join(", ")}</td>
						<td>
							<button type="button" className="secondary" onClick={() => onMove(s.id)}>
								{t("toTeam")}
							</button>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

/** Extra Tasty value in slot-equivalents, Mon–Sat / Sunday, with the weekly average in the tooltip. */
function TastyCell(props: { value: TastySlotValue | undefined }) {
	const v = props.value;
	if (!v) return <td className="muted">–</td>;
	return (
		<td title={t("weeklyAverageSlots", { n: v.week.toFixed(2) })}>
			<span className="ok">+{v.weekday.toFixed(2)}</span> / <span className="ok">+{v.sunday.toFixed(2)}</span>
		</td>
	);
}
