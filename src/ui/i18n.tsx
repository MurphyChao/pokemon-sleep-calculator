/**
 * UI language: English or Traditional Chinese.
 *
 * Game terms (Pokémon, skills, subskills, natures, berry types, ingredients, islands) come from
 * pokesleep-tool's translations; Traditional Chinese recipe names from the 52poke wiki (src/data/recipes.zh-TW.json).
 * The current language is a module-level value; App re-mounts the page when it changes.
 */
import { Fragment, type ReactNode } from "react";
import enData from "../vendor/pokesleep-tool/i18n/en/data.json";
import zhCommon from "../vendor/pokesleep-tool/i18n/zh-TW/common.json";
import zhData from "../vendor/pokesleep-tool/i18n/zh-TW/data.json";
import zhPokemons from "../vendor/pokesleep-tool/i18n/zh-TW/pokemons.json";
import zhSkills from "../vendor/pokesleep-tool/i18n/zh-TW/skills.json";
import zhRecipes from "../data/recipes.zh-TW.json";

export type Lang = "en" | "zh-TW";
export const languages: { lang: Lang; label: string }[] = [
	{ lang: "en", label: "English" },
	{ lang: "zh-TW", label: "繁體中文" },
];

let current: Lang = "en";
export function setLang(lang: Lang) {
	current = lang;
}
export function getLang(): Lang {
	return current;
}

