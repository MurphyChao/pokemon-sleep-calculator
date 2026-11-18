// @vitest-environment jsdom
import type { RgbaImage } from "../ocr/image";
import { iconSize } from "../ocr/pokemonIcon";
import { learnedIconsKey, learnIcon, readLearnedIcons } from "./learnedIcons";

const solid = (v: number): RgbaImage => {
	const data = new Uint8ClampedArray(iconSize * iconSize * 4).fill(v);
	for (let i = 3; i < data.length; i += 4) data[i] = 255;
	return { width: iconSize, height: iconSize, data };
};

afterEach(() => localStorage.clear());

test("learned icons round-trip through localStorage", () => {
	expect(readLearnedIcons()).toEqual([]);
	expect(learnIcon("Shinx", solid(100))).toBe(true);
	const [ref] = readLearnedIcons();
	expect(ref.pokemonName).toBe("Shinx");
	expect([...ref.icon.data]).toEqual([...solid(100).data]);
	expect(localStorage.getItem(learnedIconsKey)).toContain("Shinx");
});

test("a look-alike of an icon already learned isn't added again; at most 5 per Pokémon", () => {
	expect(learnIcon("Shinx", solid(100))).toBe(true);
	expect(learnIcon("Shinx", solid(101))).toBe(false);
	for (const v of [20, 60, 140, 180]) expect(learnIcon("Shinx", solid(v))).toBe(true);
	expect(learnIcon("Shinx", solid(240))).toBe(false); // sixth
	expect(learnIcon("Trapinch", solid(101))).toBe(true); // other Pokémon are separate
	expect(readLearnedIcons()).toHaveLength(6);
});

test("wrong-sized icons and broken storage are ignored", () => {
	expect(learnIcon("Shinx", { width: 2, height: 2, data: new Uint8ClampedArray(16) })).toBe(false);
	localStorage.setItem(learnedIconsKey, "not json");
	expect(readLearnedIcons()).toEqual([]);
});
