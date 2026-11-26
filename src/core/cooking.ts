/**
 * The cooking log: what was cooked at each meal of the week, and the week's numbers.
 *
 * The game's day starts at 04:00 and has three meal windows: breakfast 04:00–11:59, lunch 12:00–17:59 and
 * dinner 18:00–03:59 (dinner after midnight belongs to the day before). Weeks run Monday to Sunday, like the
 * game's weekly research. Extra Tasty chance and multipliers follow core/tasty.ts.
 */
import { bonusCap, sundayBaseChance, sundayMultiplier, weekdayBaseChance, weekdayMultiplier } from "./tasty";

export type Meal = 0 | 1 | 2;
export const meals: Meal[] = [0, 1, 2];

/** One meal of the log. Every field but the slot is optional: a pot screenshot may come before the result. */
export interface CookingRecord {
	/** The game day, "YYYY-MM-DD". */
	day: string;
	meal: Meal;
	/** Recipe id (src/data/recipes.json). */
	recipeId?: string;
	/** The dish's final energy, as shown after cooking (Extra Tasty and every bonus included). */
	energy?: number;
	extraTasty?: boolean;
	/** The Extra Tasty bonus built up before this meal, in percentage points (the pot screen's "!" label). */
	tastyBonus?: number;
	/** Fingerprints of the screenshots this record was filled from, to spot one uploaded twice. */
	shots?: string[];
}

/** The log, keyed by slotKey(day, meal). */
export type CookingLog = Record<string, CookingRecord>;

export const slotKey = (day: string, meal: Meal) => `${day}/${meal}`;

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of a date (its local calendar day). */
export function dayString(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight of a "YYYY-MM-DD" day. */
export function parseDay(day: string): Date {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
	const d = parseDay(day);
	d.setDate(d.getDate() + n);
	return dayString(d);
}

/** The meal (and its game day) a local time "YYYY-MM-DDTHH:MM[:SS]" falls in. */
export function mealSlot(time: string): { day: string; meal: Meal } {
	const day = time.slice(0, 10);
	const hour = Number(time.slice(11, 13));
	if (hour < 4) return { day: addDays(day, -1), meal: 2 };
	if (hour < 12) return { day, meal: 0 };
	if (hour < 18) return { day, meal: 1 };
	return { day, meal: 2 };
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
	return (parseDay(day).getDay() + 6) % 7;
}

export const isSunday = (day: string) => weekdayIndex(day) === 6;

/** The Monday of the week a day is in. */
export function weekStart(day: string): string {
	return addDays(day, -weekdayIndex(day));
}

/** The seven days of the week starting on `monday`. */
export function weekDays(monday: string): string[] {
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const baseTastyChance = (day: string) => (isSunday(day) ? sundayBaseChance : weekdayBaseChance);
export const tastyMultiplier = (day: string) => (isSunday(day) ? sundayMultiplier : weekdayMultiplier);

/** Extra Tasty chance of a meal in percent: the day's base chance plus the bonus built up (when known). */
export function tastyChance(record: Pick<CookingRecord, "day" | "tastyBonus">): number {
	return Math.min(100, baseTastyChance(record.day) + Math.min(bonusCap, record.tastyBonus ?? 0));
}

/** A dish counts as cooked once its recipe or energy is known (a pot screenshot alone doesn't). */
export const isCooked = (r: CookingRecord) => r.recipeId !== undefined || r.energy !== undefined;

export interface WeekStats {
	/** Meals with a dish logged. */
	cooked: number;
	totalEnergy: number;
	extraTasty: number;
	/** Expected Extra Tasty dishes for the meals logged, from each one's chance. */
	expectedExtraTasty: number;
	/** Meals whose chance includes a bonus read from a pot screenshot. */
	withBonus: number;
	/** Energy per day, Monday first. */
	dayEnergy: number[];
	best?: CookingRecord;
}

export function weekStats(log: CookingLog, monday: string): WeekStats {
	const days = weekDays(monday);
	const stats: WeekStats = { cooked: 0, totalEnergy: 0, extraTasty: 0, expectedExtraTasty: 0, withBonus: 0, dayEnergy: days.map(() => 0) };
	days.forEach((day, i) => {
		for (const meal of meals) {
			const r = log[slotKey(day, meal)];
			if (!r || !isCooked(r)) continue;
			stats.cooked++;
			stats.totalEnergy += r.energy ?? 0;
			stats.dayEnergy[i] += r.energy ?? 0;
			if (r.extraTasty) stats.extraTasty++;
			stats.expectedExtraTasty += tastyChance(r) / 100;
			if (r.tastyBonus !== undefined) stats.withBonus++;
			if (r.energy !== undefined && (!stats.best || r.energy > (stats.best.energy ?? 0))) stats.best = r;
		}
	});
	return stats;
}

/**
 * Puts a reading into the log: fields it has replace the slot's, fields it lacks are kept (so a pot
 * screenshot and a result screenshot of the same meal end up in one record).
 */
export function mergeRecord(log: CookingLog, update: CookingRecord): CookingLog {
	const key = slotKey(update.day, update.meal);
	const old = log[key];
	const merged: CookingRecord = { ...old, day: update.day, meal: update.meal };
	for (const k of ["recipeId", "energy", "extraTasty", "tastyBonus"] as const) {
		if (update[k] !== undefined) (merged as unknown as Record<string, unknown>)[k] = update[k];
	}
	const shots = [...new Set([...(old?.shots ?? []), ...(update.shots ?? [])])];
	if (shots.length) merged.shots = shots;
	return { ...log, [key]: merged };
}

/** The record holding a screenshot with this fingerprint, if it was logged before. */
export function findShot(log: CookingLog, fingerprint: string): CookingRecord | undefined {
	return Object.values(log).find((r) => r.shots?.includes(fingerprint));
}