const en = {
	appTitle: "PokeMasterChef",
	pageTitle: "PokeMasterChef – Pokémon Sleep dish team calculator",
	subtitle: "How many team slots do your Pokémon need to supply a dish's ingredients for 3 meals a day?",
	language: "Language",
	tabBox: "Box ({n})",
	tabEnergy: "Energy solver",
	tabSlots: "Slot solver",
	inventoryLimit: "Inventory limit",
	inventoryLimitHint: "(off: bag never fills)",
	campTicket: "Good Camp Ticket",
	campTicketHint: "(help speed and inventory ×1.2)",
	energy: "Energy",
	energyFull: "Always full",
	energySimulated: "Simulated (drains; healers restore it)",
	sleepScore: "Sleep score",
	sleepScoreHint: "(100 = 8.5 h asleep; 0 = no sleep)",
	finalEvolution: "Final evolution",
	finalEvolutionHint: "(every Pokémon counts as its final form in the box's numbers and the solvers; branching lines like Eevee stay as they are)",
	maxSubSkillSeeds: "Max Sub Skill Seeds",
	maxSubSkillSeedsHint: "(every unlocked subskill counts as upgraded as far as it goes, S→M→L, never into one the Pokémon already has)",
	seededSubSkill: "{name} (Sub Skill Seed: was {from})",
	levelScaling: "Level scaling",
	levelScalingOff: "Off",
	levelScalingHint: "(lower-level Pokémon count as this level in the box's numbers and the solvers)",
	footerData: "Pokémon data and ingredient model from",
	footerRecipes: "Recipes from",
	footerIcons: "Pokémon icons from",
	privacyPolicy: "Privacy policy",
	footerAssumptions:
		"The sleep score sets how long you sleep (100 = 8.5 hours, 0 = not at all): while asleep the bag isn't emptied, and with simulated energy that's when energy recovers. Energy \"Always full\" keeps every Pokémon at full help speed all day. \"Simulated\" uses pokesleep-tool's energy model (energy drains while awake and recovers during sleep); on the Box tab and in the slot solver each Pokémon is healed only by its own skill, while the energy solver also counts the team's healers (Energy for Everyone heals everyone, Energizing Cheer one random member, Charge Energy itself). Helping Bonus speeds up the rest of the team (5% per slot its Pokémon fill) in both solvers. With the inventory limit on, ingredients are collected every 3 hours while awake and not while asleep. Ingredients from main skills (Ingredient Magnet, Ingredient Draw, Bulk Up) are counted as an expected average, with random ingredients split evenly; skills that copy other skills are not counted. Mythical Pokémon are not supported yet. The energy solver shares 5 slots like the slot solver (a Pokémon on the team part of the time uses part of a slot) and counts berries, strength skills (Charge Strength, Berry Burst, Extra Helpful, Helper Boost and similar, as estimated by pokesleep-tool) and the target dish only: ingredients the dish doesn't use, and extra ingredients in the pot add nothing, and a meal without enough ingredients for the dish counts as 0.",
	footerRecipeNames: "",

	// Box
	addPokemon: "Add Pokémon",
	addPokemonButton: "+ Add Pokémon",
	settings: "Settings",
	howToRead: "How to read this",
	addPokemonShort: "+ Add",
	close: "Close",
	editPokemon: "Edit Pokémon",
	pokemon: "Pokémon",
	typeToSearch: "Type to search",
	nicknameOptional: "Nickname (optional)",
	nicknamePlaceholder: "e.g. Sandslash HSM",
	level: "Level",
	ingredientsCombo: "Ingredients (Lv1 / Lv30 / Lv60)",
	mainSkillLevel: "Main skill ({skill}) level",
	mainSkillLevelNoSkill: "Main skill level",
	natureField: "Nature (pick one ▲ and one ▼)",
	subskillsField: "Subskills (click in order: Lv10 → 25 → 50 → 70 → 80)",
	saveChanges: "Save changes",
	addToBox: "Add to box",
	cancel: "Cancel",
	yourBox: "Your box",
	sortBy: "Sort by",
	sortAdded: "Order added",
	sortDex: "Pokédex number",
	sortLevel: "Level",
	sortName: "Name",
	sortRating: "Rarity",
	sortRank: "Rank",
	sortReverse: "Reverse order",
	filterType: "Type",
	filterIngredient: "Ingredients (unlocked)",
	filterAll: "All",
	filterHelp: "Click one to show only it, click more to add them, click again to remove; All shows every Pokémon.",
	filterShowing: "Showing {n} of {total} Pokémon.",
	noMatches: "No Pokémon match these filters.",
	emptyBox: "No Pokémon yet. Add the ones you might put on your team.",
	colLv: "Lv",
	colIngredients: "Ingredients",
	colSkillLv: "Skill Lv",
	colSkillLvShort: "Skill",
	colNature: "Nature",
	colSubskills: "Subskills",
	colIngPerDay: "Ingredients / day",
	colRating: "Rarity",
	ratingPending: "Rarity…",
	colRank: "Rank",
	rankStrength: "Strength",
	rankIngredient: "Ingredients: {ing}",
	rankIngredientStrength: "Ingredient strength of everything it gathers: {n} per day.",
	rankSkill: "Skill: {skill}",
	rankUnitStrength: "strength",
	rankUnitSkill: "in the skill's own unit: energy, Extra Tasty chance, dream shards…",
	rankTooltip:
		"{value} per day ({unit}); the median is {median}.\nRanked against random rolls of the {species} fully evolved Pokémon in this category, at Lv80 with Sub Skill Seeds used and standard settings (not your own).",
	roleStrength: "Strength (berries + skill)",
	roleIngredients: "Ingredients (incl. from skill)",
	roleHybrid: "Ingredients + skill (half each)",
	roleSupport: "Skill triggers",
	roleIngredientOne: "Ingredients: {ing}",
	roleHybridOne: "{ing} + skill (half each)",
	ratingIngredient: "Ranked for its best ingredient, {ing}, against rolls of any ingredient combination that has it (best for it: {combo}).",
	ratingTop: "Top {pct}",
	ratingOdds: "1 in {n} rolls is better",
	ratingOddsNone: "Fewer than 1 in {n} rolls is better",
	ratingOddsShare: "{pct} of rolls are better",
	ratingTooltip:
		"Rated for: {role}\n{odds}, among random rolls of this Pokémon at Lv80 (any nature and 5 subskills, all equally likely; estimated from {n} rolls).\n{ofBest}% of the best nature and subskills: {best}\n{ingredientNote}{benchmark}\n{helpingBonus}",
	ratingHelpingBonus: "Helping Bonus also counts the 4 teammates helping 5% faster (+21% of this Pokémon's output without subskills).",
	ratingBenchmarkMax: "All compared with Sub Skill Seeds used and the main skill at its max level (Lv{n}).",
	ratingBenchmarkOwn: "All compared with Sub Skill Seeds used and the main skill at its own level plus Skill Level Up (Lv{n} for this one).",
	edit: "Edit",
	delete: "Delete",
	inclFromSkill: "(incl. {n} from skill)",
	fromSkill: "(from skill)",

	// Google sync
	syncTurnOn: "Sign in with Google",
	syncTurnOff: "Sign out",
	syncNow: "Sync now",
	syncSyncing: "Syncing…",
	syncSigningIn: "Signing in…",
	syncSignedIn: "Signed in",
	syncDenied: "Google sign-in was cancelled. Sign in again and allow access to sync.",
	syncNeedDrive:
		"Sync needs access to Google Drive. Sign in again and tick the box that lets this app see, create and delete its own configuration data in your Google Drive.",
	syncOn: "Sync on",
	syncedAt: "Synced {time}",
	syncSignIn: "Sign in again to sync",
	syncHint: "Sign in with your Google account to keep your box and settings in a private app folder in your Google Drive. Every device you sign in on shares them.",
	syncConflict: "This device and Google Drive both changed since the last sync. Which copy do you want to keep?",
	syncKeepLocal: "Keep this device's data",
	syncUseRemote: "Use the Google Drive copy",
	syncUseRemoteAt: "Use the Google Drive copy (saved {time})",

	// Screenshot import
	importTitle: "Import from screenshots",
	importHelp:
		"Screenshot a Pokémon's details screen, scrolled down so the subskills and the nature are both visible. Screenshots are read on your device and never uploaded. The first import downloads the text recognizer (about 6 MB).",
	screenshotLang: "Game language",
	chooseScreenshots: "Choose screenshots",
	orDropPaste: "or drop or paste images here",
	loadingOcr: "Loading the text recognizer… {pct}%",
	importEngineFailed: "The text recognizer couldn't be loaded. Check your connection and try again.",
	importWaiting: "Waiting…",
	importReading: "Reading…",
	importComplete: "Everything read",
	importToCheck: "{n} to check",
	importReview: "Review",
	importDiscard: "Discard",
	reviewPokemon: "Check imported Pokémon",
	reviewHelp: "Compare the values below with the screenshot, fix anything that's wrong, then add it to the box.",
	warnLayout: "Couldn't find the subskills and nature. Use the Pokémon details screen, scrolled so both are visible.",
	warnPokemon: "Pokémon not recognized: pick it below.",
	warnIconName: "The icon looks like {icon} but the name reads {name}: the icon was used, check the Pokémon.",
	warnForm: "Several forms share this name (e.g. sizes or event forms): check the right one is picked.",
	warnLevel: "Level not recognized.",
	warnSkillLevel: "Main skill level not recognized.",
	warnNature: "Nature not recognized.",
	warnIngredients: "Ingredients not recognized: pick them below.",
	warnIngredientsSeen: "Ingredients: pick the combination below (the screenshot shows {lv30} at Lv30 and {lv60} at Lv60).",
	warnSubskill: "{lv} subskill not recognized.",

	// Nature and subskill pickers
	statHelpSpeed: "Help speed",
	statEnergy: "Energy",
	statIngredients: "Ingredients",
	statSkill: "Skill",
	statExp: "EXP",
	increaseStat: "Increase {stat}",
	decreaseStat: "Decrease {stat}",
	neutral: "Neutral",
	noEffect: "no effect",
	pickStat: "Pick a {arrow} stat (still {name})",
	removeSubskill: "Remove {name}",
	clear: "Clear",

	// Dish
	dish: "Dish",
	dishType: "Type",
	recipe: "Recipe",
	yourPotSize: "Your pot size",
	optional: "optional",
	curry: "Curry & Stew",
	salad: "Salad",
	dessert: "Dessert & Drink",
	recipeBonus: "Recipe bonus {n}%",
	recipeOption: "{name} · {energy} energy · pot {pot}",
	potNeeded: "Pot size needed:",
	yourPot: "Your pot",
	withCampTicket: " (with Camp Ticket)",
	monSat: "Mon–Sat",
	sunday: "Sunday",
	tooSmallWeekday: "too small on Mon–Sat (fits on Sunday)",
	tooSmallEveryDay: "too small every day",
	colIngredient: "Ingredient",
	perMeal: "Per meal",
	perDayMeals: "Per day ({n} meals)",

	// Slot solver
	addOnBoxFirst: "Add Pokémon on the Box tab first.",
	shortfall: "Your whole box can't gather enough for {n} meals a day:",
	shortfallLine: "{ing}: {have} / {need} per day",
	shortfallNote:
		"Slots below are calculated for what your box can gather. Add more Pokémon that gather these to cover the rest.",
	currentTeam: "Current team",
	autoFill: "Auto-fill best team",
	slotsNeeded: "{n} slots needed",
	nPokemon: "{n} Pokémon",
	cantCover: "This team can't cover the dish",
	tastyChanceLine: "Extra Tasty chance: Mon–Sat **{wd}** (×{wm} dish strength) · Sunday **{sd}** (×{sm})",
	moreThanTeam: "More than {n} Pokémon: this dish can't be fully covered with one team.",
	slotHelp:
		'"Slots needed" counts each Pokémon by the share of its output the dish needs. A Pokémon at 80% means 20% of its ingredients are extra. Pinned Pokémon always count as a full slot. **Helping Bonus** makes everyone else help 5% faster for each slot its Pokémon fill, and is counted in the slots needed and the yields of the team. **Extra Tasty**: for Pokémon whose skill raises the Extra Tasty chance (Tasty Chance S, Bulk Up, Mystical Fire), the extra dish strength they bring, in slots: 0.50 means as much dish strength as half a slot of ingredients. Shown for Mon–Sat (×2 dishes) and Sunday (×3 dishes).',
	bench: "Bench",
	benchHelp:
		"**Saves (current team)**: slots saved by adding it to the team above; the list is sorted by this. **Saves (vs. best without it)**: best team from your whole box without it, minus the best team with it. This one doesn't depend on how the current team is arranged. **Extra Tasty**: the extra dish strength it would add, in slots (Mon–Sat / Sunday). The list is sorted by slots saved plus the weekly Extra Tasty value.",
	colSlotUsed: "Slot used",
	colExtraTasty: "Extra Tasty (Mon–Sat / Sun)",
	colExtraTastyShort: "Tasty",
	pin: "Pin",
	toBench: "To bench",
	toTeam: "To team",
	notNeeded: "0 (not needed)",
	totalNeeded: "Total / needed",
	makesPossible: "Makes it possible",
	coverageGain: "+{n} coverage",
	essential: "Essential",
	allOnTeam: "Every Pokémon in your box is on the team.",
	savesCurrent: "Saves (current team)",
	savesVsBest: "Saves (vs. best without it)",
	savesCurrentShort: "Saves",
	savesVsBestShort: "vs. best",
	replaces: "Replaces",
	weeklyAverageSlots: "Weekly average: {n} slots",

	// Energy solver
	island: "Island",
	favoriteBerries: "Favorite berries (×2)",
	none: "None",
	greengrassChoose: "Greengrass Isle (choose 3)",
	allBerries: "All berries",
	islandBonus: "Island bonus (%)",
	recipeLevel: "Recipe level",
	recipeLevelDown: "Recipe level down",
	recipeLevelUp: "Recipe level up",
	berryN: "Berry {n}",
	bestTeam: "Best team",
	strengthPerDay: "{n} strength / day",
	slotsOf: "{used} / {total} slots",
	breakdown: "Berries {b} · skills {s} · dishes {d}",
	dishLineStart: "Dish: {per} per meal × {meals} meals × cooked",
	dishLineEnd: "of meals × Extra Tasty ×{mult} (weekly average)",
	energyIsSimulated: "Energy is simulated: it drains during the day.",
	healersRestore: "This team's healers restore about **{n} energy per member per day**, which is included below.",
	noTeamHealer: "No healer on this team restores the whole team's energy.",
	energyFullNote: "Energy is always full, so healers add nothing. Switch Energy to Simulated at the top to count them.",
	colBerries: "Berries",
	colSkill: "Skill",
	colWithoutIt: "Without it",
	colBestWithIt: "Best team with it",
	colBestWithItShort: "With it",
	tagExtraTasty: "Extra Tasty",
	tagHealer: "Healer",
	tagHelpingBonus: "Helping Bonus",
	helpingBonusLine:
		"Counts Helping Bonus: its Pokémon fill {n} slots, so everyone else helps up to {pct} faster (at most 35% with speed subskills).",
	tagExcluded: "excluded",
	exclude: "Exclude",
	forceIn: "Force in",
	allow: "Allow",
	energyTeamHelp:
		"**Slot used**: the share of the time a Pokémon is on the team, as in the slot solver. Shares add up to at most {n} slots, so more than {n} Pokémon can take part by swapping, e.g. two gatherers at 0.50 each when the dish only needs half of each one's ingredients. Berries, skill and ingredients columns are per full day on the team; totals are weighted by slot used. Extra Tasty Pokémon and healers are tried at 0, ½ or a full slot. **Helping Bonus** makes everyone else help 5% faster for each slot its Pokémon fill, and is counted in the columns and totals. The team is re-optimised whenever something changes: **Pin** gives a Pokémon a full slot, **Exclude** keeps it off. **Without it**: strength per day of the best team without this Pokémon, minus this team's.",
	energyBenchHelp:
		"**Best team with it**: strength per day of the best team that gives this Pokémon a full slot, minus the best team's. Sorted by this.",
	swapPartner: "Swap partner",
	swapNoTasty:
		"No Pokémon in your box raises the Extra Tasty chance (Tasty Chance S, Bulk Up, Mystical Fire), so there is nothing to swap by Extra Tasty bonus.",
	swapHelp:
		"Two Pokémon share one slot, and the other {n} slots go to the best team without them. The two are swapped after every meal, depending on the Extra Tasty chance shown on the cooking screen: the Extra Tasty Pokémon while the chance is low, the partner once it's high. The bonus from skills carries over until an Extra Tasty dish resets it, so once it's high, more skill triggers are mostly wasted. Assumes three equal 8-hour windows, swapping at night too, items collected before each swap, and no other effect of swapping (energy, skill chance progress).",
	extraTastyPokemon: "Extra Tasty Pokémon",
	onTeamSuffix: " (on team)",
	partner: "Partner",
	pickPartner: "Pick a partner.",
	ruleAlways: "Always {name}",
	ruleWhile: "{name} while chance ≤ {wd} (Sun {sd})",
	ruleOtherwise: ", otherwise {name}",
	vsBestTeam: "vs. the best team",
	onTeamShare: "{name} on the team {n} of the time",
	swapTasty: "Extra Tasty Mon–Sat {wd}, Sunday {sd}",
	shareSlot: "the two share {n} of a slot",
	allThresholds: "All thresholds",
	colRule: "Rule",
	colOnTeam: "{name} on team",
	colCooked: "Cooked",
	colStrengthPerDay: "Strength / day",
	colVsBest: "vs. best team",
};

