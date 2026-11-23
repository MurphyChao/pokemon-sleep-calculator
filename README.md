# PokeMasterChef – Pokémon Sleep dish team calculator

In English, Traditional Chinese and Japanese. Given the Pokémon in your box and a dish to cook at every meal (3 a day),
two solvers:

- **Energy solver:** the best use of 5 team slots for strength per day from berries, strength skills and the dish
  (scaled by the share of meals the team can gather ingredients for, and by Extra Tasty), and how much
  strength each Pokémon adds or costs. Like the slot solver, a Pokémon can use part of a slot (it's on the
  team that share of the time), so more than 5 Pokémon can take part. Its **Swap partner** card finds the best rule for sharing one slot between an
  Extra Tasty Pokémon and a partner, swapped after each meal depending on the current Extra Tasty chance.
- **Slot solver:** the smallest team whose ingredient output covers the dish, and how many slots a particular
  Pokémon (e.g. a multi-ingredient gatherer like Sandslash) saves compared with the best team without it.

Three options change the Pokémon the numbers are worked out for, on the Box tab and in both solvers, without
changing the saved box: **Final evolution** (every Pokémon as its final form, main skill +1 per evolution;
branching lines become the form chosen for them, see below), **Max Sub Skill Seeds** (unlocked subskills upgraded S → M → L as far as they go) and
**Level scaling** (lower-level Pokémon counted at the chosen level). The Box table keeps showing the real Pokémon
and marks what changed (e.g. "→ Venusaur", "10→60", upgraded subskill icons). Its **Productivity / day** column shows
what each Pokémon produces with these options and your settings, for what it's kept for (as Rarity sees it): strength
and skill triggers for strength Pokémon (e.g. Sceptile), skill triggers and what they give (energy, Extra Tasty chance,
dream shards) for support and ingredients + skill Pokémon (e.g. Gardevoir, Chansey, Cramorant), then everyone's
ingredients per day (skill ingredients included).

The **Event bonus** setting chooses the event whose bonuses apply: **Base** (none), **Default** (the event running
now, from pokesleep-tool's event list, e.g. skill rate ×1.25 and dream shard skills ×1.5; its effects and end date are
shown) or **Custom** (a pop-up sets which Pokémon it applies to and its effects, with the values the game's events use;
it starts from the event running now). pokesleep-tool's model applies an event's effects to helps and skills (skill
rate and level, extra berries and ingredients, dream shards, skill ingredients, Berry Burst, inventory); this app
applies its dish strength and pot size multipliers. It counts everywhere: the Box, both solvers, Rarity and Rank (the
shipped rank tables are without an event, so with one running the browser builds its own). Code: `src/core/event.ts`,
`src/ui/EventBonus.tsx`.

