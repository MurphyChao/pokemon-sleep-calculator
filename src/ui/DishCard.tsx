import { dailyDemand, mealsPerDay, potSizeNeeded, type Recipe, type RecipeType, recipes } from "../core/recipes";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { ingredientLabel } from "./names";
import { useStoredState } from "./storage";

const recipeTypes: { type: RecipeType; label: string }[] = [
	{ type: "curry", label: "Curry & Stew" },
	{ type: "salad", label: "Salad" },
	{ type: "dessert", label: "Dessert & Drink" },
];

export interface DishState {
	recipe: Recipe;
	recipeType: RecipeType;
	setRecipeType: (t: RecipeType) => void;
	setRecipeId: (id: string) => void;
	potSize: number;
	setPotSize: (n: number) => void;
}

/** The dish both solvers target, shared and remembered across tabs. */
export function useDish(): DishState {
	const [recipeType, setRecipeType] = useStoredState<RecipeType>("pscalc.recipeType", "salad");
	const [recipeId, setRecipeId] = useStoredState("pscalc.recipe", "scald_chunky_salad");
	const [potSize, setPotSize] = useStoredState("pscalc.potSize", 0);
	const typeRecipes = recipes.filter((r) => r.type === recipeType);
	const recipe = typeRecipes.find((r) => r.id === recipeId) ?? typeRecipes[0];
	return { recipe, recipeType, setRecipeType, setRecipeId, potSize, setPotSize };
}

export default function DishCard(props: { dish: DishState; campTicket: boolean }) {
	const { recipe, recipeType, setRecipeType, setRecipeId, potSize, setPotSize } = props.dish;
	const typeRecipes = recipes.filter((r) => r.type === recipeType);
	return (
		<section className="card">
			<h2>Dish</h2>
			<div className="form-grid">
				<label>
					Type
					<select
						value={recipeType}
						onChange={(e) => {
							const type = e.target.value as RecipeType;
							setRecipeType(type);
							setRecipeId(recipes.find((r) => r.type === type)?.id ?? "");
						}}
					>
						{recipeTypes.map((t) => (
							<option key={t.type} value={t.type}>
								{t.label}
							</option>
						))}
					</select>
				</label>
				<label>
					Recipe
					<select value={recipe.id} onChange={(e) => setRecipeId(e.target.value)}>
						{typeRecipes.map((r) => (
							<option key={r.id} value={r.id}>
								{r.name} ({potSizeNeeded(r)})
							</option>
						))}
					</select>
				</label>
				<label>
					Your pot size
					<input
						type="number"
						min={0}
						value={potSize || ""}
						placeholder="optional"
						onChange={(e) => setPotSize(Math.max(0, Number(e.target.value) || 0))}
					/>
				</label>
			</div>
			<RecipeSummary recipe={recipe} potSize={potSize} campTicket={props.campTicket} />
		</section>
	);
}

/** Pot capacity: doubled on Sunday, ×1.5 with a Good Camp Ticket (as in SleepAPI). */
function effectivePot(potSize: number, sunday: boolean, campTicket: boolean): number {
	return Math.round(potSize * (sunday ? 2 : 1) * (campTicket ? 1.5 : 1));
}

function RecipeSummary(props: { recipe: Recipe; potSize: number; campTicket: boolean }) {
	const { recipe, potSize, campTicket } = props;
	const demand = dailyDemand(recipe);
	const needed = potSizeNeeded(recipe);
	const weekdayPot = effectivePot(potSize, false, campTicket);
	const sundayPot = effectivePot(potSize, true, campTicket);
	return (
		<div className="recipe-summary">
			<p>
				Recipe bonus {recipe.bonus}% · Pot size needed: <strong>{needed}</strong>
				{potSize > 0 && (
					<>
						{" "}
						· Your pot{campTicket ? " (with Camp Ticket)" : ""}: Mon–Sat{" "}
						<span className={weekdayPot < needed ? "warn" : "ok"}>{weekdayPot}</span>, Sunday{" "}
						<span className={sundayPot < needed ? "warn" : "ok"}>{sundayPot}</span>
						{weekdayPot < needed && (
							<span className="warn">
								{" "}
								· too small {sundayPot >= needed ? "on Mon–Sat (fits on Sunday)" : "every day"}
							</span>
						)}
					</>
				)}
			</p>
			<table>
				<thead>
					<tr>
						<th>Ingredient</th>
						<th>Per meal</th>
						<th>Per day ({mealsPerDay} meals)</th>
					</tr>
				</thead>
				<tbody>
					{(Object.entries(recipe.ingredients) as [IngredientName, number][]).map(([ing, n]) => (
						<tr key={ing}>
							<td>{ingredientLabel(ing)}</td>
							<td>{n}</td>
							<td>{demand[ing]}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