export type Key = keyof typeof en;

const zh: Record<Key, string> = {
	appTitle: "寶睡廚神",
	pageTitle: "寶睡廚神 – 寶可夢睡眠料理隊伍計算機",
	subtitle: "你的寶可夢需要幾個隊伍名額，才能供應一道料理每天 3 餐的食材？",
	language: "語言",
	tabBox: "寶可夢盒 ({n})",
	tabEnergy: "能量最佳化",
	tabSlots: "名額最佳化",
	inventoryLimit: "持有上限",
	inventoryLimitHint: "（關閉：不會持有溢出）",
	campTicket: "好露營券",
	campTicketHint: "（幫忙速度與持有上限 ×1.2）",
	energy: "活力",
	energyFull: "總是全滿",
	energySimulated: "模擬（會消耗；回復技能可回復）",
	sleepScore: "睡眠分數",
	sleepScoreHint: "（100 = 睡 8.5 小時；0 = 不睡）",
	finalEvolution: "最終進化",
	finalEvolutionHint: "（寶可夢盒的數值與求解都以最終進化型態計算；伊布等有分支進化的維持原樣）",
	maxSubSkillSeeds: "副技能種子用滿",
	maxSubSkillSeedsHint: "（已解鎖的副技能都以盡量升級 S→M→L 計算，不會升成已有的副技能）",
	seededSubSkill: "{name}（副技能種子：原為 {from}）",
	levelScaling: "等級模擬",
	levelScalingOff: "關閉",
	levelScalingHint: "（寶可夢盒的數值與求解都把等級較低的寶可夢視為此等級）",
	footerData: "寶可夢資料與食材模型來自",
	footerRecipes: "食譜來自",
	footerIcons: "寶可夢圖示來自",
	privacyPolicy: "隱私權政策",
	footerAssumptions:
		"睡眠分數決定睡多久（100 = 8.5 小時，0 = 完全不睡）：睡眠中不會收取持有的物品，模擬活力時也是在睡眠中回復活力。活力「總是全滿」時，每隻寶可夢整天都以最快速度幫忙。「模擬」使用 pokesleep-tool 的活力模型（清醒時消耗，睡眠中回復）；在寶可夢盒分頁與名額最佳化中，每隻寶可夢只會被自己的技能回復，能量最佳化則會計入隊伍中的回復技能（活力全體療癒回復全隊、活力療愈隨機回復一隻、活力填充只回復自己）。兩種最佳化都計入幫手獎勵（擁有它的寶可夢每佔一個名額，其他隊友快 5%）。開啟持有上限時，清醒時每 3 小時收取一次，睡眠中不收取。主技能獲得的食材（食材獲取、食材精選、健美）以期望值計算，隨機食材平均分配；複製其他技能的技能不計入。尚不支援幻之寶可夢。能量最佳化與名額最佳化一樣共用 5 個名額（只在隊伍中一部分時間的寶可夢只佔一部分名額），只計算樹果、能量類技能（能量填充、樹果遽增、幫手支援、幫手加速等，數值依 pokesleep-tool 估算）與目標料理：料理用不到的食材與鍋中額外加入的食材都不計入，食材不足以做出這道料理的那一餐算作 0。",
	footerRecipeNames: "食譜中文名稱取自神奇寶貝百科（52poke）。",

	addPokemon: "新增寶可夢",
	addPokemonButton: "＋ 新增寶可夢",
	settings: "設定",
	howToRead: "說明",
	addPokemonShort: "＋ 新增",
	close: "關閉",
	editPokemon: "編輯寶可夢",
	pokemon: "寶可夢",
	typeToSearch: "輸入以搜尋",
	nicknameOptional: "暱稱（選填）",
	nicknamePlaceholder: "例如：穿山王 幫忙速度M",
	level: "等級",
	ingredientsCombo: "食材（Lv1 / Lv30 / Lv60）",
	mainSkillLevel: "主技能（{skill}）等級",
	mainSkillLevelNoSkill: "主技能等級",
	natureField: "性格（選一個 ▲ 和一個 ▼）",
	subskillsField: "副技能（依序點選：Lv10 → 25 → 50 → 70 → 80）",
	saveChanges: "儲存變更",
	addToBox: "加入寶可夢盒",
	cancel: "取消",
	yourBox: "你的寶可夢盒",
	sortBy: "排序",
	sortAdded: "加入順序",
	sortDex: "圖鑑編號",
	sortLevel: "等級",
	sortName: "名稱",
	sortRating: "稀有度",
	sortRank: "排名",
	sortReverse: "反向排序",
	filterType: "屬性",
	filterIngredient: "食材（已解鎖）",
	filterAll: "全部",
	filterHelp: "點一個只顯示它，再點其他的可加選，再點一次取消；「全部」顯示所有寶可夢。",
	filterShowing: "顯示 {n} / {total} 隻寶可夢。",
	noMatches: "沒有符合篩選條件的寶可夢。",
	emptyBox: "還沒有寶可夢。請新增可能放進隊伍的寶可夢。",
	colLv: "Lv",
	colIngredients: "食材",
	colSkillLv: "技能等級",
	colSkillLvShort: "技能",
	colNature: "性格",
	colSubskills: "副技能",
	colIngPerDay: "每日食材",
	colRating: "稀有度",
	ratingPending: "稀有度計算中…",
	colRank: "排名",
	rankStrength: "能量",
	rankIngredient: "食材：{ing}",
	rankIngredientStrength: "它收集的所有食材合計食材能量：每日 {n}。",
	rankSkill: "技能：{skill}",
	rankUnitStrength: "能量",
	rankUnitSkill: "以技能本身的單位計算：活力、大成功機率、夢之碎片…",
	rankTooltip:
		"每日 {value}（{unit}）；中位數為 {median}。\n與這個類別中 {species} 種最終進化寶可夢的隨機結果比較，以 Lv80、使用副技能種子、標準設定（不是你的設定）計算。",
	roleStrength: "能量（樹果＋技能）",
	roleIngredients: "食材（含技能）",
	roleHybrid: "食材＋技能（各半）",
	roleSupport: "技能發動次數",
	roleIngredientOne: "食材：{ing}",
	roleHybridOne: "{ing}＋技能（各半）",
	ratingIngredient: "以最擅長的食材「{ing}」排名，與任何含有該食材的組合的隨機結果比較（對它最好的組合：{combo}）。",
	ratingTop: "前 {pct}",
	ratingOdds: "每 {n} 次有 1 次更好",
	ratingOddsNone: "每 {n} 次不到 1 次更好",
	ratingOddsShare: "{pct} 的結果更好",
	ratingTooltip:
		"評分依據：{role}\n在這隻寶可夢 Lv80 的隨機性格與副技能中（任意性格與 5 個副技能，機率相同；以 {n} 次隨機結果估計），{odds}。\n為最佳性格與副技能的 {ofBest}%：{best}\n{ingredientNote}{benchmark}\n{helpingBonus}",
	ratingHelpingBonus: "幫手獎勵也計入其他 4 隻隊友加快 5% 幫忙（相當於這隻寶可夢無副技能時產出的 +21%）。",
	ratingBenchmarkMax: "皆以使用副技能種子、主技能升到最高等級（Lv{n}）比較。",
	ratingBenchmarkOwn: "皆以使用副技能種子、主技能維持原等級加上技能等級提升比較（這隻為 Lv{n}）。",
	edit: "編輯",
	delete: "刪除",
	inclFromSkill: "（含技能 {n}）",
	fromSkill: "（來自技能）",

	syncTurnOn: "使用 Google 帳戶登入",
	syncTurnOff: "登出",
	syncNow: "立即同步",
	syncSyncing: "同步中…",
	syncSigningIn: "登入中…",
	syncSignedIn: "已登入",
	syncDenied: "Google 登入已取消。請重新登入並允許存取以進行同步。",
	syncNeedDrive: "同步需要 Google 雲端硬碟的存取權。請重新登入，並勾選允許此應用程式查看、建立及刪除其在你 Google 雲端硬碟中的設定資料的選項。",
	syncOn: "同步已開啟",
	syncedAt: "已同步 {time}",
	syncSignIn: "請重新登入以同步",
	syncHint: "使用 Google 帳戶登入後，寶可夢盒與設定會存放在你 Google 雲端硬碟的私人應用程式資料夾中，登入的每台裝置都會共用。",
	syncConflict: "上次同步後，這台裝置與 Google 雲端硬碟的資料都有變更。要保留哪一份？",
	syncKeepLocal: "保留這台裝置的資料",
	syncUseRemote: "使用 Google 雲端硬碟的資料",
	syncUseRemoteAt: "使用 Google 雲端硬碟的資料（{time} 儲存）",

	importTitle: "從截圖匯入",
	importHelp:
		"截取寶可夢的詳細資料畫面，往下捲到副技能和性格都看得到的位置。截圖只在你的裝置上讀取，不會上傳。第一次匯入時會下載文字辨識程式（約 6 MB）。",
	screenshotLang: "遊戲語言",
	chooseScreenshots: "選擇截圖",
	orDropPaste: "或把圖片拖曳、貼上到這裡",
	loadingOcr: "正在載入文字辨識程式… {pct}%",
	importEngineFailed: "無法載入文字辨識程式。請檢查網路連線後再試一次。",
	importWaiting: "等待中…",
	importReading: "讀取中…",
	importComplete: "全部讀取完成",
	importToCheck: "{n} 項需確認",
	importReview: "檢查",
	importDiscard: "捨棄",
	reviewPokemon: "檢查匯入的寶可夢",
	reviewHelp: "請對照截圖檢查下方的內容，修正錯誤後再加入寶可夢盒。",
	warnLayout: "找不到副技能和性格。請使用寶可夢的詳細資料畫面，並捲到兩者都看得到的位置。",
	warnPokemon: "無法辨識寶可夢：請在下方選擇。",
	warnIconName: "圖示看起來是{icon}，但名稱讀到{name}：已採用圖示，請確認寶可夢。",
	warnForm: "有好幾種樣子使用同一個名稱（例如尺寸或活動樣子）：請確認選到正確的那一種。",
	warnLevel: "無法辨識等級。",
	warnSkillLevel: "無法辨識主技能等級。",
	warnNature: "無法辨識性格。",
	warnIngredients: "無法辨識食材：請在下方選擇。",
	warnIngredientsSeen: "食材：請在下方選擇組合（截圖中 Lv30 是{lv30}，Lv60 是{lv60}）。",
	warnSubskill: "無法辨識 {lv} 的副技能。",

	statHelpSpeed: "幫忙速度",
	statEnergy: "活力",
	statIngredients: "食材",
	statSkill: "技能",
	statExp: "EXP",
	increaseStat: "提高{stat}",
	decreaseStat: "降低{stat}",
	neutral: "無影響",
	noEffect: "沒有性格帶來的特色",
	pickStat: "請選擇 {arrow} 項目（目前仍為 {name}）",
	removeSubskill: "移除{name}",
	clear: "清除",

	dish: "料理",
	dishType: "種類",
	recipe: "食譜",
	yourPotSize: "你的鍋子容量",
	optional: "選填",
	curry: "咖哩・濃湯",
	salad: "沙拉",
	dessert: "點心・飲料",
	recipeBonus: "食譜獎勵 {n}%",
	recipeOption: "{name}・能量 {energy}・鍋 {pot}",
	potNeeded: "所需鍋子容量：",
	yourPot: "你的鍋子",
	withCampTicket: "（含好露營券）",
	monSat: "週一至週六",
	sunday: "週日",
	tooSmallWeekday: "週一至週六太小（週日放得下）",
	tooSmallEveryDay: "每天都太小",
	colIngredient: "食材",
	perMeal: "每餐",
	perDayMeals: "每日（{n} 餐）",

	addOnBoxFirst: "請先在寶可夢盒分頁新增寶可夢。",
	shortfall: "整個寶可夢盒收集的食材不足以每天做 {n} 餐：",
	shortfallLine: "{ing}：每日 {have} / {need}",
	shortfallNote: "以下名額依你的寶可夢盒能收集的量計算。新增能收集這些食材的寶可夢即可補足。",
	currentTeam: "目前隊伍",
	autoFill: "自動填入最佳隊伍",
	slotsNeeded: "需要 {n} 個名額",
	nPokemon: "{n} 隻寶可夢",
	cantCover: "這個隊伍無法供應這道料理",
	tastyChanceLine: "大成功機率：週一至週六 **{wd}**（料理能量 ×{wm}）· 週日 **{sd}**（×{sm}）",
	moreThanTeam: "超過 {n} 隻寶可夢：一個隊伍無法完全供應這道料理。",
	slotHelp:
		"「需要的名額」依料理需要每隻寶可夢產出的比例計算。80% 表示牠有 20% 的食材是多餘的。固定的寶可夢一律算一整個名額。**幫手獎勵**：擁有它的寶可夢每佔一個名額，其他隊友幫忙就快 5%，已計入需要的名額與隊伍的食材。**大成功**：主技能會提高大成功機率的寶可夢（料理成功S、健美、魔法火焰）帶來的額外料理能量，換算成名額：0.50 表示相當於半個名額食材的料理能量。分別顯示週一至週六（料理 ×2）與週日（料理 ×3）。",
	bench: "候補",
	benchHelp:
		"**節省（目前隊伍）**：加入上方隊伍可以節省的名額；清單依此排序。**節省（相較沒有牠的最佳隊伍）**：整個寶可夢盒中沒有牠的最佳隊伍，減去有牠的最佳隊伍。這一欄與目前隊伍的安排無關。**大成功**：牠會增加的料理能量，換算成名額（週一至六 / 週日）。清單依節省的名額加上每週大成功價值排序。",
	colSlotUsed: "使用名額",
	colExtraTasty: "大成功（週一至六 / 週日）",
	colExtraTastyShort: "大成功",
	pin: "固定",
	toBench: "移到候補",
	toTeam: "加入隊伍",
	notNeeded: "0（不需要）",
	totalNeeded: "合計 / 需要",
	makesPossible: "讓料理可行",
	coverageGain: "+{n} 覆蓋率",
	essential: "不可或缺",
	allOnTeam: "寶可夢盒中的寶可夢都已在隊伍中。",
	savesCurrent: "節省（目前隊伍）",
	savesVsBest: "節省（相較沒有牠的最佳隊伍）",
	savesCurrentShort: "節省",
	savesVsBestShort: "比最佳",
	replaces: "取代",
	weeklyAverageSlots: "每週平均：{n} 個名額",

	island: "島嶼",
	favoriteBerries: "喜歡的樹果（×2）",
	none: "無",
	greengrassChoose: "萌綠之島（選 3 種）",
	allBerries: "全部是喜歡的樹果",
	islandBonus: "營地獎勵（%）",
	recipeLevel: "食譜等級",
	recipeLevelDown: "降低食譜等級",
	recipeLevelUp: "提高食譜等級",
	berryN: "樹果 {n}",
	bestTeam: "最佳隊伍",
	strengthPerDay: "每日 {n} 能量",
	slotsOf: "{used} / {total} 個名額",
	breakdown: "樹果 {b} · 技能 {s} · 料理 {d}",
	dishLineStart: "料理：每餐 {per} × {meals} 餐 × 做出",
	dishLineEnd: "的餐數 × 大成功 ×{mult}（每週平均）",
	energyIsSimulated: "活力為模擬：白天會逐漸消耗。",
	healersRestore: "這個隊伍的回復技能每天為每位成員回復約 **{n} 活力**，已計入下方數值。",
	noTeamHealer: "這個隊伍沒有能回復全隊活力的寶可夢。",
	energyFullNote: "活力總是全滿，所以回復技能沒有效果。在上方把活力改為「模擬」即可計入。",
	colBerries: "樹果",
	colSkill: "技能",
	colWithoutIt: "沒有牠",
	colBestWithIt: "有牠的最佳隊伍",
	colBestWithItShort: "加入後",
	tagExtraTasty: "大成功",
	tagHealer: "回復",
	tagHelpingBonus: "幫手獎勵",
	helpingBonusLine: "已計入幫手獎勵：擁有它的寶可夢佔 {n} 個名額，其他隊友幫忙最多快 {pct}（與速度副技能合計最多 35%）。",
	tagExcluded: "已排除",
	exclude: "排除",
	forceIn: "強制加入",
	allow: "允許",
	energyTeamHelp:
		"**使用名額**：寶可夢在隊伍中的時間比例，與名額最佳化相同。所有比例加起來最多 {n} 個名額，所以透過輪替可以有超過 {n} 隻寶可夢參與，例如料理只需要兩隻收集者各一半的食材時，兩隻各 0.50。樹果、技能與食材欄位是整天都在隊伍中的數值；合計依使用名額加權。大成功寶可夢與回復寶可夢會嘗試 0、½ 或一整個名額。**幫手獎勵**：擁有它的寶可夢每佔一個名額，其他隊友幫忙就快 5%，已計入各欄位與合計。有任何變更時會重新最佳化：**固定**讓寶可夢佔一整個名額，**排除**讓牠不上場。**沒有牠**：沒有這隻寶可夢的最佳隊伍每日能量，減去這個隊伍的。",
	energyBenchHelp: "**有牠的最佳隊伍**：讓這隻寶可夢佔一整個名額的最佳隊伍每日能量，減去最佳隊伍的。清單依此排序。",
	swapPartner: "輪替搭檔",
	swapNoTasty: "寶可夢盒中沒有能提高大成功機率的寶可夢（料理成功S、健美、魔法火焰），所以無法依大成功加成輪替。",
	swapHelp:
		"兩隻寶可夢共用一個名額，其他 {n} 個名額給沒有牠們的最佳隊伍。每次料理後依料理畫面顯示的大成功機率輪替：機率低時用大成功寶可夢，機率高時改用搭檔。技能累積的加成會保留到料理大成功才歸零，所以機率已經很高時，再發動技能多半是浪費。假設三段時間都是 8 小時、晚上也會輪替、輪替前會收取持有的物品，且輪替沒有其他影響（活力、技能發動進度）。",
	extraTastyPokemon: "大成功寶可夢",
	onTeamSuffix: "（在隊伍中）",
	partner: "搭檔",
	pickPartner: "請選擇搭檔。",
	ruleAlways: "總是用 {name}",
	ruleWhile: "機率 ≤ {wd}（週日 {sd}）時用 {name}",
	ruleOtherwise: "，否則用 {name}",
	vsBestTeam: "相較最佳隊伍",
	onTeamShare: "{name} 在隊伍中的時間 {n}",
	swapTasty: "大成功 週一至六 {wd}，週日 {sd}",
	shareSlot: "兩者共用 {n} 個名額",
	allThresholds: "所有門檻",
	colRule: "規則",
	colOnTeam: "{name} 在隊伍中",
	colCooked: "做出",
	colStrengthPerDay: "每日能量",
	colVsBest: "相較最佳隊伍",
};

