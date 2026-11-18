# PokeMasterChef – Pokémon Sleep dish team calculator

Given the Pokémon in your box and a dish to cook at every meal (3 a day), two solvers:

- **Energy solver:** the best use of 5 team slots for strength per day from berries, strength skills and the dish
  (scaled by the share of meals the team can gather ingredients for, and by Extra Tasty), and how much
  strength each Pokémon adds or costs. Like the slot solver, a Pokémon can use part of a slot (it's on the
  team that share of the time), so more than 5 Pokémon can take part. Its **Swap partner** card finds the best rule for sharing one slot between an
  Extra Tasty Pokémon and a partner, swapped after each meal depending on the current Extra Tasty chance.
- **Slot solver:** the smallest team whose ingredient output covers the dish, and how many slots a particular
  Pokémon (e.g. a multi-ingredient gatherer like Sandslash) saves compared with the best team without it.

Three options change the Pokémon the numbers are worked out for, on the Box tab and in both solvers, without
changing the saved box: **Final evolution** (every Pokémon as its final form, main skill +1 per evolution;
branching lines stay), **Max Sub Skill Seeds** (unlocked subskills upgraded S → M → L as far as they go) and
**Level scaling** (lower-level Pokémon counted at the chosen level). The Box table keeps showing the real Pokémon
and marks what changed (e.g. "→ Venusaur", "10→60", upgraded subskill icons).

