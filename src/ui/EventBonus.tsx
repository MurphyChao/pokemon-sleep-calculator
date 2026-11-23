import { useState } from "react";
import { createPortal } from "react-dom";
import { activeEvent, currentEvent, type CustomEvent, emptyCustomEvent, type EventChoice } from "../core/event";
import type { YieldOptions } from "../core/yield";
import type { BonusEffects } from "../vendor/pokesleep-tool/data/events";
import { type PokemonSpecialty, type PokemonType, PokemonTypes } from "../vendor/pokesleep-tool/data/pokemons";
import { getLang, ingredientLabel, type Key, t, typeLabel } from "./i18n";
import { TypeIcon } from "./TypeIcon";

const choices: { choice: EventChoice; label: Key }[] = [
	{ choice: "base", label: "eventBase" },
	{ choice: "default", label: "eventDefault" },
	{ choice: "custom", label: "eventCustom" },
];

const specialtyLabels: Record<string, Key> = {
	Berries: "specialtyBerries",
	Ingredients: "specialtyIngredients",
	Skills: "specialtySkills",
};

/** Effects shown and editable, with the values the game's events use; the first is "no effect". */
const editable: { key: keyof BonusEffects; label: Key; values: number[]; add?: boolean }[] = [
	{ key: "skillTrigger", label: "effSkillTrigger", values: [1, 1.25, 1.5] },
	{ key: "skillLevel", label: "effSkillLevel", values: [0, 1, 2, 3, 5], add: true },
	{ key: "berry", label: "effBerry", values: [0, 1], add: true },
	{ key: "ingredient", label: "effIngredient", values: [0, 1, 1.5], add: true },
	{ key: "dreamShard", label: "effDreamShard", values: [1, 1.5, 2] },
	{ key: "ingredientMagnet", label: "effIngredientMagnet", values: [1, 1.5] },
	{ key: "ingredientDraw", label: "effIngredientDraw", values: [1, 1.5] },
	{ key: "skillIngredient", label: "effSkillIngredient", values: [1, 1.25] },
	{ key: "berryBurst", label: "effBerryBurst", values: [1, 1.4] },
	{ key: "dish", label: "effDish", values: [1, 1.1, 1.25, 1.5] },
	{ key: "potSize", label: "effPotSize", values: [1, 1.6, 2] },
];

const amount = (n: number, add?: boolean) => (add ? `+${n}` : `×${n}`);

/** The event's effects in words, e.g. "skill rate ×1.25 · dream shard skills ×1.5 · for Skills specialists". */
export function describeEvent(target: CustomEvent["target"], effects: BonusEffects): string {
	const parts = editable
		.filter(({ key, values }) => effects[key] !== values[0])
		.map(({ key, label, add }) => `${t(label)} ${amount(effects[key] as number, add)}`);
	if (effects.extraIng) parts.push(t("effExtraIng", { ing: ingredientLabel(effects.extraIng) }));
	if (effects.carryLimitAdd > 0) parts.push(`${t("effCarryLimit")} +${effects.carryLimitAdd}`);
	if (effects.carryLimitMul !== 1) parts.push(`${t("effCarryLimit")} ×${effects.carryLimitMul}`);
	if (effects.globalCarryLimitAdd > 0) parts.push(`${t("effCarryLimit")} +${effects.globalCarryLimitAdd}`);
	if (parts.length === 0) parts.push(t("effNone"));
	const who = [
		target.specialty && t("eventForSpecialty", { specialty: t(specialtyLabels[target.specialty] ?? "specialtySkills") }),
		target.type?.length && t("eventForType", { type: target.type.map(typeLabel).join(", ") }),
	].filter(Boolean);
	return [...parts, ...who].join(" · ");
}

/**
 * The event bonus setting: no event ("Base"), the one running now ("Default", from the game data), or the
 * user's own ("Custom", edited in a pop-up). Shows what the chosen one does.
 */
