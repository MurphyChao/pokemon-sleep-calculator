import { type Rating, type RatingRole, rollSampleSize } from "../core/rating";
import { getLang, type Key, natureLabel, subSkillLabel, t } from "./i18n";

const roleLabels: Record<RatingRole, Key> = {
	strength: "roleStrength",
	ingredients: "roleIngredients",
	hybrid: "roleHybrid",
	support: "roleSupport",
};

/** A share (0–1) as a percentage with enough digits for small values: 0.0004 → "0.04%", 0.12 → "12%". */
function percent(share: number): string {
	const pct = share * 100;
	const digits = pct < 0.1 ? 2 : pct < 1 ? 1 : 0;
	return `${new Intl.NumberFormat(getLang(), { maximumFractionDigits: digits }).format(pct)}%`;
}

/** "Top 3%"; better than every sampled roll: "Top <0.05%". */
export function topLabel(better: number): string {
	return t("ratingTop", { pct: better > 0 ? percent(better) : `<${percent(1 / rollSampleSize)}` });
}

/** The chance that a new random roll would be better, e.g. "1 in 40 rolls is better". */
export function oddsLabel(better: number): string {
	const count = (n: number) => new Intl.NumberFormat(getLang()).format(n);
	if (better <= 0) return t("ratingOddsNone", { n: count(rollSampleSize) });
	if (better < 0.5) return t("ratingOdds", { n: count(Math.round(1 / better)) });
	return t("ratingOddsShare", { pct: percent(better) });
}

/**
 * Grade and rank among random rolls of the same Pokémon, e.g. "A Top 12%", with the odds of a better roll
 * and what the rating measures; the share of the best build and the best build itself are in the tooltip.
 */
export default function RatingCell(props: { rating: Rating | null | undefined }) {
	const { rating } = props;
	if (rating === undefined) return <span className="muted">{t("ratingPending")}</span>;
	if (rating === null) return <span className="muted">–</span>;
	const role = t(roleLabels[rating.role]);
	const odds = oddsLabel(rating.better);
	const best = [natureLabel(rating.best.nature), ...rating.best.subSkills.map(subSkillLabel)].join(" · ");
	return (
		<div
			className={`rating rating-${rating.grade.toLowerCase()}`}
			title={t("ratingTooltip", {
				role,
				odds,
				n: new Intl.NumberFormat(getLang()).format(rollSampleSize),
				ofBest: Math.floor(rating.ofBest),
				best,
				benchmark: t(rating.skillMaxed ? "ratingBenchmarkMax" : "ratingBenchmarkOwn", { n: rating.skillLevel }),
			})}
		>
			<strong>{rating.grade}</strong> {topLabel(rating.better)}
			<div className="small">{odds}</div>
			<div className="muted small">{role}</div>
		</div>
	);
}