const dictionaries: Record<Lang, Record<Key, string>> = { en, "zh-TW": zh };

/** UI text in the current language, with {name} placeholders filled in. */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
	const text = dictionaries[current][key] ?? en[key];
	return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** Like t(), but placeholders can be filled with elements (e.g. a Pokémon's label with icons). */
export function tRich(key: Key, vars: Record<string, ReactNode>): ReactNode {
	const text = dictionaries[current][key] ?? en[key];
	return text.split(/(\{\w+\})/).map((part, i) => {
		const name = /^\{(\w+)\}$/.exec(part)?.[1];
		return name && name in vars ? <Fragment key={i}>{vars[name]}</Fragment> : part;
	});
}

/** Renders text where **x** is bold. */
export function Rich(props: { text: string }): ReactNode {
	return props.text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
		part.startsWith("**") && part.endsWith("**") ? (
			<strong key={i}>{part.slice(2, -2)}</strong>
		) : (
			part
		),
	);
}

// ---- Game terms ----

type DataJson = {
	subskill: Record<string, string>;
	natures: Record<string, string>;
	types: Record<string, string>;
	ingredients: Record<string, string>;
};
const zhGame = zhData as unknown as DataJson;
const enGame = enData as unknown as DataJson;
const zhPokemonNames = (zhPokemons as { pokemons: Record<string, string> }).pokemons;
const zhSkillNames = (zhSkills as { skills: Record<string, { name?: string }> }).skills;
const zhAreas = (zhCommon as { area: string[] }).area;
const enAreas = [
	"Greengrass Isle",
	"Cyan Beach",
	"Taupe Hollow",
	"Snowdrop Tundra",
	"Lapis Lakeside",
	"Old Gold Power Plant",
	"Amber Canyon",
];