Both solvers count **Helping Bonus**: each slot filled by Pokémon with it makes everyone else on the team help 5%
faster (pokesleep-tool's model, including the 35% cap with speed subskills). Since that makes each Pokémon's output
depend on the team, the solvers try team Helping Bonus totals of 0, ½, 1, … (up to 5): for each, everyone's output is
counted with that much Helping Bonus, the Helping Bonus Pokémon must fill at least that many slots, and the best
result wins. Partial slots are interpolated between whole numbers of helpers. In the energy solver, every
combination of Extra Tasty and healer shares is tried without Helping Bonus; with it, the search starts from the
best combinations found and refines them.

## Rarity

The Box table's **Rarity** rates each Pokémon's nature, subskills and ingredients by where they rank among all possible
rolls of the same Pokémon (same species and main skill level, any ingredient combination): "Top 3%" means 3% of random rolls would be better, shown
as odds too ("1 in 33 rolls is better"). Grades: S top 3%, A top 15%, B top 50%, C top 80%, D the rest. The box can
be sorted by it (the solvers' benches show the Rank below instead). Rarity and Rank always judge a Pokémon as its final
form, with Sub Skill Seeds used, whatever the Final evolution and Max Sub
Skill Seeds options say, so they tell how good it can become.

For lines that branch, each Pokémon's final form can be chosen in its edit pop-up (**Evolves into**; the card shows it
as e.g. "→ Gardevoir", a tap away from changing it). Defaults: Ralts and Kirlia → Gardevoir, Slowpoke → Slowking,
Eevee → Espeon. The choice is used everywhere the Pokémon counts as its final form: Rarity, Rank and, with Final
evolution on, the solvers. Toxel evolves by its nature, as in the game. The tooltip also gives the share of the best possible nature and subskills,
and what that best build is.

A roll is an ingredient combination, a nature and 5 different subskills, each equally likely (the game doesn't publish the real odds; gold
subskills are probably rarer, so Pokémon with them rank lower than they should). The rank is estimated from 2,000
random rolls, the same on every load, so odds are resolved down to about 1 in 2,000. Everything is computed at
Lv80, where every subskill and ingredient slot is unlocked, with the same yield model and settings as the solvers.
The Pokémon and every roll it's compared with are benchmarked fully invested:

- Sub Skill Seeds are used as far as they go (S → M → L, never the same subskill twice), as in the Max Sub Skill Seeds option.
- The main skill is at its max level, except for Ingredients specialists rated on ingredients alone (e.g.
  Blastoise or Venusaur with Ingredient Magnet S): players tend to save Main Skill Seeds for other Pokémon, so
  these keep the skill level entered, plus Skill Level Up from their (seeded) subskills. Skills specialists
  with an ingredient skill (Sandslash, Crustle) are maxed.

Pokémon kept for ingredients (Ingredients specialists including hybrids like Chansey, and ingredient-skill users like
Sandslash) are ranked for each ingredient they can gather: how
much of that one ingredient they gather per day (for a hybrid, plus its skill counted as that ingredient, see below),
against 2,000 random rolls with any ingredient combination that can gather it (each equally likely).
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
| Strength | berry + main skill strength per day | Berries specialists; Skills specialists with strength skills (e.g. Sceptile); a skill's support part counted as strength (below) |
| Ingredients | ingredients per day, including from the main skill | Ingredients specialists; Ingredient Draw/Magnet users (e.g. Sandslash) |
| Ingredients + skill | ingredients per day, plus the skill counted as ingredients | Ingredients specialists with a team healing, Energizing Cheer or Tasty Chance skill (Chansey, Comfey, Drampa, Cramorant) |
| Skill triggers | main skill triggers per day | other Skills specialists (including Heracross, whose Bulk Up also gives random ingredients) |

For the hybrid, the skill is counted in slots, as the Slot solver counts Extra Tasty: its skill as a share of what a
plain Pokémon of the best species with that kind of skill gives, times what a plain Pokémon of the best pure gatherer of
the ingredient gathers. E.g. a Blissey whose Energy for Everyone gives 43% of a plain Gardevoir's adds 43% of a plain
Delibird's eggs. This treats a slot of the skill as worth a slot of the ingredient; the references are the same as
Rank's (below).

The same goes for the three strength Pokémon whose skill also does a support skill's job: Latias (Heal Pulse restores
energy like Energizing Cheer, besides its extra helps), Cresselia (Lunar Blessing: energy for everyone) and Lucario
(Aura Sphere: dream shards). That part counts as strength in slots: e.g. Latias's energy as a share of a plain Slowking's
Energizing Cheer, times a plain Noivern's strength (the Dragon strength reference).

Heracross's Bulk Up gives random ingredients and raises the Extra Tasty chance by half as much as Tasty Chance S. It's
rated as a skill Pokémon and ranked with Tasty Chance users (against Dedenne) by its Extra Tasty chance per day plus its
random ingredients in slots: their share of what a plain Toxtricity's Ingredient Magnet gives, times what a plain
Dedenne adds. The best build (for the tooltip) is found by a local search (`searchBest` in `src/core/rating.ts`); checked
against an exhaustive search over every Pokémon, it finds the same optimum.

Rarity and Rank are computed in web workers, off the page and in parallel: one per spare CPU core, at most 4, each
species always on the same worker so its rolls are computed once (`src/ui/computePool.ts`). Without web workers the
page computes them itself, a slice at a time. Rarity results are kept in the browser (`pscalc-ratings`, not synced) for
the current build, so a reload or a later visit shows them at once; a new deploy starts over.

The energy solver's results (best team, with/without teams, default swap partner; `src/core/energyTab.ts`) are worked
out ahead by the same web workers whenever the box, settings, dish, pins or exclusions change while another tab is
shown, and the last few are kept for the visit (`src/ui/energyCache.ts`), so opening or revisiting the tab, or going
back to a recent dish or setting, doesn't wait for them. Code: `src/core/rating.ts`, `src/ui/useRatings.ts`.

## Rank

Rarity compares a Pokémon with other rolls of its own species. **Rank** compares it with random rolls of **the best
species for the same job**, e.g. "S · Top 2% · Ingredients: Fancy Apple" against Skeledirge rolls. For the best species
itself, Rank and Rarity are the same number; any other species is told how close it gets to the best (so most of them
rank C or D). It's shown next to Rarity in the Box table (which can be sorted by either) and on its own in both solvers'
benches; the tooltip names the species it's compared with. The job decides what's measured, in a unit both share:

