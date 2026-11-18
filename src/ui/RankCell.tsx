import type { Rank } from "../core/rank";
import { getLang, ingredientLabel, skillLabel, t } from "./i18n";
import { topLabel } from "./RatingCell";
import { IngredientIcon } from "./IngredientIcons";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";

const format = (v: number) =>
	new Intl.NumberFormat(getLang(), { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v);

/** What a rank category is called, e.g. "Strength", "Ingredients: Fancy Apple" or "Skill: Energy for Everyone S". */
export function rankCategoryLabel(category: string): string {
	if (category === "strength") return t("rankStrength");
	if (category.startsWith("ingredient:")) {
		return t("rankIngredient", { ing: ingredientLabel(category.slice("ingredient:".length)) });
	}
	return t("rankSkill", { skill: skillLabel(category.replace(/^skill:/, "")) });
}

/**
 * Grade and rank against random rolls of every fully evolved Pokémon in the same category, e.g.
 * "S Top 2% · Strength", with the daily value and the population's median in the tooltip.
 */
export default function RankCell(props: { rank: Rank | undefined }) {
	const { rank } = props;
	if (!rank) return <span className="muted">–</span>;
	const unit =
		rank.category === "strength"
			? t("rankUnitStrength")
			: rank.category.startsWith("ingredient:")
				? ingredientLabel(rank.category.slice("ingredient:".length))
				: t("rankUnitSkill");
	const extra =
		rank.ingredientStrength !== undefined
			? `\n${t("rankIngredientStrength", { n: format(rank.ingredientStrength) })}`
			: "";
	return (
		<div
			className={`rating rank rating-${rank.grade.toLowerCase()}`}
			title={`${t("rankTooltip", {
				value: format(rank.value),
				unit,
				median: format(rank.median),
				species: rank.species,
			})}${extra}`}
		>
			<strong>{rank.grade}</strong> {topLabel(rank.better)}
			<div className="muted small">
				{/* Phones show the ingredient's icon instead of "Ingredients: <name>" (App.css). */}
				{rank.category.startsWith("ingredient:") && (
					<IngredientIcon
						name={rank.category.slice("ingredient:".length) as IngredientName}
						className="rank-ing-icon"
						decorative
					/>
				)}
				<span className="rank-category">{rankCategoryLabel(rank.category)}</span>
			</div>
		</div>
	);
}
