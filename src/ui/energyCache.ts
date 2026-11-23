import type { EnergyAnalysis, SwapResult } from "../core/energyTab";

/**
 * Recent energy solver results, by {@link energyTabKey}: worked out ahead by the web workers (useEnergyWarmup)
 * or by the page when the tab is opened, so revisiting the tab, or going back to a dish or setting used a moment
 * ago, shows them at once. Kept for this visit only (they're quick to redo and can be large).
 */
interface Entry {
	analysis: EnergyAnalysis;
	/** The swap card's default pair, once worked out. */
	swap?: SwapResult;
}

const maxEntries = 12;
const entries = new Map<string, Entry>();

export function cachedEnergy(key: string): Entry | undefined {
	const entry = entries.get(key);
	if (entry) {
		// Most recently used last.
		entries.delete(key);
		entries.set(key, entry);
	}
	return entry;
}

export function cacheEnergy(key: string, entry: Entry) {
	entries.delete(key);
	entries.set(key, entry);
	while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
}

/** Adds the swap card's default result to a cached entry. */
export function cacheEnergySwap(key: string, swap: SwapResult) {
	const entry = entries.get(key);
	if (entry) entry.swap = swap;
}

export function clearEnergyCache() {
	entries.clear();
}
