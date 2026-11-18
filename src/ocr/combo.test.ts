import { comboFromIcons } from "./combo";

test("comboFromIcons maps the recognized Lv30 / Lv60 ingredients to the Pokémon's slots", () => {
	// Charizard: Bean Sausage / Warming Ginger / Fiery Herb.
	expect(comboFromIcons("Charizard", { lv30: "sausage", lv60: "herb" })).toBe("AAC");
	expect(comboFromIcons("Charizard", { lv30: "ginger", lv60: "ginger" })).toBe("ABB");
	// Lv30 can't be the third ingredient; unknown icons or Pokémon give nothing.
	expect(comboFromIcons("Charizard", { lv30: "herb", lv60: "herb" })).toBeUndefined();
	expect(comboFromIcons("Charizard", { lv30: "sausage" })).toBeUndefined();
	expect(comboFromIcons("Charizard", undefined)).toBeUndefined();
	expect(comboFromIcons("Nope", { lv30: "sausage", lv60: "herb" })).toBeUndefined();
});
