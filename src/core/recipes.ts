import recipeData from "../data/recipes.json";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";

export type RecipeType = "curry" | "salad" | "dessert";

export interface Recipe {
	id: string;
	name: string;
	type: RecipeType;
	/** Recipe bonus in percent. */
	bonus: number;
	ingredients: Partial<Record<IngredientName, number>>;
}

export const recipes: Recipe[] = recipeData as Recipe[];

export const mealsPerDay = 3;

/** Ingredients needed per day to cook this recipe at every meal. */
export function dailyDemand(recipe: Recipe, meals = mealsPerDay): Partial<Record<IngredientName, number>> {
	const out: Partial<Record<IngredientName, number>> = {};
	for (const [name, amount] of Object.entries(recipe.ingredients) as [IngredientName, number][]) {
		out[name] = amount * meals;
	}
	return out;
}

export function potSizeNeeded(recipe: Recipe): number {
	return Object.values(recipe.ingredients).reduce((a, b) => a + (b ?? 0), 0);
}
