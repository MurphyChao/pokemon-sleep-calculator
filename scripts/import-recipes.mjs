// One-off importer: converts SleepAPI's recipe definitions (Apache-2.0, https://github.com/SleepAPI/SleepAPI)
// into src/data/recipes.json using pokesleep-tool's ingredient names. Review the diff after running.
import { writeFileSync } from "node:fs";

const base = "https://raw.githubusercontent.com/SleepAPI/SleepAPI/HEAD/common/src/types/recipe/";
const ingredientMap = {
	FANCY_APPLE: "apple", MOOMOO_MILK: "milk", GREENGRASS_SOYBEANS: "soy", HONEY: "honey",
	BEAN_SAUSAGE: "sausage", WARMING_GINGER: "ginger", SNOOZY_TOMATO: "tomato", FANCY_EGG: "egg",
	PURE_OIL: "oil", SOFT_POTATO: "potato", FIERY_HERB: "herb", GREENGRASS_CORN: "corn",
	SOOTHING_CACAO: "cacao", ROUSING_COFFEE: "coffee", GLOSSY_AVOCADO: "avocado",
	TASTY_MUSHROOM: "mushroom", LARGE_LEEK: "leek", PLUMP_PUMPKIN: "pumpkin", SLOWPOKE_TAIL: "tail",
};

const recipes = [];
for (const type of ["curry", "salad", "dessert"]) {
	const src = await (await fetch(`${base}${type}.ts`)).text();
	const blocks = src.matchAll(/= create(?:Curry|Salad|Dessert)\(/g);
	for (const m of blocks) {
		const body = src.slice(m.index, src.indexOf("});", m.index));
		const id = body.match(/name: '([A-Z0-9_]+)'/)?.[1];
		const nameMatch = body.match(/displayName: (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/);
		const name = nameMatch?.[1] ?? nameMatch?.[2];
		const bonus = Number(body.match(/bonus: ([\d.]+)/)?.[1]);
		if (!id || !name || Number.isNaN(bonus)) throw new Error(`Could not parse ${type} recipe:\n${body}`);
		const ingredients = {};
		for (const [, amount, ing] of body.matchAll(/amount: (\d+), ingredient: ([A-Z_]+)/g)) {
			const mapped = ingredientMap[ing];
			if (!mapped) throw new Error(`Unknown ingredient ${ing} in ${id}`);
			ingredients[mapped] = Number(amount);
		}
		// Mixed dishes have no fixed ingredients, so they are not useful for this calculator.
		if (Object.keys(ingredients).length === 0) continue;
		recipes.push({ id: id.toLowerCase(), name: name.replace(/\\(['"])/g, "$1"), type, bonus, ingredients });
	}
}
writeFileSync("src/data/recipes.json", `${JSON.stringify(recipes, null, "\t")}\n`);
console.log(`Wrote ${recipes.length} recipes`);
