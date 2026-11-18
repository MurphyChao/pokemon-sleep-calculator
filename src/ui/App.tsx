import { useEffect, useMemo, useState } from "react";
import { type BoxEntry, evolveToFinal, maxSubSkillSeeds, scaleLevels } from "../core/box";
import {
	dailyIngredientYieldDetail,
	defaultYieldOptions,
	emptyYieldDetail,
	type Heal,
	type IngredientYield,
	soloYieldDetail,
	type YieldDetail,
	type YieldOptions,
	withHelpers,
} from "../core/yield";
import BoxView, { keyLevels } from "./BoxView";
import type { TastySource } from "../core/tasty";
import DishCard, { useDish } from "./DishCard";
import EnergyView, { defaultEnergySettings, type EnergySettings } from "./EnergyView";
import { type Key, type Lang, languages, setLang, t } from "./i18n";
import SolverView from "./SolverView";
import { useStoredState } from "./storage";
import SyncControl from "./SyncControl";
import { useRatings } from "./useRatings";
import { type Rank, type RankCategory, rankEntry, rankEntryCategories, rankSettingsKey } from "../core/rank";
import { useRankTables } from "./useRankTables";

type Tab = "box" | "slots" | "energy";

/** A stable empty box, so hooks keyed on the box don't rerun every render. */
const noEntries: BoxEntry[] = [];


const tabs: { tab: Tab; label: Key }[] = [
	{ tab: "energy", label: "tabEnergy" },
	{ tab: "slots", label: "tabSlots" },
];

