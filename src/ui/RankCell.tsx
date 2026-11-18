import type { Rank } from "../core/rank";
import { getLang, skillLabel, t } from "./i18n";
import { topLabel } from "./RatingCell";

const format = (v: number) =>
	new Intl.NumberFormat(getLang(), { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v);

/** What a rank category is called, e.g. "Strength" or "Skill: Energy for Everyone S". */
export function rankCategoryLabel(category: string): string {
	if (category === "strength") return t("rankStrength");
	if (category === "ingredients") return t("rankIngredients");
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
			: rank.category === "ingredients"
				? t("rankUnitIngredients")
				: t("rankUnitSkill");
	return (
		<div
			className={`rating rank rating-${rank.grade.toLowerCase()}`}
			title={t("rankTooltip", {
				value: format(rank.value),
				unit,
				median: format(rank.median),
				species: rank.species,
			})}
		>
			<strong>{rank.grade}</strong> {topLabel(rank.better)}
			<div className="muted small">{rankCategoryLabel(rank.category)}</div>
		</div>
	);
}
