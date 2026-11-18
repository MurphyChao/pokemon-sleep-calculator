// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { defaultStrengthOptions, defaultYieldOptions } from "../core/yield";
import { useRankTables } from "./useRankTables";

afterEach(() => localStorage.clear());

test("default settings use the shipped tables (all categories), loaded separately", async () => {
	const { result } = renderHook(() => useRankTables(defaultYieldOptions, defaultStrengthOptions, ["ingredient:apple"]));
	await waitFor(() => expect(result.current).toBeDefined());
	expect(result.current?.tables.categories["ingredient:apple"].best).toBe("Skeledirge");
	expect(result.current?.tables.categories["strength:grass"]).toBeDefined();
	expect(result.current?.pending.size).toBe(0);
	expect(localStorage.getItem("pscalc-rank-tables")).toBeNull();
});

test("other settings build only the categories asked for, then keep them", async () => {
	const off = { ...defaultYieldOptions, inventoryLimit: false };
	const needed = ["ingredient:apple", "skill:Some skill only mythical Pokémon have"];
	const { result } = renderHook(() => useRankTables(off, defaultStrengthOptions, needed));
	// Categories without any species aren't waited for.
	expect([...(result.current?.pending ?? [])]).toEqual(["ingredient:apple"]);
	await waitFor(() => expect(result.current?.pending.size).toBe(0), { timeout: 60_000 });
	expect(Object.keys(result.current?.tables.categories ?? {})).toEqual(["ingredient:apple"]);
	expect(localStorage.getItem("pscalc-rank-tables")).toContain("ingredient:apple");
	// Next time (e.g. after switching back), it's there at once.
	const again = renderHook(() => useRankTables(off, defaultStrengthOptions, ["ingredient:apple"]));
	expect(again.result.current?.pending.size).toBe(0);
}, 60_000);
