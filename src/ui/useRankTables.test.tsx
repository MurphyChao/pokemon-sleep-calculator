// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { defaultStrengthOptions, defaultYieldOptions } from "../core/yield";
import { useRankTables } from "./useRankTables";

afterEach(() => localStorage.clear());

test("default settings use the shipped tables right away", () => {
	const { result } = renderHook(() => useRankTables(defaultYieldOptions, defaultStrengthOptions));
	expect(result.current?.categories.strength).toBeDefined();
});

test("other settings build the tables in the browser, then keep them", async () => {
	const off = { ...defaultYieldOptions, inventoryLimit: false };
	const { result } = renderHook(() => useRankTables(off, defaultStrengthOptions));
	expect(result.current).toBeUndefined();
	await waitFor(() => expect(result.current).toBeDefined(), { timeout: 60_000 });
	expect(result.current?.note).toMatch(/built in the browser/);
	expect(localStorage.getItem("pscalc-rank-tables")).toContain("ingredient:apple");
	// Next time (e.g. after switching back), they're there at once.
	const again = renderHook(() => useRankTables(off, defaultStrengthOptions));
	expect(again.result.current).toBe(result.current);
}, 60_000);
