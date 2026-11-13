# Pokémon Sleep Dish Team Calculator

Given the Pokémon in your box and a dish to cook at every meal (3 a day), two solvers:

- **Slot solver:** the smallest team whose ingredient output covers the dish, and how many slots a particular
  Pokémon (e.g. a multi-ingredient gatherer like Sandslash) saves compared with the best team without it.
- **Energy solver:** the team of 5 with the most strength per day from berries, strength skills and the dish
  (scaled by the share of meals the team can gather ingredients for, and by Extra Tasty), and how much
  strength each Pokémon adds or costs. Its **Swap partner** card finds the best rule for sharing one slot between an
  Extra Tasty Pokémon and a partner, swapped after each meal depending on the current Extra Tasty chance.

## Development

```sh
npm install
npm run dev      # start the dev server
npm test         # unit tests (vitest)
npm run build    # typecheck + production build to dist/
```

## Deployment

Every push to `master` runs the tests, builds, and deploys to GitHub Pages via
`.github/workflows/deploy.yml` (repo Settings → Pages → Source must be "GitHub Actions").

## Data sources

- **Pokémon data and ingredient-yield model:** copied unmodified from
  [nitoyon/pokesleep-tool](https://github.com/nitoyon/pokesleep-tool) (MIT) into `src/vendor/pokesleep-tool`.
  To update: `git clone https://github.com/nitoyon/pokesleep-tool.git .upstream/pokesleep-tool && npm run sync-upstream`.
- **Recipes:** `src/data/recipes.json`, generated from [SleepAPI](https://github.com/SleepAPI/SleepAPI) (Apache-2.0)
  by `node scripts/import-recipes.mjs`. Recipes using newer ingredients (e.g. Snackable Nuts) may be missing.

## Model assumptions

Daily yields use pokesleep-tool's defaults: 100 sleep score, checking in every 3 hours while awake, no
teammate bonuses (Helping Bonus, Energy for Everyone, …). Ingredients from main skills (Ingredient Magnet,
Ingredient Draw, Bulk Up) are counted as an expected average. The energy solver ignores ingredients the dish
doesn't use, extra ingredients added to the pot, and meals the team can't gather the dish for.