export default function App() {
	const [tab, setTab] = useState<Tab>("box");
	/** The Box tab's pop-up with the screenshot import and the add/edit form. */
	const [addOpen, setAddOpen] = useState(false);
	/** Phones only: the settings are folded away behind a button (always shown on wider screens). */
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [storedLang, setStoredLang] = useStoredState<Lang>("pscalc.lang", "en");
	const lang: Lang = languages.some((l) => l.lang === storedLang) ? storedLang : "en";
	// Text helpers read the language from a module-level value; the page below is re-mounted when it changes.
	setLang(lang);
	useEffect(() => {
		document.title = t("pageTitle");
		document.documentElement.lang = lang;
	}, [lang]);
	const [box, setBox] = useStoredState<BoxEntry[]>("pscalc.box.v1", []);
	const [storedOptions, setOptions] = useStoredState<YieldOptions>("pscalc.yieldOptions", defaultYieldOptions);
	const options = { ...defaultYieldOptions, ...storedOptions };
	const [storedEnergy, setEnergy] = useStoredState<EnergySettings>("pscalc.energySettings", defaultEnergySettings);
	const energy = { ...defaultEnergySettings, ...storedEnergy };
	const dish = useDish();
	/** Solvers only: Pokémon below this level are treated as this level (null = off). */
	const [levelScale, setLevelScale] = useStoredState<number | null>("pscalc.levelScale", null);
	/** Solvers only: evolve every Pokémon to its final form. */
	const [finalEvolution, setFinalEvolution] = useStoredState("pscalc.finalEvolution", false);
	/** Solvers only: upgrade unlocked subskills with Sub Skill Seeds as far as they go. */
	const [subSkillSeeds, setSubSkillSeeds] = useStoredState("pscalc.maxSubSkillSeeds", false);
	// Seeds come last: which subskill slots are unlocked depends on the (scaled) level.
	const solverBox = useMemo(
		() => maxSubSkillSeeds(scaleLevels(evolveToFinal(box, finalEvolution), levelScale), subSkillSeeds),
		[box, finalEvolution, levelScale, subSkillSeeds],
	);
	/** The box the numbers below are computed for, on every tab: evolved, level-scaled and seeded if on. */
	const mathBox = solverBox;

	const details = useMemo(() => {
		const map = new Map<string, YieldDetail>();
		for (const e of mathBox) {
			try {
				map.set(e.id, soloYieldDetail(e, options, energy));
			} catch {
				map.set(e.id, emptyYieldDetail);
			}
		}
		return map;
	}, [mathBox, options.inventoryLimit, options.campTicket, options.energy, options.sleepScore, JSON.stringify(energy.favorites), energy.fieldBonus]);

	/**
	 * A Pokémon's yields on its own (as in `details`) with `helpers` teammates' worth of Helping Bonus
	 * (0–4, can be fractional; cached).
	 */
	const helpedDetail = useMemo(() => {
		const cache = new Map<string, YieldDetail>();
		const byId = new Map(mathBox.map((e) => [e.id, e]));
		const at = (id: string, helpers: number): YieldDetail => {
			if (helpers === 0) return details.get(id) ?? emptyYieldDetail;
			const key = `${id}|${helpers}`;
			let d = cache.get(key);
			if (d === undefined) {
				const e = byId.get(id);
				try {
					d = e ? soloYieldDetail(e, options, energy, helpers) : emptyYieldDetail;
				} catch {
					d = emptyYieldDetail;
				}
				cache.set(key, d);
			}
			return d;
		};
		return (id: string, helpers: number) => withHelpers((k) => at(id, k), helpers);
	}, [details]);

	/** With simulated energy: a Pokémon's yields when healed by `heal`, with `helpers` as above (cached). */
	const healedDetail = useMemo(() => {
		if (options.energy !== "simulated") return undefined;
		const cache = new Map<string, YieldDetail>();
		const byId = new Map(mathBox.map((e) => [e.id, e]));
		const at = (id: string, heal: Heal | undefined, helpers: number): YieldDetail => {
			const key = `${id}|${helpers}|${heal ? `${heal.count}|${heal.energy.toFixed(3)}` : "-"}`;
			let d = cache.get(key);
			if (d === undefined) {
				const e = byId.get(id);
				try {
					// The heal it gives others is the one worked out on its own (with its own healing).
					d = e
						? { ...dailyIngredientYieldDetail(e, options, energy, heal, helpers), heal: helpedDetail(id, helpers).heal }
						: emptyYieldDetail;
				} catch {
					d = emptyYieldDetail;
				}
				cache.set(key, d);
			}
			return d;
		};
		return (id: string, heal: Heal | undefined, helpers = 0) => withHelpers((k) => at(id, heal, k), helpers);
	}, [details, helpedDetail]);
	/** Box tab only (benches show the rank): each Pokémon's rarity among rolls of its species. */
	/**
	 * Rarity and rank always judge a Pokémon as its final form (and with Sub Skill Seeds, which they apply
	 * themselves), whatever the Final evolution option, so they say how good it can become.
	 */
	const ratedBox = useMemo(() => evolveToFinal(mathBox, true), [mathBox]);
	const ratings = useRatings(tab === "box" ? ratedBox : noEntries, options, energy);
	const rankKey = rankSettingsKey(options, energy);
	/** The categories each Pokémon is ranked in with these settings (they decide which tables are needed). */
	const rankCategoriesById = useMemo(() => {
		const map = new Map<string, RankCategory[]>();
		for (const e of ratedBox) {
			try {
				map.set(e.id, rankEntryCategories(e, options, energy));
			} catch {
				map.set(e.id, []);
			}
		}
		return map;
	}, [ratedBox, rankKey]);
	const neededRankCategories = useMemo(() => [...rankCategoriesById.values()].flat(), [rankCategoriesById]);
	/** The rank's tables for these settings: shipped for the defaults, otherwise built as the box needs them. */
	const rankTables = useRankTables(options, energy, neededRankCategories);
	/**
	 * Each Pokémon's cross-species rank with these settings; missing while one of its tables is being built,
	 * null if it can't be ranked.
	 */
	const ranks = useMemo(() => {
		const map = new Map<string, Rank | null>();
		if (!rankTables) return map;
		for (const e of ratedBox) {
			if (rankCategoriesById.get(e.id)?.some((c) => rankTables.pending.has(c))) continue;
			try {
				map.set(e.id, rankEntry(e, rankTables.tables, options, energy) ?? null);
			} catch {
				map.set(e.id, null);
			}
		}
		return map;
	}, [ratedBox, rankTables, rankCategoriesById]);
	const yields = useMemo(
		() => new Map<string, IngredientYield>([...details].map(([id, d]) => [id, d.total])),
		[details],
	);
	const tasty = useMemo(
		() =>
			new Map<string, TastySource>(
				[...details].flatMap(([id, d]) => (d.tasty ? [[id, d.tasty] as [string, TastySource]] : [])),
			),
		[details],
	);

	return (
		<div className="app" key={lang} lang={lang}>
			<header>
				<div className="title-row">
					<h1>{t("appTitle")}</h1>
					<div className="header-tools">
						<SyncControl />
						<label className="language">
						<span className="muted small">{t("language")}</span>
						<select value={lang} onChange={(e) => setStoredLang(e.target.value as Lang)}>
							{languages.map((l) => (
								<option key={l.lang} value={l.lang}>
									{l.label}
								</option>
							))}
						</select>
						</label>
					</div>
				</div>
				<p className="subtitle">{t("subtitle")}</p>
				<nav>
					<button type="button" className={tab === "box" ? "active" : ""} onClick={() => setTab("box")}>
						{t("tabBox", { n: box.length })}
					</button>
					{tabs.map((x) => (
						<button
							type="button"
							key={x.tab}
							className={tab === x.tab ? "active" : ""}
							onClick={() => setTab(x.tab)}
						>
							{t(x.label)}
						</button>
					))}
					<button
						type="button"
						className="nav-add"
						onClick={() => {
							setTab("box");
							setAddOpen(true);
						}}
					>
						<span className="label-long">{t("addPokemonButton")}</span>
						<span className="label-short" aria-hidden="true">
							{t("addPokemonShort")}
						</span>
					</button>
				</nav>
				<button
					type="button"
					className="secondary settings-toggle"
					aria-label={t("settings")}
					aria-expanded={settingsOpen}
					aria-controls="settings-bar"
					onClick={() => setSettingsOpen(!settingsOpen)}
				>
					⚙ <span className="settings-label">{t("settings")}</span> {settingsOpen ? "▴" : "▾"}
				</button>
				<div id="settings-bar" className={settingsOpen ? "settings-bar" : "settings-bar collapsed"}>
					<label className="check">
						<input
							type="checkbox"
							checked={options.inventoryLimit}
							onChange={(e) => setOptions({ ...options, inventoryLimit: e.target.checked })}
						/>
						{t("inventoryLimit")}
						<span className="muted small">{t("inventoryLimitHint")}</span>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={options.campTicket}
							onChange={(e) => setOptions({ ...options, campTicket: e.target.checked })}
						/>
						{t("campTicket")}
						<span className="muted small">{t("campTicketHint")}</span>
					</label>
					<label className="check">
						{t("energy")}
						<select
							value={options.energy}
							onChange={(e) => setOptions({ ...options, energy: e.target.value as YieldOptions["energy"] })}
						>
							<option value="full">{t("energyFull")}</option>
							<option value="simulated">{t("energySimulated")}</option>
						</select>
					</label>
					<label className="check">
						{t("sleepScore")}
						<input
							type="number"
							min={0}
							max={100}
							className="narrow"
							value={options.sleepScore}
							onChange={(e) =>
								setOptions({
									...options,
									sleepScore: Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))),
								})
							}
						/>
						<span className="muted small">{t("sleepScoreHint")}</span>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={finalEvolution}
							onChange={(e) => setFinalEvolution(e.target.checked)}
						/>
						{t("finalEvolution")}
						<span className="muted small">{t("finalEvolutionHint")}</span>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={subSkillSeeds}
							onChange={(e) => setSubSkillSeeds(e.target.checked)}
						/>
						{t("maxSubSkillSeeds")}
						<span className="muted small">{t("maxSubSkillSeedsHint")}</span>
					</label>
					<div className="check level-scale" role="group" aria-labelledby="level-scale-label">
						<label id="level-scale-label" htmlFor="level-scale-input">
							{t("levelScaling")}
						</label>
						<input
							id="level-scale-input"
							type="number"
							min={1}
							max={100}
							className="narrow"
							placeholder={t("levelScalingOff")}
							value={levelScale ?? ""}
							onChange={(e) => {
								const v = Math.round(Number(e.target.value));
								setLevelScale(e.target.value === "" || !v || v <= 1 ? null : Math.min(100, v));
							}}
						/>
						<div className="key-levels">
							<button
								type="button"
								className={levelScale === null ? "" : "secondary"}
								aria-pressed={levelScale === null}
								onClick={() => setLevelScale(null)}
							>
								{t("levelScalingOff")}
							</button>
							{keyLevels.map((lv) => (
								<button
									type="button"
									key={lv}
									className={levelScale === lv ? "" : "secondary"}
									aria-pressed={levelScale === lv}
									onClick={() => setLevelScale(lv)}
								>
									{lv}
								</button>
							))}
						</div>
						<span className="muted small">{t("levelScalingHint")}</span>
					</div>
				</div>
			</header>
			<main>
				{tab === "box" ? (
					<BoxView
						box={box}
						adjusted={solverBox}
						setBox={setBox}
						details={details}
						ratings={ratings}
						ranks={ranks}
						panelOpen={addOpen}
						setPanelOpen={setAddOpen}
					/>
				) : (
					<div className="solver-view">
						<DishCard dish={dish} campTicket={options.campTicket} />
						{tab === "slots" ? (
							<SolverView
								box={solverBox}
								recipe={dish.recipe}
								yields={yields}
								helpedDetail={helpedDetail}
								details={details}
								tasty={tasty}
								ranks={ranks}
							/>
						) : (
							<EnergyView
								box={solverBox}
								recipe={dish.recipe}
								details={details}
								healedDetail={healedDetail}
								helpedDetail={helpedDetail}
								ranks={ranks}
								settings={energy}
								setSettings={setEnergy}
							/>
						)}
					</div>
				)}
			</main>
			<footer>
				{t("footerData")} <a href="https://github.com/nitoyon/pokesleep-tool">nitoyon/pokesleep-tool</a> (MIT).{" "}
				{t("footerRecipes")} <a href="https://github.com/SleepAPI/SleepAPI">SleepAPI</a> (Apache-2.0).{" "}
				{t("footerIcons")} <a href="https://pokemondb.net/sprites">Pokémon Database</a> (© Nintendo/Game Freak).{" "}
				{t("footerRecipeNames")} {t("footerAssumptions")} <a href="privacy.html">{t("privacyPolicy")}</a>
			</footer>
		</div>
	);
}