Both solvers count **Helping Bonus**: each slot filled by Pokémon with it makes everyone else on the team help 5%
faster (pokesleep-tool's model, including the 35% cap with speed subskills). Since that makes each Pokémon's output
depend on the team, the solvers try team Helping Bonus totals of 0, ½, 1, … (up to 5): for each, everyone's output is
counted with that much Helping Bonus, the Helping Bonus Pokémon must fill at least that many slots, and the best
result wins. Partial slots are interpolated between whole numbers of helpers. In the energy solver, every
combination of Extra Tasty and healer shares is tried without Helping Bonus; with it, the search starts from the
best combinations found and refines them.

## Box rating

The Box table rates each Pokémon's nature and subskills by where they rank among all possible rolls of the same
Pokémon (same species, ingredients and main skill level): "Top 3%" means 3% of random rolls would be better, shown
as odds too ("1 in 33 rolls is better"). Grades: S top 5%, A top 20%, B top 50%, C top 80%, D the rest. The box can
be sorted by it, and both solvers' bench lists show it too. It's for the Pokémon after final evolution, if that
option is on. The tooltip also gives the share of the best possible nature and subskills,
and what that best build is.

A roll is a nature and 5 different subskills, each equally likely (the game doesn't publish the real odds; gold
subskills are probably rarer, so Pokémon with them rank lower than they should). The rank is estimated from 2,000
random rolls, the same on every load, so odds are resolved down to about 1 in 2,000. Everything is computed at
Lv80, where every subskill and ingredient slot is unlocked, with the same yield model and settings as the solvers.
The Pokémon and every roll it's compared with are benchmarked fully invested:

- Sub Skill Seeds are used as far as they go (S → M → L, never the same subskill twice), as in the Max Sub Skill Seeds option.
- The main skill is at its max level, except for Ingredients specialists rated on ingredients alone (e.g.
  Blastoise or Venusaur with Ingredient Magnet S): players tend to save Main Skill Seeds for other Pokémon, so
  these keep the skill level entered, plus Skill Level Up from their (seeded) subskills. Skills specialists
  with an ingredient skill (Sandslash, Crustle) are maxed.

Ingredients specialists (including hybrids like Chansey) are ranked for each ingredient they can gather: how
much of that one ingredient they gather per day (half of the value for a hybrid, the other half being skill
triggers), against 2,000 random rolls with any ingredient combination that can gather it (each equally likely).
Their best rank counts, and the cell names that ingredient. So the combination matters: an AAA Charizard ranks top
for Bean Sausage, an ABB one for Ginger, and an AAC one is compared only with other Charizards that gather Fiery
Herb.

Helping Bonus also counts the rest of the team: besides its own 5% faster helping (which the yield model
includes), the 4 teammates help 5% faster, i.e. about 5.3% more helps each. That adds 4 × 5.3% ≈ 21% of the
Pokémon's output with a neutral nature and no subskills, assuming teammates produce about as much and ignoring
the 35% cap on helping speed bonuses.

Rolls that end up doing the same in the yield model (e.g. Inventory Up S + L and M + L both become M + L) share one
calculation. What is measured depends on what the Pokémon is kept for, not just its specialty:

| Role | Measures | Who |
|---|---|---|
| Strength | berry + main skill strength per day | Berries specialists; Skills specialists with strength skills (e.g. Sceptile) |
| Ingredients | ingredients per day, including from the main skill | Ingredients specialists; Ingredient Draw/Magnet users (e.g. Sandslash) |
| Ingredients + skill | ingredients and skill triggers, half each | Ingredients specialists with a team healing or Tasty Chance skill (Chansey, Drampa, Cramorant) |
| Skill triggers | main skill triggers per day | other Skills specialists |

For the hybrid, each measure is taken relative to the same Pokémon with a neutral nature and no subskills, so the
two can be added up. The best build (for the tooltip) is found by a local search (`searchBest` in `src/core/rating.ts`); checked
against an exhaustive search over every Pokémon, it finds the same optimum. Code: `src/core/rating.ts`,
`src/ui/useRatings.ts`.

## Box filters

The Box table can be filtered by type (the game's type icons) and by ingredient: only ingredients a Pokémon has
unlocked count (at its level, or the scaled level with Level scaling on), and only ingredients someone in the box
has unlocked are offered. With nothing selected everything is shown; the first click on a choice shows only it,
further clicks add or remove choices, and "All" clears a row. A Pokémon is shown if it has any selected type and any
selected ingredient. The filters are remembered.

## Screenshot import

The Box tab can read Pokémon from screenshots of the game's Pokémon details screen (scrolled so the subskills
and nature are visible), in Traditional Chinese, Japanese or English. Text is read with
[Tesseract.js](https://github.com/naptha/tesseract.js) in the browser and fuzzy-matched against the game's names.
Screenshots are never uploaded. The OCR worker, engine and language data (`@tesseract.js-data/*`) are served from
this site under `tesseract/` (copied from `node_modules` by a small plugin in `vite.config.ts`), not from a CDN;
the first import downloads about 6 MB.
Ingredients are recognized by comparing the Lv30/Lv60 icons with `src/data/ingredient-icons`. Every reading is
checked in the Add Pokémon form before it's saved. Code: `src/ocr/`.

`src/ocr/screenshots.test.ts` checks the importer against real screenshots listed in
`src/ocr/__fixtures__/screenshots.expected.json`. The screenshots aren't committed: put them in `screenshots/`
to run it (it's skipped otherwise).

## Google Drive sync

Users can sign in with their own Google account from the header ("Sign in with Google"); the header then shows
their name and picture. While signed in, the box and all settings (everything saved under `pscalc.*` in
localStorage) are kept in one JSON file in that account's Drive app-data folder, so every device signed in to the
same account shares them. Besides the basic profile (`openid email profile`), the app asks only for the
`drive.appdata` scope: it can't see any other Drive files, and the file is hidden from the Drive UI. Sign-in uses Google's
[OAuth 2.0 flow for client-side web apps](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow):
the page goes to Google's sign-in and comes back with an access token in the URL; there's no server and no popup.
Changes are uploaded a couple of seconds after they're made, and the Drive copy is fetched on load and when the tab
comes back into view. If both sides changed since the last sync, the user picks which copy to keep. Access tokens
last an hour and are kept for the browser session; after that, "Sync now" goes through Google's sign-in again
(usually straight back without asking). Code: `src/sync/`, `src/ui/SyncControl.tsx`.

The sign-in button only appears when the build has an OAuth client ID. The client ID identifies this app to
Google, not any one account: every user signs in with their own. To set one up:

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the
   **Google Drive API**.
2. Under **Google Auth Platform**, configure the consent screen (External), add the scopes
   `openid`, `email`, `profile` and `https://www.googleapis.com/auth/drive.appdata`, and either add test users or publish the app.
3. Create an OAuth client of type **Web application** with:
   - **Authorized JavaScript origins:** `https://<user>.github.io` and `http://localhost:5173`
   - **Authorized redirect URIs:** the site's address with a trailing slash, e.g.
     `https://<user>.github.io/pokemon-sleep-calculator/`, and `http://localhost:5173/` (for `npm run dev`)
4. Put the client ID in the repo variable `GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions →
   Variables); the deploy workflow passes it to the build. For local development, put
   `VITE_GOOGLE_CLIENT_ID=<client id>` in `.env.local`.

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
  `src/ui/i18n.tsx`. Japanese names (used only to read Japanese screenshots) come from the same place.
  Traditional Chinese recipe names (`src/data/recipes.zh-TW.json`) are from the
  [52poke wiki](https://wiki.52poke.com/zh-hant/料理（Pokémon_Sleep）), matched by official English name.
- **Pokémon icons:** `src/data/pokemon-icons/`, the Scarlet/Violet box icons from
  [Pokémon Database](https://pokemondb.net/sprites) (images © Nintendo/Game Freak; pokemondb.net says the sprites are
  free to use), cropped to the Pokémon by `npm run fetch-pokemon-icons`, which downloads only icons not there yet.
  Run it after syncing new Pokémon from upstream; a test fails if any Pokémon lacks an icon. Event costumes
  (Halloween Pikachu, Holiday Eevee…) use the plain species' icon; real forms map to their own in
  `src/data/pokemonIconSlug.ts`.
- **Type icons:** `src/data/type-icons/`, the 18 type icons cut from a screenshot of Pokémon Sleep's box filter
  screen (images © Nintendo/The Pokémon Company), each cropped to its circle with a transparent background.
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
