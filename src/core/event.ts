/**
 * Event bonuses (e.g. "skill trigger ×1.25 and dream shard skills ×1.5 this week"): which one applies, as
 * chosen in the settings. pokesleep-tool's yield model applies an event's effects to helps and skills (see
 * {@link eventParameter}); dish strength and pot size, which this app works out itself, use
 * {@link eventDishMultiplier} and {@link eventPotMultiplier}.
 */
import events, { type BonusEffects, type BonusEventData, fillBonusEffects, type TargetPokemon } from "../vendor/pokesleep-tool/data/events";
import type { StrengthParameter } from "../vendor/pokesleep-tool/util/StrengthParameter";

/** "base": no event; "default": the event running now (from the game data), if any; "custom": the user's own. */
export type EventChoice = "base" | "default" | "custom";

/** A custom event: which Pokémon it applies to (all if empty) and its effects (missing ones have no effect). */
export interface CustomEvent {
	target: Partial<TargetPokemon>;
	effects: Partial<BonusEffects>;
}

export const emptyCustomEvent: CustomEvent = { target: {}, effects: {} };

/** The event options as saved with the yield options. */
export interface EventOptions {
	eventBonus?: EventChoice;
	customEvent?: CustomEvent;
}

/** The event running at `now`, from the game data. */
export function currentEvent(now: Date = new Date()): BonusEventData | undefined {
	return events.bonus.find((e) => e.start <= now && now < e.end);
}

/** The event that applies with these options: its name, target and effects; undefined for none. */
export function activeEvent(
	options: EventOptions,
	now: Date = new Date(),
): { name: string; target: Partial<TargetPokemon>; effects: BonusEffects; end?: Date } | undefined {
	const choice = options.eventBonus ?? "default";
	if (choice === "base") return undefined;
	if (choice === "custom") {
		const custom = options.customEvent ?? emptyCustomEvent;
		return { name: "custom", target: custom.target, effects: fillBonusEffects(custom.effects) };
	}
	const event = currentEvent(now);
	return event && { name: event.name, target: event.target, effects: event.effects, end: event.end };
}

/** The yield model's event parameters for these options. */
export function eventParameter(options: EventOptions, now: Date = new Date()): Partial<StrengthParameter> {
	const event = activeEvent(options, now);
	if (!event) return { event: "none" };
	if (event.name !== "custom") return { event: event.name };
	return {
		event: "custom",
		customEventBonus: { target: event.target, effects: { ...event.effects, fixedAreas: [], fixedBerries: [] } },
	};
}

/** Identifies the event that applies (for caches keyed by settings): none, a game event, or custom effects. */
export function eventKey(options: EventOptions, now: Date = new Date()): string {
	const event = activeEvent(options, now);
	if (!event) return "none";
	return event.name === "custom" ? JSON.stringify([event.target, event.effects]) : event.name;
}

/** Dish strength multiplier of the event that applies. */
export function eventDishMultiplier(options: EventOptions, now: Date = new Date()): number {
	return activeEvent(options, now)?.effects.dish ?? 1;
}

/** Pot size multiplier of the event that applies. */
export function eventPotMultiplier(options: EventOptions, now: Date = new Date()): number {
	return activeEvent(options, now)?.effects.potSize ?? 1;
}
