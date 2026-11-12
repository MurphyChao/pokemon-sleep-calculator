import { useMemo, useState } from "react";
import type { BoxEntry } from "../core/box";
import {
	dailyIngredientYieldDetail,
	defaultYieldOptions,
	type IngredientYield,
	type YieldDetail,
	type YieldOptions,
} from "../core/yield";
import BoxView from "./BoxView";
import type { TastySource } from "../core/tasty";
import SolverView from "./SolverView";
import { useStoredState } from "./storage";

type Tab = "box" | "solver";

export default function App() {
	const [tab, setTab] = useState<Tab>("box");
	const [box, setBox] = useStoredState<BoxEntry[]>("pscalc.box.v1", []);
	const [storedOptions, setOptions] = useStoredState<YieldOptions>("pscalc.yieldOptions", defaultYieldOptions);
	const options = { ...defaultYieldOptions, ...storedOptions };

	const details = useMemo(() => {
		const map = new Map<string, YieldDetail>();
		for (const e of box) {
			try {
				map.set(e.id, dailyIngredientYieldDetail(e, options));
			} catch {
				map.set(e.id, { help: {}, skill: {}, total: {} });
			}
		}
		return map;
	}, [box, options.inventoryLimit, options.campTicket]);
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
					<button type="button" className={tab === "solver" ? "active" : ""} onClick={() => setTab("solver")}>
						Solver
					</button>
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
					<SolverView box={box} yields={yields} tasty={tasty} campTicket={options.campTicket} />
				)}
			</main>
			<footer>
				Pokémon data and ingredient model from{" "}
				<a href="https://github.com/nitoyon/pokesleep-tool">nitoyon/pokesleep-tool</a> (MIT). Recipes from{" "}
				<a href="https://github.com/SleepAPI/SleepAPI">SleepAPI</a> (Apache-2.0). Yields assume a 100 sleep score and no teammate
				bonuses. With the inventory limit on, ingredients are collected every 3 hours while awake and not while asleep. Ingredients from main skills (Ingredient Magnet,
				Ingredient Draw, Bulk Up) are counted as an expected average, with random ingredients split evenly; skills that
				copy other skills are not counted. Mythical Pokémon are not supported yet.
			</footer>
		</div>
	);
}