- **Strength: <type>:** berry strength + strength-skill strength per day, against the best strength Pokémon of the same
  berry type (favorite berries and island bonuses go by type), e.g. Grass → Sceptile.
- **Ingredients: <ingredient>:** how much of one ingredient per day (skill ingredients included), against the best
  Pokémon kept for ingredients (Ingredients specialists, ingredient-skill users like Sandslash) that gathers it, with its
  combinations that include it. A Pokémon is ranked for each ingredient it can gather and its best one counts, so a good
  apple gatherer ranks high even though apples are the cheapest ingredient. (Ingredient strength per day is in the
  tooltip.)
- **Skill: <kind>:** what the main skill gives per day in its own unit (energy, Extra Tasty chance, dream shards…),
  against the best Pokémon with the same kind of skill (variants like "(Random)" count as one kind).
- Ingredients specialists with a support skill (Chansey, Comfey, Drampa, Cramorant) are ranked only for their
  ingredients, with the skill counted as ingredients as in Rarity (the tooltip shows how much). They're never the
  reference for an ingredient a pure gatherer also gathers, nor for a skill, so they're compared with the best pure
  gatherer (e.g. Blissey with Delibird for eggs).

The best species of a category is the non-mythical fully evolved Pokémon doing the most there with a neutral nature and
no subskills. Legendaries aren't references unless nothing else does the job (few players have one, and rarely
a good roll), so Dragon strength is compared with Noivern rather than Latios; legendaries themselves are still ranked,
against that reference. Its rolls are drawn exactly as Rarity draws them
(2,000 rolls, same seed), and everything is measured the same way: as the final form, at Lv80, with Sub Skill Seeds used
and the main skill maxed except for Ingredients specialists, Helping Bonus counted for the team (the same amount whatever
the roll's ingredient combination), and **your settings** (inventory limit, sleep score, energy, camp ticket, favorite
berries, island bonus). The best species and its rolls therefore depend on the settings, and can change with them. For the
app's defaults the tables are shipped, built by `npm run build-rank-tables` (about 5 seconds) into
`src/data/rank-tables.json` and loaded separately from the page. For any other settings the browser builds them with the
same code, but only the categories the box's Pokémon are ranked in, each the first time it's needed, in the web workers
(see Rarity; their Pokémon show "Rank…" meanwhile). Finding the best species takes a
fraction of a second; rolling it is the slow part, from about 20 ms (inventory limit off) to about 350 ms (simulated
energy) per category. Built tables are kept in the browser for the last three settings
(`pscalc-rank-tables`, not synced). Rerun the script after syncing new Pokémon or changing how ranks are measured (and
bump `cacheVersion` in `src/ui/useRankTables.ts`). Code: `src/core/rank.ts`, `src/ui/useRankTables.ts`,
`scripts/build-rank-tables.mjs`.

## Box filters