export function EventBonusSetting(props: { options: YieldOptions; setOptions: (options: YieldOptions) => void }) {
	const { options, setOptions } = props;
	const [editing, setEditing] = useState(false);
	const choice = options.eventBonus ?? "default";
	const event = activeEvent(options);
	const until = event?.end && new Intl.DateTimeFormat(getLang(), { month: "short", day: "numeric" }).format(event.end);
	const summary =
		choice === "base"
			? t("eventSummaryBase")
			: !event
				? t("eventSummaryNone")
				: `${describeEvent(event.target, event.effects)}${until ? ` · ${t("eventUntil", { date: until })}` : ""}`;
	const pick = (next: EventChoice) => {
		if (next === "custom") {
			// A first custom event starts from the one running now, if any.
			const now = currentEvent();
			const customEvent =
				options.customEvent ?? (now ? { target: now.target, effects: { ...now.effects } } : emptyCustomEvent);
			setOptions({ ...options, eventBonus: "custom", customEvent });
			setEditing(true);
		} else {
			setOptions({ ...options, eventBonus: next });
		}
	};
	return (
		<div className="check event-bonus" role="group" aria-labelledby="event-bonus-label">
			<span id="event-bonus-label">{t("eventBonus")}</span>
			<div className="key-levels">
				{choices.map((c) => (
					<button
						type="button"
						key={c.choice}
						className={choice === c.choice ? "" : "secondary"}
						aria-pressed={choice === c.choice}
						onClick={() => pick(c.choice)}
					>
						{t(c.label)}
					</button>
				))}
			</div>
			<span className="event-summary">{summary}</span>
			{/* On the page itself, not inside the settings panel (whose phone styles would apply). */}
			{editing &&
				createPortal(
					<CustomEventDialog
						event={options.customEvent ?? emptyCustomEvent}
						onChange={(customEvent) => setOptions({ ...options, eventBonus: "custom", customEvent })}
						onClose={() => setEditing(false)}
					/>,
					document.body,
				)}
		</div>
	);
}

/** The pop-up for a custom event: which Pokémon it applies to and its effects, saved as they're changed. */
function CustomEventDialog(props: { event: CustomEvent; onChange: (event: CustomEvent) => void; onClose: () => void }) {
	const { event, onChange, onClose } = props;
	const effects = (key: keyof BonusEffects, fallback: number) => (event.effects[key] as number | undefined) ?? fallback;
	const setEffect = (key: keyof BonusEffects, value: number) => onChange({ ...event, effects: { ...event.effects, [key]: value } });
	const types = event.target.type ?? [];
	const setTarget = (target: CustomEvent["target"]) => {
		const next = { ...target };
		if (!next.specialty) delete next.specialty;
		if (!next.type?.length) delete next.type;
		onChange({ ...event, target: next });
	};
	return (
		<div
			className="modal-backdrop"
			onClick={(ev) => {
				if (ev.target === ev.currentTarget) onClose();
			}}
		>
			<div className="modal event-dialog" role="dialog" aria-modal="true" aria-label={t("customEventTitle")}>
				<section className="card">
					<h2>{t("customEventTitle")}</h2>
					<div className="event-fields">
						<label>
							{t("eventAppliesTo")}
							<select
								value={event.target.specialty ?? ""}
								onChange={(e) => setTarget({ ...event.target, specialty: (e.target.value || undefined) as PokemonSpecialty | undefined })}
							>
								<option value="">{t("eventAllPokemon")}</option>
								{Object.entries(specialtyLabels).map(([specialty, label]) => (
									<option key={specialty} value={specialty}>
										{t(label)}
									</option>
								))}
							</select>
						</label>
						{editable.map(({ key, label, values, add }) => (
							<label key={key}>
								<span className="event-field-name">{t(label)}</span>
								<select value={effects(key, values[0])} onChange={(e) => setEffect(key, Number(e.target.value))}>
									{values.map((v) => (
										<option key={v} value={v}>
											{amount(v, add)}
										</option>
									))}
								</select>
							</label>
						))}
						<label>
							<span className="event-field-name">{t("effCarryLimit")}</span>
							<input
								type="number"
								min={0}
								max={100}
								value={effects("carryLimitAdd", 0)}
								onChange={(e) => setEffect("carryLimitAdd", Math.max(0, Math.round(Number(e.target.value) || 0)))}
							/>
						</label>
					</div>
					<div className="event-types" role="group" aria-label={t("eventTypes")}>
						<span className="field-label">{t("eventTypes")}</span>
						<button
							type="button"
							className={types.length === 0 ? "filter-all" : "filter-all secondary"}
							aria-pressed={types.length === 0}
							onClick={() => setTarget({ ...event.target, type: [] })}
						>
							{t("filterAll")}
						</button>
						{PokemonTypes.map((type: PokemonType) => {
							const on = types.includes(type);
							return (
								<button
									type="button"
									key={type}
									className={`filter-choice${on ? " selected" : types.length === 0 ? "" : " dim"}`}
									aria-pressed={on}
									aria-label={typeLabel(type)}
									title={typeLabel(type)}
									onClick={() =>
										setTarget({ ...event.target, type: on ? types.filter((x) => x !== type) : [...types, type] })
									}
								>
									<TypeIcon type={type} decorative />
								</button>
							);
						})}
					</div>
					<p className="muted small">{describeEvent(event.target, fillEffects(event.effects))}</p>
					<div className="actions">
						<button type="button" onClick={onClose}>
							{t("close")}
						</button>
					</div>
				</section>
			</div>
		</div>
	);
}

/** A custom event's effects with the unset ones filled in (no effect). */
function fillEffects(effects: Partial<BonusEffects>): BonusEffects {
	return activeEvent({ eventBonus: "custom", customEvent: { target: {}, effects } })?.effects as BonusEffects;
}
