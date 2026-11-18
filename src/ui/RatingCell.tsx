import type { Rating, RatingRole } from "../core/rating";
import { type Key, natureLabel, subSkillLabel, t } from "./i18n";

const roleLabels: Record<RatingRole, Key> = {
	strength: "roleStrength",
	ingredients: "roleIngredients",
	hybrid: "roleHybrid",
	support: "roleSupport",
};

/** Grade and score, e.g. "A 82", with what the rating measures and the best build in the tooltip. */
export default function RatingCell(props: { rating: Rating | null | undefined }) {
	const { rating } = props;
	if (rating === undefined) return <span className="muted">{t("ratingPending")}</span>;
	if (rating === null) return <span className="muted">–</span>;
	const best = [natureLabel(rating.best.nature), ...rating.best.subSkills.map(subSkillLabel)].join(" · ");
	const score = Math.floor(rating.score);
	return (
		<div
			className={`rating rating-${rating.grade.toLowerCase()}`}
			title={t("ratingTooltip", { role: t(roleLabels[rating.role]), score, best })}
		>
			<strong>{rating.grade}</strong> {score}
			<div className="muted small">{t(roleLabels[rating.role])}</div>
		</div>
	);
}
