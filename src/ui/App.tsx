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
import SolverView from "./SolverView";
import { useStoredState } from "./storage";

type Tab = "box" | "slots" | "energy";

const tabs: { tab: Tab; label: string }[] = [
	{ tab: "slots", label: "Slot solver" },
	{ tab: "energy", label: "Energy solver" },
];

export default function App() {
	const [tab, setTab] = useState<Tab>("box");
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
		<div className="app">
			<header>
				<h1>Dish Team Calculator</h1>
				<p className="subtitle">
					How many team slots do your Pokémon need to supply a dish's ingredients for 3 meals a day?
				</p>
				<nav>
					<button type="button" className={tab === "box" ? "active" : ""} onClick={() => setTab("box")}>
						Box ({box.length})
					</button>
					{tabs.map((t) => (
						<button
							type="button"
							key={t.tab}
							className={tab === t.tab ? "active" : ""}
							onClick={() => setTab(t.tab)}
						>
							{t.label}
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
						Inventory limit
						<span className="muted small">(off: bag never fills)</span>
					</label>
					<label className="check">
						<input
							type="checkbox"
							checked={options.campTicket}
							onChange={(e) => setOptions({ ...options, campTicket: e.target.checked })}
						/>
						Good Camp Ticket
						<span className="muted small">(help speed and inventory ×1.2)</span>
					</label>
					<label className="check">
						Energy
						<select
							value={options.energy}
							onChange={(e) => setOptions({ ...options, energy: e.target.value as YieldOptions["energy"] })}
						>
							<option value="full">Always full</option>
							<option value="simulated">Simulated (drains; healers restore it)</option>
						</select>
					</label>
					<label className="check">
						Sleep score
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
						<span className="muted small">(100 = 8.5 h asleep; 0 = no sleep)</span>
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
				Pokémon data and ingredient model from{" "}
				<a href="https://github.com/nitoyon/pokesleep-tool">nitoyon/pokesleep-tool</a> (MIT). Recipes from{" "}
				<a href="https://github.com/SleepAPI/SleepAPI">SleepAPI</a> (Apache-2.0). The sleep score sets how long you sleep (100 = 8.5 hours, 0 = not at all): while asleep the bag isn't emptied, and with
				simulated energy that's when energy recovers. Energy "Always full" keeps every Pokémon at
				full help speed all day. "Simulated" uses pokesleep-tool's energy model (energy drains while awake and recovers during sleep);
				on the Box tab and in the slot solver each Pokémon is healed only by its own skill, while the energy solver also counts
				the team's healers (Energy for Everyone heals everyone, Energizing Cheer one random member, Charge Energy itself). No
				Helping Bonus. With the inventory limit on, ingredients are collected every 3 hours while awake and not while asleep. Ingredients from main skills (Ingredient Magnet,
				Ingredient Draw, Bulk Up) are counted as an expected average, with random ingredients split evenly; skills that
				copy other skills are not counted. Mythical Pokémon are not supported yet. The energy solver shares 5 slots like the slot solver (a Pokémon on the team part of the time uses part of a slot) and counts berries, strength
				skills (Charge Strength, Berry Burst, Extra Helpful, Helper Boost and similar, as estimated by pokesleep-tool) and the
				target dish only: ingredients the dish doesn't use, extra ingredients in the pot and Helping Bonus add nothing, and a
				meal without enough ingredients for the dish counts as 0.
			</footer>
		</div>
	);
}
