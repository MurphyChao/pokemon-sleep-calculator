# Pokémon Sleep Dish Team Calculator

Given the Pokémon in your box and a dish to cook at every meal (3 a day), two solvers:

- **Energy solver:** the best use of 5 team slots for strength per day from berries, strength skills and the dish
  (scaled by the share of meals the team can gather ingredients for, and by Extra Tasty), and how much
  strength each Pokémon adds or costs. Like the slot solver, a Pokémon can use part of a slot (it's on the
  team that share of the time), so more than 5 Pokémon can take part. Its **Swap partner** card finds the best rule for sharing one slot between an
  Extra Tasty Pokémon and a partner, swapped after each meal depending on the current Extra Tasty chance.
- **Slot solver:** the smallest team whose ingredient output covers the dish, and how many slots a particular
  Pokémon (e.g. a multi-ingredient gatherer like Sandslash) saves compared with the best team without it.

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
- **Traditional Chinese names** (Pokémon, skills, subskills, natures, berry types, ingredients, islands): from
  pokesleep-tool's `zh-TW` translations, also copied into `src/vendor/pokesleep-tool/i18n`. The UI text is in
  `src/ui/i18n.tsx`; recipe names are English only.
- **Recipes:** `src/data/recipes.json`, generated from [SleepAPI](https://github.com/SleepAPI/SleepAPI) (Apache-2.0)
  by `node scripts/import-recipes.mjs`. Recipes using newer ingredients (e.g. Snackable Nuts) may be missing.

## Model assumptions

Daily yields use pokesleep-tool's model with checking in every 3 hours while awake and no Helping Bonus.
Energy is always full by default (fastest helping all day). The sleep score (default 0 = no sleep, 100 = 8.5 hours)
sets how long the bag goes unemptied overnight and, with simulated energy, how much energy recovers. With **Energy: Simulated**, energy drains while
awake and is restored by sleep and healers: each Pokémon heals itself on the Box tab and in
the slot solver, and the energy solver counts each team's own healers (Energy for Everyone heals everyone,
Energizing Cheer one random member, Charge Energy only itself). Ingredients from main skills (Ingredient Magnet,
Ingredient Draw, Bulk Up) are counted as an expected average. The energy solver ignores ingredients the dish
doesn't use, extra ingredients added to the pot, and meals the team can't gather the dish for.
