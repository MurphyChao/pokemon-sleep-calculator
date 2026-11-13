import { useMemo, useState } from "react";
import type { BoxEntry } from "../core/box";
import {
	dailyIngredientYieldDetail,
	defaultYieldOptions,
	emptyYieldDetail,
	type Heal,
	type IngredientYield,
	soloYieldDetail,
	type YieldDetail,
	type YieldOptions,
} from "../core/yield";
import BoxView from "./BoxView";
import type { TastySource } from "../core/tasty";
import DishCard, { useDish } from "./DishCard";
import EnergyView, { defaultEnergySettings, type EnergySettings } from "./EnergyView";
import { type Key, type Lang, languages, setLang, t } from "./i18n";
import SolverView from "./SolverView";
import { useStoredState } from "./storage";

type Tab = "box" | "slots" | "energy";

const tabs: { tab: Tab; label: Key }[] = [
	{ tab: "energy", label: "tabEnergy" },
	{ tab: "slots", label: "tabSlots" },
];

export default function App() {
	const [tab, setTab] = useState<Tab>("box");
	const [storedLang, setStoredLang] = useStoredState<Lang>("pscalc.lang", "en");
	const lang: Lang = languages.some((l) => l.lang === storedLang) ? storedLang : "en";
	// Text helpers read the language from a module-level value; the page below is re-mounted when it changes.
	setLang(lang);
	const [box, setBox] = useStoredState<BoxEntry[]>("pscalc.box.v1", []);
	const [storedOptions, setOptions] = useStoredState<YieldOptions>("pscalc.yieldOptions", defaultYieldOptions);
	const options = { ...defaultYieldOptions, ...storedOptions };
	const [storedEnergy, setEnergy] = useStoredState<EnergySettings>("pscalc.energySettings", defaultEnergySettings);
	const energy = { ...defaultEnergySettings, ...storedEnergy };
	const dish = useDish();

	const details = useMemo(() => {
		const map = new Map<string, YieldDetail>();
		for (const e of box) {
			try {
				map.set(e.id, soloYieldDetail(e, options, energy));
			} catch {
				map.set(e.id, emptyYieldDetail);
			}
		}
		return map;
	}, [box, options.inventoryLimit, options.campTicket, options.energy, options.sleepScore, JSON.stringify(energy.favorites), energy.fieldBonus]);

	/** With simulated energy: a Pokémon's yields when healed by `heal` (cached). */
	const healedDetail = useMemo(() => {
		if (options.energy !== "simulated") return undefined;
		const cache = new Map<string, YieldDetail>();
		const byId = new Map(box.map((e) => [e.id, e]));
		return (id: string, heal: Heal | undefined): YieldDetail => {
			const key = heal ? `${id}|${heal.count}|${heal.energy.toFixed(3)}` : id;
			let d = cache.get(key);
			if (d === undefined) {
				const e = byId.get(id);
				try {
					d = e ? { ...dailyIngredientYieldDetail(e, options, energy, heal), heal: details.get(id)?.heal } : emptyYieldDetail;
				} catch {
					d = emptyYieldDetail;
				}
				cache.set(key, d);
			}
			return d;
		};
	}, [details]);
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
				</nav>
				<div className="settings-bar">
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
				</div>
			</header>
			<main>
				{tab === "box" ? (
					<BoxView box={box} setBox={setBox} details={details} />
				) : (
					<div className="solver-view">
						<DishCard dish={dish} campTicket={options.campTicket} />
						{tab === "slots" ? (
							<SolverView box={box} recipe={dish.recipe} yields={yields} tasty={tasty} />
						) : (
							<EnergyView
								box={box}
								recipe={dish.recipe}
								details={details}
								healedDetail={healedDetail}
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
				{t("footerRecipeNames")} {t("footerAssumptions")}
			</footer>
		</div>
	);
}
