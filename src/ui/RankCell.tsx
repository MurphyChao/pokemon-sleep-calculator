import type { Rank } from "../core/rank";
import { getLang, ingredientLabel, pokemonLabel, skillLabel, t, typeLabel } from "./i18n";
import { topLabel } from "./RatingCell";
import { IngredientIcon } from "./IngredientIcons";
import type { IngredientName } from "../vendor/pokesleep-tool/data/pokemons";

const format = (v: number) =>
	new Intl.NumberFormat(getLang(), { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v);

/** What a rank category is called, e.g. "Strength: Grass", "Ingredients: Fancy Apple" or "Skill: Energy for Everyone S". */
export function rankCategoryLabel(category: string): string {
	if (category.startsWith("strength:")) return t("rankStrength", { type: typeLabel(category.slice("strength:".length)) });
	if (category.startsWith("ingredient:")) {
		return t("rankIngredient", { ing: ingredientLabel(category.slice("ingredient:".length)) });
	}
	return t("rankSkill", { skill: skillLabel(category.replace(/^skill:/, "")) });
}

/**
 * Grade and rank against random rolls of the best species in the same category, e.g. "S Top 2% · Strength:
 * Grass", with the daily value, the species and its rolls' median in the tooltip. Undefined: the
 * population is still being built ("Rank…"); null: can't be ranked.
 */
export default function RankCell(props: { rank: Rank | null | undefined }) {
	const { rank } = props;
	if (rank === undefined) return <span className="muted">{t("rankPending")}</span>;
	if (rank === null) return <span className="muted">–</span>;
	const unit =
		rank.category.startsWith("strength:")
			? t("rankUnitStrength")
			: rank.category.startsWith("ingredient:")
				? ingredientLabel(rank.category.slice("ingredient:".length))
				: t("rankUnitSkill");
	const credit = rank.skillCredit;
	const extra =
		(credit
			? `\n${t("rankSkillCredit", {
					skill: skillLabel(credit.skill),
					n: format(credit.amount),
					ing: unit,
					share: `${Math.round(credit.share * 100)}%`,
					best: pokemonLabel(credit.best),
					gatherer: pokemonLabel(rank.best),
				})}`
			: "") +
		(rank.ingredientStrength !== undefined
			? `\n${t("rankIngredientStrength", { n: format(rank.ingredientStrength) })}`
			: "");
	return (
		<div
			className={`rating rank rating-${rank.grade.toLowerCase()}`}
			title={`${t("rankTooltip", {
				value: format(rank.value),
				unit,
				median: format(rank.median),
				best: pokemonLabel(rank.best),
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