const zhOnly = (map: Record<string, string | undefined>, key: string) => (current === "zh-TW" ? map[key] : undefined);

/** Pokémon name in the current language (the stored name is always English). */
export function pokemonLabel(name: string): string {
	return zhOnly(zhPokemonNames, name) ?? name;
}

/** English Pokémon name for text typed in either language, if it names one of `names`. */
export function pokemonFromLabel(text: string, names: string[]): string | undefined {
	const trimmed = text.trim();
	return names.find((n) => n === trimmed || pokemonLabel(n) === trimmed);
}

export function ingredientLabel(name: string): string {
	return (current === "zh-TW" ? zhGame : enGame).ingredients[name] ?? name;
}

export function skillLabel(name: string): string {
	return (current === "zh-TW" ? zhSkillNames[name]?.name : undefined) ?? name;
}

export function subSkillLabel(name: string): string {
	return zhOnly(zhGame.subskill, name) ?? name;
}

export function natureLabel(name: string): string {
	return zhOnly(zhGame.natures, name) ?? name;
}

/** Berry type, e.g. "grass" → "Grass" / "草". */
export function typeLabel(type: string): string {
	return (current === "zh-TW" ? zhGame : enGame).types[type] ?? type;
}

/** Island name by pokesleep-tool field index (0 = Greengrass Isle … 6 = Amber Canyon). */
export function islandLabel(index: number): string {
	return (current === "zh-TW" ? zhAreas[index] : enAreas[index]) ?? enAreas[index] ?? "";
}

const zhRecipeNames = zhRecipes as Record<string, string>;

/** Recipe name in the current language. */
export function recipeLabel(recipe: { id: string; name: string }): string {
	return zhOnly(zhRecipeNames, recipe.id) ?? recipe.name;
}
