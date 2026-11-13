/**
 * UI language: English or Traditional Chinese.
 *
 * Game terms (Pokémon, skills, subskills, natures, berry types, ingredients, islands) come from
 * pokesleep-tool's translations. Recipe names stay in English: neither data source has them in Chinese.
 * The current language is a module-level value; App re-mounts the page when it changes.
 */
import type { ReactNode } from "react";
import enData from "../vendor/pokesleep-tool/i18n/en/data.json";
import zhCommon from "../vendor/pokesleep-tool/i18n/zh-TW/common.json";
import zhData from "../vendor/pokesleep-tool/i18n/zh-TW/data.json";
import zhPokemons from "../vendor/pokesleep-tool/i18n/zh-TW/pokemons.json";
import zhSkills from "../vendor/pokesleep-tool/i18n/zh-TW/skills.json";

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
	appTitle: "Dish Team Calculator",
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
	footerData: "Pokémon data and ingredient model from",
	footerRecipes: "Recipes from",
	footerAssumptions:
		"The sleep score sets how long you sleep (100 = 8.5 hours, 0 = not at all): while asleep the bag isn't emptied, and with simulated energy that's when energy recovers. Energy \"Always full\" keeps every Pokémon at full help speed all day. \"Simulated\" uses pokesleep-tool's energy model (energy drains while awake and recovers during sleep); on the Box tab and in the slot solver each Pokémon is healed only by its own skill, while the energy solver also counts the team's healers (Energy for Everyone heals everyone, Energizing Cheer one random member, Charge Energy itself). No Helping Bonus. With the inventory limit on, ingredients are collected every 3 hours while awake and not while asleep. Ingredients from main skills (Ingredient Magnet, Ingredient Draw, Bulk Up) are counted as an expected average, with random ingredients split evenly; skills that copy other skills are not counted. Mythical Pokémon are not supported yet. The energy solver shares 5 slots like the slot solver (a Pokémon on the team part of the time uses part of a slot) and counts berries, strength skills (Charge Strength, Berry Burst, Extra Helpful, Helper Boost and similar, as estimated by pokesleep-tool) and the target dish only: ingredients the dish doesn't use, extra ingredients in the pot and Helping Bonus add nothing, and a meal without enough ingredients for the dish counts as 0.",
	footerRecipeNames: "",

	// Box
	addPokemon: "Add Pokémon",
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
	emptyBox: "No Pokémon yet. Add the ones you might put on your team.",
	colLv: "Lv",
	colIngredients: "Ingredients",
	colSkillLv: "Skill Lv",
	colNature: "Nature",
	colSubskills: "Subskills",
	colIngPerDay: "Ingredients / day",
	edit: "Edit",
	delete: "Delete",
	inclFromSkill: "(incl. {n} from skill)",
	fromSkill: "(from skill)",
	skillRandom: "Skill: {n} random ingredients/day, split over {k} kinds",

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
		'"Slots needed" counts each Pokémon by the share of its output the dish needs. A Pokémon at 80% means 20% of its ingredients are extra. Pinned Pokémon always count as a full slot. **Extra Tasty**: for Pokémon whose skill raises the Extra Tasty chance (Tasty Chance S, Bulk Up, Mystical Fire), the extra dish strength they bring, in slots: 0.50 means as much dish strength as half a slot of ingredients. Shown for Mon–Sat (×2 dishes) and Sunday (×3 dishes).',
	bench: "Bench",
	benchHelp:
		"**Saves (current team)**: slots saved by adding it to the team above; the list is sorted by this. **Saves (vs. best without it)**: best team from your whole box without it, minus the best team with it. This one doesn't depend on how the current team is arranged. **Extra Tasty**: the extra dish strength it would add, in slots (Mon–Sat / Sunday). The list is sorted by slots saved plus the weekly Extra Tasty value.",
	colSlotUsed: "Slot used",
	colExtraTasty: "Extra Tasty (Mon–Sat / Sun)",
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
	tagExtraTasty: "Extra Tasty",
	tagHealer: "Healer",
	tagExcluded: "excluded",
	exclude: "Exclude",
	forceIn: "Force in",
	allow: "Allow",
	energyTeamHelp:
		"**Slot used**: the share of the time a Pokémon is on the team, as in the slot solver. Shares add up to at most {n} slots, so more than {n} Pokémon can take part by swapping, e.g. two gatherers at 0.50 each when the dish only needs half of each one's ingredients. Berries, skill and ingredients columns are per full day on the team; totals are weighted by slot used. Extra Tasty Pokémon and healers are tried at 0, ½ or a full slot. The team is re-optimised whenever something changes: **Pin** gives a Pokémon a full slot, **Exclude** keeps it off. **Without it**: strength per day of the best team without this Pokémon, minus this team's.",
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
	appTitle: "料理隊伍計算機",
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
	footerData: "寶可夢資料與食材模型來自",
	footerRecipes: "食譜來自",
	footerAssumptions:
		"睡眠分數決定睡多久（100 = 8.5 小時，0 = 完全不睡）：睡眠中不會收取持有的物品，模擬活力時也是在睡眠中回復活力。活力「總是全滿」時，每隻寶可夢整天都以最快速度幫忙。「模擬」使用 pokesleep-tool 的活力模型（清醒時消耗，睡眠中回復）；在寶可夢盒分頁與名額最佳化中，每隻寶可夢只會被自己的技能回復，能量最佳化則會計入隊伍中的回復技能（活力全體療癒回復全隊、活力療愈隨機回復一隻、活力填充只回復自己）。不計幫手獎勵。開啟持有上限時，清醒時每 3 小時收取一次，睡眠中不收取。主技能獲得的食材（食材獲取、食材精選、健美）以期望值計算，隨機食材平均分配；複製其他技能的技能不計入。尚不支援幻之寶可夢。能量最佳化與名額最佳化一樣共用 5 個名額（只在隊伍中一部分時間的寶可夢只佔一部分名額），只計算樹果、能量類技能（能量填充、樹果遽增、幫手支援、幫手加速等，數值依 pokesleep-tool 估算）與目標料理：料理用不到的食材、鍋中額外加入的食材與幫手獎勵都不計入，食材不足以做出這道料理的那一餐算作 0。",
	footerRecipeNames: "食譜名稱目前只有英文。",

	addPokemon: "新增寶可夢",
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
	emptyBox: "還沒有寶可夢。請新增可能放進隊伍的寶可夢。",
	colLv: "Lv",
	colIngredients: "食材",
	colSkillLv: "技能等級",
	colNature: "性格",
	colSubskills: "副技能",
	colIngPerDay: "每日食材",
	edit: "編輯",
	delete: "刪除",
	inclFromSkill: "（含技能 {n}）",
	fromSkill: "（來自技能）",
	skillRandom: "技能：每日 {n} 個隨機食材，平均分到 {k} 種",

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
		"「需要的名額」依料理需要每隻寶可夢產出的比例計算。80% 表示牠有 20% 的食材是多餘的。固定的寶可夢一律算一整個名額。**大成功**：主技能會提高大成功機率的寶可夢（料理成功S、健美、魔法火焰）帶來的額外料理能量，換算成名額：0.50 表示相當於半個名額食材的料理能量。分別顯示週一至週六（料理 ×2）與週日（料理 ×3）。",
	bench: "候補",
	benchHelp:
		"**節省（目前隊伍）**：加入上方隊伍可以節省的名額；清單依此排序。**節省（相較沒有牠的最佳隊伍）**：整個寶可夢盒中沒有牠的最佳隊伍，減去有牠的最佳隊伍。這一欄與目前隊伍的安排無關。**大成功**：牠會增加的料理能量，換算成名額（週一至六 / 週日）。清單依節省的名額加上每週大成功價值排序。",
	colSlotUsed: "使用名額",
	colExtraTasty: "大成功（週一至六 / 週日）",
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
	tagExtraTasty: "大成功",
	tagHealer: "回復",
	tagExcluded: "已排除",
	exclude: "排除",
	forceIn: "強制加入",
	allow: "允許",
	energyTeamHelp:
		"**使用名額**：寶可夢在隊伍中的時間比例，與名額最佳化相同。所有比例加起來最多 {n} 個名額，所以透過輪替可以有超過 {n} 隻寶可夢參與，例如料理只需要兩隻收集者各一半的食材時，兩隻各 0.50。樹果、技能與食材欄位是整天都在隊伍中的數值；合計依使用名額加權。大成功寶可夢與回復寶可夢會嘗試 0、½ 或一整個名額。有任何變更時會重新最佳化：**固定**讓寶可夢佔一整個名額，**排除**讓牠不上場。**沒有牠**：沒有這隻寶可夢的最佳隊伍每日能量，減去這個隊伍的。",
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
