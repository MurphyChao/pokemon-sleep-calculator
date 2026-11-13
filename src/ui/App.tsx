import { useMemo, useState } from "react";
import type { BoxEntry } from "../core/box";
import {
	dailyIngredientYieldDetail,
	defaultYieldOptions,
	emptyYieldDetail,
	type IngredientYield,
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
				map.set(e.id, dailyIngredientYieldDetail(e, options, energy));
			} catch {
				map.set(e.id, emptyYieldDetail);
			}
		}
		return map;
	}, [box, options.inventoryLimit, options.campTicket, JSON.stringify(energy.favorites), energy.fieldBonus]);
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
				<a href="https://github.com/SleepAPI/SleepAPI">SleepAPI</a> (Apache-2.0). Yields assume a 100 sleep score and no teammate
				bonuses. With the inventory limit on, ingredients are collected every 3 hours while awake and not while asleep. Ingredients from main skills (Ingredient Magnet,
				Ingredient Draw, Bulk Up) are counted as an expected average, with random ingredients split evenly; skills that
				copy other skills are not counted. Mythical Pokémon are not supported yet. The energy solver counts berries, strength
				skills (Charge Strength, Berry Burst, Extra Helpful, Helper Boost and similar, as estimated by pokesleep-tool) and the
				target dish only: ingredients the dish doesn't use, extra ingredients in the pot and Helping Bonus add nothing, and a
				meal without enough ingredients for the dish counts as 0.
			</footer>
		</div>
	);
}
