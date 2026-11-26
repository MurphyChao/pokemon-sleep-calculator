import { describe, expect, it } from "vitest";
import { agreedValue, matchRecipe, parseEnergy, parseTastyBonus } from "./cooking";

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

describe("parseTastyBonus", () => {
	it("is sure of a label read with its + and %", () => {
		expect(parseTastyBonus("+20%")).toEqual({ value: 20, sure: true });
		expect(parseTastyBonus("+5%")).toEqual({ value: 5, sure: true });
		expect(parseTastyBonus("20%")).toEqual({ value: 20, sure: true });
	});
	it("guesses from the leading digits when the % was misread", () => {
		expect(parseTastyBonus("2050")).toEqual({ value: 20, sure: false });
		expect(parseTastyBonus("+896")).toEqual({ value: 8, sure: false });
	});
	it("skips the pot's MAX label", () => {
		expect(parseTastyBonus("MAX+36")).toBeUndefined();
		expect(parseTastyBonus("MAX436")).toBeUndefined();
		expect(parseTastyBonus("")).toBeUndefined();
	});
});

describe("agreedValue", () => {
	it("takes the majority, and on a tie the reading with more digits", () => {
		expect(agreedValue([140142, 14142, 140142])).toEqual({ value: 140142, votes: 2 });
		expect(agreedValue([14142, 140142, undefined])).toEqual({ value: 140142, votes: 1 });
		expect(agreedValue([undefined])).toBeUndefined();
	});
});