The Box table can be filtered by what each Pokémon is kept for (**Strength**, **Ingredients** or **Skill**: its role as
Rarity rates it, as its final form, so an Eevee counts as an Espeon by default; hybrids like Blissey count as both
Ingredients and Skill), by type (the game's type icons) and by ingredient: only ingredients a Pokémon has
unlocked count (at its level, or the scaled level with Level scaling on), and only ingredients someone in the box
has unlocked are offered. With nothing selected everything is shown; the first click on a choice shows only it,
further clicks add or remove choices, and "All" clears a row. A Pokémon is shown if it matches a selected choice in every row
that has a selection. The filters are remembered.

## Screenshot import

The **+ Add Pokémon** button (right end of the tab bar) opens a pop-up with the form and a screenshot importer, which reads
Pokémon from screenshots of the game's Pokémon details screen (scrolled so the subskills and nature are visible),
in Traditional Chinese, Japanese or English. Text is read with
[Tesseract.js](https://github.com/naptha/tesseract.js) in the browser and fuzzy-matched against the game's names.
Screenshots are never uploaded. The OCR worker, engine and language data (`@tesseract.js-data/*`) are served from
this site under `tesseract/` (copied from `node_modules` by a small plugin in `vite.config.ts`), not from a CDN;
the first import downloads about 6 MB.
The Pokémon is recognized by its icon first: the round icon on the name card is compared with reference icons
(`src/ocr/pokemonIcon.ts`), and only if none matches confidently is the name read (which also gives the level). So a
nicknamed Pokémon is still recognized, and when icon and name disagree the review form says so. The reference icons
come from two places:

- **Built in:** `src/data/sleep-icons/`, cut from screenshots in `screenshots/` by `npm run build-sleep-icons`. It
  uses the Pokémon listed in `src/ocr/__fixtures__/screenshots.expected.json` for those screenshots and reads the
  name (with the importer's OCR) for others; check its output, since a misread name would teach a wrong icon.
  Different-looking icons of the same Pokémon (shiny, costumes) are kept as extra icons.
- **Learned:** when a reading is confirmed with "Add to box" and its icon wasn't already recognized as that
  Pokémon, the icon is saved in the browser (`pscalc.learnedIcons`, synced with Google Drive like the rest), up to
  5 per Pokémon.

Icons are compared shrunk to 48×48, inside the circle, allowing a 2-pixel shift. A match needs an average colour
difference under 0.04, at least 0.03 better than any other Pokémon: the same icon at other screen sizes stays within
about 0.016, while different Pokémon in the screenshots so far are 0.08 or more apart. Forms that share a name (e.g.
Pumpkaboo sizes) count as one; the ingredient icons tell them apart. When the Pokémon is picked or changed in the
review form, the ingredient combination is filled in from the recognized ingredient icons.

Ingredients are recognized by comparing the Lv30/Lv60 icons with `src/data/ingredient-icons` (small references at the
game's scale; the app shows the larger `src/data/ingredient-art`, cut from in-game research-notes screenshots). Every reading is
checked in the Add Pokémon form before it's saved. Code: `src/ocr/`.

`src/ocr/screenshots.test.ts` checks the importer against real screenshots listed in
`src/ocr/__fixtures__/screenshots.expected.json`, three ways: by name, by icon, and with a nickname in place of the
name. The screenshots aren't committed: put them in `screenshots/`
to run it (it's skipped otherwise).

## Visit statistics

The site counts visits anonymously with [GoatCounter](https://www.goatcounter.com/) (no cookies, no personal data;
the script tag is at the end of `index.html`). The numbers are at
[pokemasterchef.goatcounter.com](https://pokemasterchef.goatcounter.com). Visits from `localhost` aren't counted.
The privacy policy (`public/privacy.html`) describes what it collects.

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


**Event list:** `.github/workflows/update-events.yml` runs daily (and from the Actions tab): it fetches
pokesleep-tool's event list (`npm run update-events`, which checks its shape first), and if it changed, runs the
tests, commits `src/vendor/pokesleep-tool/data/event.json` and starts the deploy. So the **Default** event bonus picks
up new events within a day of pokesleep-tool adding them. GitHub pauses scheduled workflows after 60 days without
activity in the repository; re-enable it in the Actions tab if that happens.

## Data sources

- **Pokémon data and ingredient-yield model:** copied unmodified from
  [nitoyon/pokesleep-tool](https://github.com/nitoyon/pokesleep-tool) (MIT) into `src/vendor/pokesleep-tool`.
  To update: `git clone https://github.com/nitoyon/pokesleep-tool.git .upstream/pokesleep-tool && npm run sync-upstream`.
- **Traditional Chinese and Japanese names** (Pokémon, skills, subskills, natures, berry types, ingredients,
  islands): from pokesleep-tool's `zh-TW` and `ja` translations, also copied into `src/vendor/pokesleep-tool/i18n`.
  The UI text (English, Traditional Chinese, Japanese) is in `src/ui/i18n.tsx`; the Japanese UI text was translated
  for this app using the game's terms as pokesleep-tool writes them (エナジー, げんき, 大成功…).
  Recipe names (`src/data/recipes.zh-TW.json`, `src/data/recipes.ja.json`) are from the
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

Daily yields use pokesleep-tool's model with checking in every 3 hours while awake. A Pokémon's own Helping Bonus
speeds up itself; the solvers also count it for the rest of the team (see above).
Energy is always full by default (fastest helping all day). The sleep score (default 0 = no sleep, 100 = 8.5 hours)
sets how long the bag goes unemptied overnight and, with simulated energy, how much energy recovers. With **Energy: Simulated**, energy drains while
awake and is restored by sleep and healers: each Pokémon heals itself on the Box tab and in
the slot solver, and the energy solver counts each team's own healers (Energy for Everyone heals everyone,
Energizing Cheer one random member, Charge Energy only itself). Ingredients from main skills (Ingredient Magnet,
Ingredient Draw, Bulk Up) are counted as an expected average. The energy solver ignores ingredients the dish
doesn't use, extra ingredients added to the pot, and meals the team can't gather the dish for.
