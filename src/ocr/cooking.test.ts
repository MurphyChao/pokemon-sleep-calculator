import { describe, expect, it } from "vitest";
import { agreedValue, energyRange, labelDigitCount, matchRecipe, parseEnergy } from "./cooking";

describe("matchRecipe", () => {
	it("matches recipe names in any language, OCR spacing and look-alikes included", () => {
		expect(matchRecipe("重 踏 酷 梨 醬 脆 片")).toBe("bulldoze_guacamole_and_chips");
		expect(matchRecipe("採 蜜 巧克力 格子 鬆 餅")).toBe("honey_gather_chocolate_waffles");
		expect(matchRecipe("Fancy Apple Curry")).toBe("fancy_apple_curry");
	});
	it("matches nothing for unrelated text", () => {
		expect(matchRecipe("回主畫面")).toBeUndefined();
	});
});

describe("parseEnergy", () => {
	it("reads numbers with or without separators", () => {
		expect(parseEnergy("211,909")).toBe(211909);
		expect(parseEnergy("140.142")).toBe(140142);
		expect(parseEnergy("1 234")).toBe(1234);
	});
	it("rejects implausible readings", () => {
		expect(parseEnergy("")).toBeUndefined();
		expect(parseEnergy("12")).toBeUndefined();
		expect(parseEnergy("123456789")).toBeUndefined();
	});
});

describe("energyRange", () => {
	it("keeps the dish's possible energies and drops a reading off by a digit", () => {
		const [min, max] = energyRange("apple_acid_yogurt_dressed_salad", false);
		expect(107320).toBeGreaterThanOrEqual(min);
		expect(107320).toBeLessThanOrEqual(max);
		expect(7320).toBeLessThan(min);
		expect(1073200).toBeGreaterThan(max);
		// Extra Tasty doubles the least it can be.
		expect(energyRange("apple_acid_yogurt_dressed_salad", true)[0]).toBeGreaterThan(min * 1.9);
		expect(energyRange("unknown_dish", false)).toEqual([0, Number.POSITIVE_INFINITY]);
	});
});

describe("labelDigitCount", () => {
	it("tells the bonus label's digits from its size", () => {
		// "+40%" in a 588 px chat-app copy: 40 × 14 px.
		expect(labelDigitCount(40, 14)).toBe(2);
		// "+5%": one digit narrower; twice the size in an original screenshot.
		expect(labelDigitCount(70, 28)).toBe(1);
		expect(labelDigitCount(80, 28)).toBe(2);
		expect(labelDigitCount(20, 14)).toBeUndefined();
		expect(labelDigitCount(60, 14)).toBeUndefined();
	});
});

describe("agreedValue", () => {
	it("takes the majority, and on a tie the reading with more digits", () => {
		expect(agreedValue([140142, 14142, 140142])).toEqual({ value: 140142, votes: 2 });
		expect(agreedValue([14142, 140142, undefined])).toEqual({ value: 140142, votes: 1 });
		expect(agreedValue([undefined])).toBeUndefined();
	});
});
