import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { recipes } from "../core/recipes";

test("every recipe has a dish picture (run `npm run fetch-dish-art` after importing recipes)", () => {
	const missing = recipes.filter((r) => !existsSync(`src/data/dish-art/${r.id}.png`)).map((r) => r.id);
	expect(missing).toEqual([]);
});
