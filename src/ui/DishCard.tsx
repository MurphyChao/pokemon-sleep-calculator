import { dishStrength } from "../core/energy";
import { dailyDemand, mealsPerDay, potSizeNeeded, type Recipe, type RecipeType, recipes } from "../core/recipes";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";
import { type Key, recipeLabel, t } from "./i18n";
import { IngredientIcon } from "./IngredientIcons";
import { ingredientLabel } from "./names";
import { useStoredState } from "./storage";

const recipeTypes: { type: RecipeType; label: Key }[] = [
	{ type: "curry", label: "curry" },
	{ type: "salad", label: "salad" },
	{ type: "dessert", label: "dessert" },
];

/** A dish's base energy: recipe level 1, no field bonus, not Extra Tasty. */
const baseEnergy = (r: Recipe) => Math.round(dishStrength(r, 1, 0));

/** The recipes of a type, highest base energy first. */
function recipesOfType(type: RecipeType): Recipe[] {
	return recipes.filter((r) => r.type === type).sort((a, b) => baseEnergy(b) - baseEnergy(a));
}

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
	const typeRecipes = recipesOfType(recipeType);
	const recipe = typeRecipes.find((r) => r.id === recipeId) ?? typeRecipes[0];
	return { recipe, recipeType, setRecipeType, setRecipeId, potSize, setPotSize };
}

/** `potMultiplier`: the event bonus's pot size multiplier (1 without one). */
export default function DishCard(props: { dish: DishState; campTicket: boolean; potMultiplier: number }) {
	const { recipe, recipeType, setRecipeType, setRecipeId, potSize, setPotSize } = props.dish;
	const typeRecipes = recipesOfType(recipeType);
	return (
		<section className="card dish-card">
			<h2>{t("dish")}</h2>
			<div className="form-grid">
				<label>
					<span className="field-text">{t("dishType")}</span>
					<select
						value={recipeType}
						onChange={(e) => {
							const type = e.target.value as RecipeType;
							setRecipeType(type);
							setRecipeId(recipesOfType(type)[0]?.id ?? "");
						}}
					>
						{recipeTypes.map((x) => (
							<option key={x.type} value={x.type}>
								{t(x.label)}
							</option>
						))}
					</select>
				</label>
				<label>
					{/* Phones hide this label (the dropdown shows the recipe); the select keeps its name. */}
					<span className="field-text">{t("recipe")}</span>
					<select aria-label={t("recipe")} value={recipe.id} onChange={(e) => setRecipeId(e.target.value)}>
						{typeRecipes.map((r) => (
							<option key={r.id} value={r.id}>
								{t("recipeOption", {
									name: recipeLabel(r),
									energy: baseEnergy(r).toLocaleString("en-US"),
									pot: potSizeNeeded(r),
								})}
							</option>
						))}
					</select>
				</label>
				<label>
					{/* Phones label it just "Pot", beside the card's title (App.css). */}
					<span className="field-text">
						<span className="label-long">{t("yourPotSize")}</span>
						<span className="label-short">{t("potShort")}</span>
					</span>
					<input
						aria-label={t("yourPotSize")}
						type="number"
						min={0}
						value={potSize || ""}
						placeholder={t("optional")}
						onChange={(e) => setPotSize(Math.max(0, Number(e.target.value) || 0))}
					/>
				</label>
			</div>
			<RecipeSummary recipe={recipe} potSize={potSize} campTicket={props.campTicket} potMultiplier={props.potMultiplier} />
		</section>
	);
}

/** Pot capacity: doubled on Sunday, ×1.5 with a Good Camp Ticket (as in SleepAPI). */
function effectivePot(potSize: number, sunday: boolean, campTicket: boolean, multiplier: number): number {
	return Math.round(potSize * (sunday ? 2 : 1) * (campTicket ? 1.5 : 1) * multiplier);
}

function RecipeSummary(props: { recipe: Recipe; potSize: number; campTicket: boolean; potMultiplier: number }) {
	const { recipe, potSize, campTicket, potMultiplier } = props;
	const demand = dailyDemand(recipe);
	const needed = potSizeNeeded(recipe);
	const weekdayPot = effectivePot(potSize, false, campTicket, potMultiplier);
	const sundayPot = effectivePot(potSize, true, campTicket, potMultiplier);
	return (
		<div className="recipe-summary">
			<p>
				{t("recipeBonus", { n: recipe.bonus })} · {t("potNeeded")} <strong>{needed}</strong>
				{potSize > 0 && (
					<>
						{" "}
						· {t("yourPot")}
						{campTicket ? t("withCampTicket") : ""}: {t("monSat")}{" "}
						<span className={weekdayPot < needed ? "warn" : "ok"}>{weekdayPot}</span>, {t("sunday")}{" "}
						<span className={sundayPot < needed ? "warn" : "ok"}>{sundayPot}</span>
						{weekdayPot < needed && (
							<span className="warn">
								{" "}
								· {sundayPot >= needed ? t("tooSmallWeekday") : t("tooSmallEveryDay")}
							</span>
						)}
					</>
				)}
			</p>
			<table className="dish-ings">
				{/* Phones show the ingredients as "🎃 20 / 60" chips under this note instead of the header (App.css). */}
				<caption>
					{t("perMeal")} / {t("perDayMeals", { n: mealsPerDay })}
				</caption>
				<thead>
					<tr>
						<th>{t("colIngredient")}</th>
						<th>{t("perMeal")}</th>
						<th>{t("perDayMeals", { n: mealsPerDay })}</th>
					</tr>
				</thead>
				<tbody>
					{(Object.entries(recipe.ingredients) as [IngredientName, number][]).map(([ing, n]) => (
						<tr key={ing}>
							<td>
								<IngredientIcon name={ing} decorative /> <span className="ing-name">{ingredientLabel(ing)}</span>
							</td>
							<td>{n}</td>
							<td>{demand[ing]}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
