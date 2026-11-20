// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BoxEntry } from "../core/box";
import type { SubSkillType } from "../vendor/pokesleep-tool/util/SubSkill";
import App from "./App";

const entry = (
	id: string,
	pokemonName: string,
	ingredient: BoxEntry["ingredient"],
	skillLevel?: number,
): BoxEntry => ({ id, pokemonName, level: 60, ingredient, nature: "Serious", subSkills: {}, skillLevel });

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const sections = () => [...document.querySelectorAll("section.card")] as HTMLElement[];
const section = (title: string) => {
	const s = sections().find((x) => x.querySelector("h2")?.textContent === title);
	if (!s) throw new Error(`section ${title} not found`);
	return s;
};
const rowOf = (container: HTMLElement, label: string) => {
	const row = [...container.querySelectorAll("tbody tr")].find((r) => r.textContent?.startsWith(label));
	if (!row) throw new Error(`row ${label} not found`);
	return row as HTMLElement;
};

function renderSolver(box: BoxEntry[]) {
	localStorage.setItem("pscalc.box.v1", JSON.stringify(box));
	render(<App />);
	fireEvent.click(screen.getByText("Slot solver"));
}

test("Scald Chunky Salad: auto team, bench ranking, and moving Sandslash onto the team", () => {
	renderSolver([
		entry("sandslash", "Sandslash", "ABC", 6),
		entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
		entry("gourgeist2", "Gourgeist (Jumbo)", "AAA"),
		entry("meow", "Meowscarada", "AAA"),
		entry("meow2", "Meowscarada", "AAA"),
		entry("drag", "Dragonite", "ABB"),
		entry("spirit", "Spiritomb", "AAA"),
		entry("amoon", "Amoonguss", "AAA"),
		entry("quag", "Quagsire", "AAA"),
	]);
	expect(screen.getByText(/Pot size needed/).textContent).toContain("95");

	const team = section("Current team");
	expect(team.textContent).toMatch(/\d+\.\d\d slots needed/);
	expect(team.textContent).toContain("Sandslash"); // skill Lv6 Sandslash is worth a slot here

	// Move Sandslash to the bench. The remaining team was built around it, so adding it back
	// either makes the dish possible again or saves slots.
	fireEvent.click(within(rowOf(team, "Sandslash")).getByLabelText("To bench"));
	const bench = section("Bench");
	expect(rowOf(bench, "Sandslash").textContent).toMatch(/Makes it possible|−\d\.\d\d/);
	// Independent of the current team: skill Lv6 Sandslash saves about 0.47 slots vs. the best team without it.
	const cells = rowOf(bench, "Sandslash").querySelectorAll("td");
	// Columns end with: Saves (current team), Saves (vs. best), Extra Tasty, Replaces, button.
	expect(Number(cells[cells.length - 4].textContent?.replace("−", ""))).toBeCloseTo(0.47, 1);

	// And back to the team.
	fireEvent.click(within(rowOf(bench, "Sandslash")).getByLabelText("To team"));
	expect(rowOf(section("Current team"), "Sandslash")).toBeTruthy();
});

test("box shortfall is reported and pinning counts a full slot", () => {
	renderSolver([entry("spirit", "Spiritomb", "AAA"), entry("meow", "Meowscarada", "AAA")]);
	expect(screen.getByText(/whole box can't gather enough/)).toBeTruthy();
	const before = section("Current team").textContent;
	expect(before).toMatch(/\d+\.\d\d slots needed/);
	fireEvent.click(within(rowOf(section("Current team"), "Spiritomb")).getByLabelText("Pin"));
	expect(JSON.parse(localStorage.getItem("pscalc.pinned") ?? "[]")).toEqual(["spirit"]);
});

test("adds a Pokémon from the pop-up the Add Pokémon button opens", () => {
	render(<App />);
	// The screenshot import and the form only appear in the pop-up.
	expect(screen.queryByPlaceholderText("Type to search")).toBeNull();
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByText("+ Add Pokémon"));
	const dialog = within(screen.getByRole("dialog", { name: "Add Pokémon" }));
	expect(dialog.getByText("Import from screenshots")).toBeTruthy();
	fireEvent.change(dialog.getByPlaceholderText("Type to search"), { target: { value: "Sandslash" } });
	fireEvent.click(dialog.getByText("Add to box"));
	expect(screen.getByText("Box (1)")).toBeTruthy();
	expect(JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]")[0].pokemonName).toBe("Sandslash");
	// Adding closes it.
	expect(screen.queryByRole("dialog")).toBeNull();

	// Cancel, Esc and the close button close it without adding anything.
	fireEvent.click(screen.getByText("+ Add Pokémon"));
	fireEvent.click(screen.getByText("Cancel"));
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByText("+ Add Pokémon"));
	fireEvent.keyDown(document, { key: "Escape" });
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByText("+ Add Pokémon"));
	fireEvent.click(screen.getByLabelText("Close"));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByText("Box (1)")).toBeTruthy();

	// The button is in the tab bar, last; from a solver tab it goes to the Box tab and opens the pop-up.
	const nav = document.querySelector("nav") as HTMLElement;
	// Shown as "+ Add" on phones (CSS picks one of the two labels).
	expect([...nav.querySelectorAll("button")].at(-1)?.querySelector(".label-long")?.textContent).toBe("+ Add Pokémon");
	fireEvent.click(screen.getByText("Energy solver"));
	fireEvent.click(screen.getByText("+ Add Pokémon"));
	expect(screen.getByRole("dialog", { name: "Add Pokémon" })).toBeTruthy();
	expect(section("Your box")).toBeTruthy();
});

test("the edit button opens the pop-up with the Pokémon, without the screenshot import", () => {
	localStorage.setItem("pscalc.box.v1", JSON.stringify([entry("sandslash", "Sandslash", "ABC", 6)]));
	render(<App />);
	fireEvent.click(screen.getByLabelText("Edit"));
	const dialog = within(screen.getByRole("dialog", { name: "Edit Pokémon" }));
	expect((dialog.getByPlaceholderText("Type to search") as HTMLInputElement).value).toBe("Sandslash");
	expect(dialog.queryByText("Import from screenshots")).toBeNull();
	fireEvent.change(dialog.getByLabelText("Level"), { target: { value: "65" } });
	fireEvent.click(dialog.getByText("Save changes"));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]")[0].level).toBe(65);
});

test("key level buttons set the level and the number box still accepts any level", () => {
	render(<App />);
	fireEvent.click(screen.getByText("+ Add Pokémon"));
	const form = within(section("Add Pokémon"));
	const level = form.getByLabelText("Level") as HTMLInputElement;
	fireEvent.click(form.getByRole("button", { name: "60" }));
	expect(level.value).toBe("60");
	expect(form.getByRole("button", { name: "60" }).getAttribute("aria-pressed")).toBe("true");
	fireEvent.change(level, { target: { value: "61" } });
	expect(level.value).toBe("61");
	fireEvent.click(form.getByRole("button", { name: "80" }));
	expect(level.value).toBe("80");
});

test("inventory limit, camp ticket and energy settings are saved", () => {
	render(<App />);
	const limit = screen.getByLabelText(/Inventory limit/) as HTMLInputElement;
	const ticket = screen.getByLabelText(/Good Camp Ticket/) as HTMLInputElement;
	const energy = screen.getByLabelText(/^Energy/) as HTMLSelectElement;
	expect(limit.checked).toBe(true);
	expect(ticket.checked).toBe(false);
	expect(energy.value).toBe("full");
	const sleep = screen.getByLabelText(/Sleep score/) as HTMLInputElement;
	expect(sleep.value).toBe("0");
	fireEvent.change(sleep, { target: { value: "85" } });
	fireEvent.click(limit);
	fireEvent.click(ticket);
	fireEvent.change(energy, { target: { value: "simulated" } });
	expect(JSON.parse(localStorage.getItem("pscalc.yieldOptions") ?? "{}")).toEqual({
		inventoryLimit: false,
		campTicket: true,
		energy: "simulated",
		sleepScore: 85,
	});
});

test("Energy solver: with simulated energy, a healer's healing is counted for the whole team", () => {
	const box = [
		entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
		entry("meow", "Meowscarada", "AAA"),
		entry("drag", "Dragonite", "ABB"),
		entry("spirit", "Spiritomb", "AAA"),
		entry("sylveon", "Sylveon", "AAA", 6),
	];
	localStorage.setItem("pscalc.box.v1", JSON.stringify(box));
	localStorage.setItem("pscalc.yieldOptions", JSON.stringify({ inventoryLimit: true, campTicket: false, energy: "simulated", sleepScore: 100 }));
	render(<App />);
	fireEvent.click(screen.getByText("Energy solver"));
	const team = section("Best team");
	expect(team.textContent).toMatch(/healers restore about \d+ energy per member per day/);
	expect(rowOf(team, "Sylveon").textContent).toContain("Healer");
	const berries = (label: string) => {
		const cells = [...rowOf(section("Best team"), label).querySelectorAll("td")];
		return Number((cells[cells.length - 5].textContent ?? "").replace(/,/g, ""));
	};
	const healedGourgeist = berries("Gourgeist");
	// Excluding Sylveon leaves the others unhealed: Gourgeist's berries drop.
	fireEvent.click(within(rowOf(team, "Sylveon")).getByLabelText("Exclude"));
	expect(section("Best team").textContent).toContain("No healer on this team");
	expect(berries("Gourgeist")).toBeLessThan(healedGourgeist);
});

test("Extra Tasty: a Tasty Chance Pokémon on the bench shows slot-equivalents for Mon–Sat and Sunday", () => {
	renderSolver([
		entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
		entry("meow", "Meowscarada", "AAA"),
		entry("drag", "Dragonite", "ABB"),
		entry("spirit", "Spiritomb", "AAA"),
		entry("amoon", "Amoonguss", "AAA"),
		entry("swampert", "Swampert", "AAA", 6),
	]);
	expect(section("Current team").textContent).toMatch(/Extra Tasty chance: Mon–Sat 10% .* Sunday 30%/);
	const cells = rowOf(section("Bench"), "Swampert").querySelectorAll("td");
	const tastyCell = cells[cells.length - 3].textContent ?? "";
	const [weekday, sunday] = tastyCell.split("/").map((x) => Number(x.trim().replace("+", "")));
	expect(weekday).toBeGreaterThan(0);
	expect(sunday).toBeGreaterThan(weekday);

	// On the team it raises the team's Extra Tasty chance.
	fireEvent.click(within(rowOf(section("Bench"), "Swampert")).getByLabelText("To team"));
	expect(section("Current team").textContent).not.toMatch(/Mon–Sat 10% /);
});

test("pot size check shows Mon–Sat and doubled Sunday pot", () => {
	localStorage.setItem("pscalc.potSize", JSON.stringify(69));
	renderSolver([entry("spirit", "Spiritomb", "AAA")]);
	const text = screen.getByText(/Pot size needed/).textContent ?? "";
	expect(text).toContain("Mon–Sat 69");
	expect(text).toContain("Sunday 138");
	expect(text).toContain("fits on Sunday");
});

test("Energy solver: uses at most 5 slots for the shared dish and re-optimises on Exclude", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			entry("sandslash", "Sandslash", "ABC", 6),
			entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
			entry("gourgeist2", "Gourgeist (Jumbo)", "AAA"),
			entry("meow", "Meowscarada", "AAA"),
			entry("meow2", "Meowscarada", "AAA"),
			entry("drag", "Dragonite", "ABB"),
			entry("spirit", "Spiritomb", "AAA"),
			entry("amoon", "Amoonguss", "AAA"),
			entry("quag", "Quagsire", "AAA"),
			entry("raichu", "Raichu", "AAA", 6),
		]),
	);
	localStorage.setItem("pscalc.energySettings", JSON.stringify({ favorites: "none", fieldBonus: 0, recipeLevel: 30 }));
	render(<App />);
	fireEvent.click(screen.getByText("Energy solver"));
	expect(screen.getByText(/Pot size needed/).textContent).toContain("95"); // same dish as the slot solver

	const team = section("Best team");
	expect(team.textContent).toMatch(/[\d,]+ strength \/ day/);
	const rows = () => [...section("Best team").querySelectorAll("tbody tr:not(.total)")];
	const slotsUsed = rows().reduce((a, r) => {
		const cells = r.querySelectorAll("td");
		return a + Number(cells[cells.length - 3].textContent);
	}, 0);
	expect(slotsUsed).toBeLessThanOrEqual(5.02);
	expect(slotsUsed).toBeGreaterThan(4.9);
	expect(team.textContent).toMatch(/\d\.\d\d \/ 5 slots · \d+ Pokémon/);
	expect(rows().length + section("Bench").querySelectorAll("tbody tr").length).toBe(10);
	const total = () => Number((section("Best team").textContent?.match(/([\d,]+) strength \/ day/)?.[1] ?? "").replace(/,/g, ""));
	const before = total();

	// Excluding a member can only lower the total, and it moves to the bench.
	const first = rows()[0].querySelector("td:not(.icon-cell)")?.textContent ?? "";
	expect(first).not.toBe("");
	fireEvent.click(within(rows()[0] as HTMLElement).getByLabelText("Exclude"));
	expect(total()).toBeLessThanOrEqual(before);
	expect(rowOf(section("Bench"), first).textContent).toContain("excluded");
});

test("Energy solver: recipe level buttons and arrows", () => {
	localStorage.setItem("pscalc.box.v1", JSON.stringify([entry("spirit", "Spiritomb", "AAA")]));
	render(<App />);
	fireEvent.click(screen.getByText("Energy solver"));
	const input = screen.getByLabelText("Recipe level") as HTMLInputElement;
	// The level scaling control has buttons with the same numbers; use the recipe level field's.
	const field = within(input.closest(".field") as HTMLElement);
	expect(input.value).toBe("1");
	fireEvent.click(field.getByText("50"));
	expect(input.value).toBe("50");
	expect(field.getByText("50").getAttribute("aria-pressed")).toBe("true");
	fireEvent.click(screen.getByLabelText("Recipe level up"));
	expect(input.value).toBe("51");
	fireEvent.click(screen.getByLabelText("Recipe level down"));
	fireEvent.click(screen.getByLabelText("Recipe level down"));
	expect(input.value).toBe("49");
	fireEvent.click(field.getByText("70"));
	expect((screen.getByLabelText("Recipe level up") as HTMLButtonElement).disabled).toBe(true);
	expect(JSON.parse(localStorage.getItem("pscalc.energySettings") ?? "{}").recipeLevel).toBe(70);
});

test("Energy solver: swap partner suggests a bonus threshold for Dedenne vs Sceptile", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
			entry("meow", "Meowscarada", "AAA"),
			entry("drag", "Dragonite", "ABB"),
			entry("spirit", "Spiritomb", "AAA"),
			entry("dedenne", "Dedenne", "AAA", 6),
			entry("sceptile", "Sceptile", "AAA", 6),
		]),
	);
	localStorage.setItem("pscalc.energySettings", JSON.stringify({ favorites: "none", fieldBonus: 0, recipeLevel: 50 }));
	render(<App />);
	fireEvent.click(screen.getByText("Energy solver"));
	const card = section("Swap partner");
	const tastyButton = within(card).getByLabelText("Extra Tasty Pokémon");
	expect(tastyButton.textContent).toMatch(/^Dedenne Lv60/);
	// The dropdowns show the same icons as elsewhere.
	expect(tastyButton.querySelector(".ing-icons img")).toBeTruthy();
	expect(tastyButton.querySelector("img.poke-icon")?.getAttribute("src")).toMatch(/dedenne/);
	// The default partner is the one giving the best result; pick Sceptile to compare with the berry Pokémon.
	fireEvent.click(within(card).getByLabelText(/Partner/));
	fireEvent.click(within(card).getByRole("option", { name: /^Sceptile/ }));
	expect(within(section("Swap partner")).getByLabelText(/Partner/).textContent).toMatch(/^Sceptile/);
	const card2 = section("Swap partner");
	expect(card2.textContent).toMatch(/Dedenne[^,]* while chance ≤ \d+% \(Sun \d+%\), otherwise Sceptile|Always/);
	expect(card2.textContent).toMatch(/[+−±][\d,]+ vs\. the best team/);
	// Names in the explanation carry ingredient icons instead of "AAA"-style letters.
	const rule = card2.querySelector("p strong");
	expect(rule?.querySelector(".inline-entry .ing-icons img")).toBeTruthy();
	expect(rule?.querySelector(".inline-entry img.poke-icon")).toBeTruthy();
	expect(rule?.textContent).not.toMatch(/\b[ABC]{3}\b/);
	expect(card2.querySelectorAll("details tbody tr").length).toBeGreaterThan(2);
});

test("language: Traditional Chinese UI and game terms, typing a Chinese Pokémon name, and switching back", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([{ ...entry("sandslash", "Sandslash", "ABC", 6), nature: "Adamant", subSkills: { lv10: "Helping Speed M" } }]),
	);
	render(<App />);
	fireEvent.change(screen.getByLabelText(/Language/), { target: { value: "zh-TW" } });
	expect(localStorage.getItem("pscalc.lang")).toBe('"zh-TW"');
	expect(screen.getByText("能量最佳化")).toBeTruthy();
	expect(screen.getByText("名額最佳化")).toBeTruthy();

	// Box table: Pokémon and nature names come from pokesleep-tool's translations.
	const boxTable = section("你的寶可夢盒");
	expect(boxTable.textContent).toContain("穿山王");
	expect(boxTable.textContent).toContain("固執");
	// Subskills are icons named (in Chinese) by their alt text and tooltip.
	expect(boxTable.querySelector('.subskill-icon[aria-label="幫忙速度M"]')).toBeTruthy();

	// Typing a Chinese name selects the Pokémon.
	fireEvent.click(screen.getByText("＋ 新增寶可夢"));
	fireEvent.change(screen.getByPlaceholderText("輸入以搜尋"), { target: { value: "咚咚鼠" } });
	fireEvent.click(screen.getByText("加入寶可夢盒"));
	const saved = JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]") as BoxEntry[];
	expect(saved.map((e) => e.pokemonName)).toEqual(["Sandslash", "Dedenne"]);

	// Energy solver: ingredient names and labels in Chinese.
	fireEvent.click(screen.getByText("能量最佳化"));
	expect(section("最佳隊伍").textContent).toMatch(/每日 [\d,]+ 能量/);
	expect(section("料理").textContent).toContain("所需鍋子容量");
	// Recipe names in Chinese too (the default dish is "Scald" Chunky Salad).
	expect((within(section("料理")).getByLabelText(/食譜/) as HTMLSelectElement).selectedOptions[0].textContent).toBe(
		"大塊滿滿熱水沙拉・能量 25,356・鍋 95",
	);

	fireEvent.change(screen.getByLabelText(/語言/), { target: { value: "en" } });
	expect(screen.getByText("Energy solver")).toBeTruthy();
	expect(section("Best team").textContent).toMatch(/[\d,]+ strength \/ day/);
});

test("language: Japanese UI and game terms, typing a Japanese Pokémon name", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([{ ...entry("sandslash", "Sandslash", "ABC", 6), nature: "Adamant", subSkills: { lv10: "Helping Speed M" } }]),
	);
	render(<App />);
	fireEvent.change(screen.getByLabelText(/Language/), { target: { value: "ja" } });
	expect(localStorage.getItem("pscalc.lang")).toBe('"ja"');
	expect(document.documentElement.lang).toBe("ja");
	expect(screen.getByText("エナジー計算")).toBeTruthy();

	// Pokémon, nature and subskill names from pokesleep-tool's Japanese translations.
	const boxTable = section("ボックス");
	expect(boxTable.textContent).toContain("サンドパン");
	expect(boxTable.textContent).toContain("いじっぱり");
	expect(boxTable.querySelector('.subskill-icon[aria-label="おてつだいスピードM"]')).toBeTruthy();

	// Typing a Japanese name selects the Pokémon.
	fireEvent.click(screen.getByText("+ ポケモンを追加"));
	fireEvent.change(screen.getByPlaceholderText("入力して検索"), { target: { value: "デデンネ" } });
	fireEvent.click(screen.getByText("ボックスに追加"));
	const saved = JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]") as BoxEntry[];
	expect(saved.map((e) => e.pokemonName)).toEqual(["Sandslash", "Dedenne"]);

	// Energy solver: labels and the recipe name in Japanese.
	fireEvent.click(screen.getByText("エナジー計算"));
	expect(section("最適なチーム").textContent).toMatch(/1日 [\d,]+ エナジー/);
	expect((within(section("料理")).getByLabelText(/レシピ/) as HTMLSelectElement).selectedOptions[0].textContent).toBe(
		"ごろごろねっとうサラダ · エナジー 25,356 · 鍋 95",
	);
	fireEvent.change(screen.getByLabelText(/言語/), { target: { value: "en" } });
});

test("Box can be sorted by order added, Pokédex number, level and name", () => {
	const at = (e: BoxEntry, level: number): BoxEntry => ({ ...e, level });
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			at(entry("drag", "Dragonite", "AAA"), 30),
			at(entry("bulba", "Bulbasaur", "AAA"), 10),
			at(entry("pika", "Pikachu", "AAA"), 50),
		]),
	);
	render(<App />);
	const box = section("Your box");
	const order = () => [...box.querySelectorAll("tbody tr")].map((r) => r.querySelector("td:not(.icon-cell)")?.textContent);
	const sortBy = within(box).getByLabelText("Sort by");

	expect(order()).toEqual(["Dragonite", "Bulbasaur", "Pikachu"]);
	// Ingredients are icons under the name, not a column of letters.
	expect([...box.querySelectorAll("thead th")].map((th) => th.textContent)).not.toContain("Ingredients");
	expect(box.querySelectorAll("tbody tr")[0].querySelectorAll(".ing-icons img")).toHaveLength(3);
	// Each row starts with the Pokémon's icon.
	const icons = [...box.querySelectorAll("tbody tr td.icon-cell img")].map((img) => img.getAttribute("src"));
	expect(icons).toHaveLength(3);
	expect(icons[0]).toMatch(/dragonite/);
	fireEvent.change(sortBy, { target: { value: "dex" } });
	expect(order()).toEqual(["Bulbasaur", "Pikachu", "Dragonite"]);
	fireEvent.change(sortBy, { target: { value: "level" } });
	expect(order()).toEqual(["Pikachu", "Dragonite", "Bulbasaur"]);
	fireEvent.click(within(box).getByLabelText("Reverse order"));
	expect(order()).toEqual(["Bulbasaur", "Dragonite", "Pikachu"]);
	fireEvent.change(sortBy, { target: { value: "name" } });
	expect(order()).toEqual(["Bulbasaur", "Dragonite", "Pikachu"]);
	// The choice is remembered.
	expect(JSON.parse(localStorage.getItem("pscalc.boxSort") ?? "{}")).toEqual({ by: "name", reversed: false });
});

test("Box shows each Pokémon's rating for its role and can be sorted by it", async () => {
	const subs = (...names: SubSkillType[]) => Object.fromEntries(names.map((n, i) => [["lv10", "lv25", "lv50"][i], n]));
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			{ ...entry("weak", "Sceptile", "AAA"), nickname: "Weak", nature: "Quiet" },
			{ ...entry("strong", "Sceptile", "AAA"), nickname: "Strong", nature: "Adamant", subSkills: subs("Helping Speed M", "Berry Finding S", "Skill Trigger M") },
			{ ...entry("chansey", "Chansey", "AAA"), subSkills: subs("Ingredient Finder M", "Helping Speed M") },
		]),
	);
	render(<App />);
	const box = section("Your box");
	await waitFor(() => expect(within(box).queryByText("Rarity…")).toBeNull());
	const cell = (label: string) => rowOf(box, label).querySelector(".rating") as HTMLElement;
	// Grade, rank among random rolls, odds of a better roll, and what it's rated for.
	expect(cell("Strong").textContent).toMatch(/^[SABCD] Top [\d.]+%(1 in [\d,]+ rolls is better|[\d.]+% of rolls are better)Strength/);
	// Ingredients specialists are ranked for their best ingredient, against any ingredient combination.
	expect(cell("Chansey").textContent).toContain("Fancy Egg + skill (skill as Fancy Egg)");
	expect(cell("Chansey").getAttribute("title")).toMatch(/Ranked for its best ingredient, Fancy Egg, against rolls of any ingredient combination that has it \(best for it: A[AB][ABC]\)/);
	expect(cell("Strong").getAttribute("title")).toMatch(/random rolls of this Pokémon at Lv80[^]*% of the best nature and subskills/);
	const top = (row: Element) => Number(row.querySelector(".rating")?.textContent?.match(/Top ([\d.]+)%/)?.[1]);
	expect(top(rowOf(box, "Strong"))).toBeLessThan(top(rowOf(box, "Weak")));

	// The cross-species rank sits next to the rarity, and can be sorted by.
	const rank = (label: string) => rowOf(box, label).querySelector(".rank") as HTMLElement;
	expect(rank("Strong").textContent).toMatch(/^[SABCD] Top [\d.<]+%Strength: \w+$/);
	expect(rank("Chansey").textContent).toMatch(/(Ingredients: .+|Skill: Energy for Everyone S)$/);
	fireEvent.change(within(box).getByLabelText("Sort by"), { target: { value: "rank" } });
	const rankTop = (row: Element) => Number(row.querySelector(".rank")?.textContent?.match(/Top ([\d.]+)%/)?.[1] ?? 0);
	const byRank = [...box.querySelectorAll("tbody tr")].map(rankTop);
	expect(byRank).toEqual([...byRank].sort((a, b) => a - b));

	fireEvent.change(within(box).getByLabelText("Sort by"), { target: { value: "rating" } });
	const order = [...box.querySelectorAll("tbody tr")].map(top);
	expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("both solvers' bench lists show each Pokémon's cross-species rank, for the Pokémon as the solvers see it", async () => {
	localStorage.setItem("pscalc.finalEvolution", "true");
	renderSolver([
		entry("sandslash", "Sandslash", "ABC", 6),
		entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
		entry("meow", "Meowscarada", "AAA"),
		entry("drag", "Dragonite", "ABB"),
		entry("spirit", "Spiritomb", "AAA"),
		entry("amoon", "Amoonguss", "AAA"),
		entry("quag", "Quagsire", "AAA"),
		entry("charmander", "Charmander", "AAA"),
	]);
	const rankOf = (label: string) => rowOf(section("Bench"), label).querySelector(".rank")?.textContent ?? "";
	expect(within(section("Bench")).getByText("Rank")).toBeTruthy();
	// Evolved to Charizard for the solvers, and ranked as one against the best Pokémon for its ingredient.
	expect(rankOf("Charmander→Charizard")).toMatch(/^[SABCD] Top .*Ingredients: (Bean Sausage|Warming Ginger|Fiery Herb)$/);
	expect(rowOf(section("Bench"), "Charmander→Charizard").querySelector(".rank")?.getAttribute("title")).toMatch(
		/per day \((Bean Sausage|Warming Ginger|Fiery Herb)\); the median is [\d,.]+\.\nCompared with random rolls of (Tyranitar|Aggron|Dragonite|Charizard), the best in this category[^]*\nIngredient strength of everything it gathers: [\d,]+ per day\./,
	);

	fireEvent.click(screen.getByText("Energy solver"));
	expect(within(section("Bench")).getByText("Rank")).toBeTruthy();
	const benchRow = section("Bench").querySelector("tbody tr") as HTMLElement;
	expect(benchRow.querySelector(".rank")?.textContent).toMatch(/^[SABCD] Top /);
});

test("Box filters by type (icons) and by unlocked ingredient", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			{ ...entry("bulba", "Bulbasaur", "ABC"), level: 10 }, // honey (tomato, potato locked)
			{ ...entry("char", "Charmander", "AAB"), level: 30 }, // sausage, sausage (ginger locked)
			entry("pika", "Pikachu", "ABC"), // apple, ginger, egg
		]),
	);
	render(<App />);
	const box = section("Your box");
	const names = () => [...box.querySelectorAll("tbody tr")].map((r) => r.querySelector("td:not(.icon-cell)")?.textContent?.split(" ")[0]);
	const types = within(within(box).getByRole("group", { name: "Type" }));
	const ings = within(within(box).getByRole("group", { name: "Ingredients (unlocked)" }));
	expect(types.getAllByRole("button")).toHaveLength(19); // All + 18 types, each an icon
	expect(types.getByRole("button", { name: "Grass" }).querySelector("img.type-icon")).not.toBeNull();
	expect(names()).toEqual(["Bulbasaur", "Charmander", "Pikachu"]);

	// One click: only that type. More clicks add types; clicking again removes one.
	fireEvent.click(types.getByRole("button", { name: "Grass" }));
	expect(names()).toEqual(["Bulbasaur"]);
	expect(box.textContent).toContain("Showing 1 of 3 Pokémon.");
	fireEvent.click(types.getByRole("button", { name: "Fire" }));
	expect(names()).toEqual(["Bulbasaur", "Charmander"]);
	fireEvent.click(types.getByRole("button", { name: "Grass" }));
	expect(names()).toEqual(["Charmander"]);
	expect(JSON.parse(localStorage.getItem("pscalc.boxFilter") ?? "{}").types).toEqual(["fire"]);
	fireEvent.click(types.getByRole("button", { name: "All" }));
	expect(names()).toEqual(["Bulbasaur", "Charmander", "Pikachu"]);

	// Ingredient choices are only those unlocked in the box: no Tomato, Potato (locked on Bulbasaur).
	const choices = ings.getAllByRole("button").map((b) => b.getAttribute("aria-label")).filter(Boolean);
	expect(choices).not.toContain("Tasty Tomato");
	expect(choices).not.toContain("Soft Potato");
	fireEvent.click(ings.getByRole("button", { name: "Warming Ginger" }));
	expect(names()).toEqual(["Pikachu"]); // Charmander's Ginger slot isn't unlocked at Lv30
	fireEvent.click(ings.getByRole("button", { name: "Honey" }));
	expect(names()).toEqual(["Bulbasaur", "Pikachu"]);

	// Both filters together; nothing left shows a message.
	fireEvent.click(types.getByRole("button", { name: "Fire" }));
	expect(names()).toEqual([]);
	expect(box.textContent).toContain("No Pokémon match these filters.");
});

test("rarity and rank always judge the final form, even with Final evolution off", async () => {
	const subs = { lv10: "Ingredient Finder M", lv25: "Helping Speed M", lv50: "Inventory Up L" } as const;
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			// Charmander evolves twice: +2 main skill levels, so it matches the Charizard below once evolved.
			{ ...entry("charmander", "Charmander", "AAB", 1), nature: "Quiet", subSkills: subs },
			{ ...entry("charizard", "Charizard", "AAB", 3), nature: "Quiet", subSkills: subs },
		]),
	);
	render(<App />);
	const box = section("Your box");
	await waitFor(() => expect(within(box).queryByText("Rarity…")).toBeNull());
	const cells = (label: string) => {
		const row = rowOf(box, label);
		return [row.querySelector(".rating:not(.rank)")?.textContent, row.querySelector(".rank")?.textContent];
	};
	// The box itself still shows the Charmander (Final evolution is off).
	expect(rowOf(box, "Charmander").textContent).not.toContain("Charizard");
	expect(cells("Charmander")).toEqual(cells("Charizard"));
	expect(cells("Charmander")[1]).toMatch(/^[SABCD] Top /);
});

test("box shows subskills as icons, fading ones the Pokémon hasn't unlocked yet", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([
			{ ...entry("pika", "Pikachu", "AAA"), level: 20, subSkills: { lv10: "Helping Bonus", lv25: "Helping Speed M" } },
		]),
	);
	render(<App />);
	const icons = [...section("Your box").querySelectorAll("tbody .subskill-icon")];
	expect(icons.map((i) => i.getAttribute("title"))).toEqual(["Lv10 Helping Bonus", "Lv25 Helping Speed M"]);
	expect(icons.map((i) => i.classList.contains("locked"))).toEqual([false, true]);
});

test("solver labels tell identical Pokémon apart with subskill icons, not abbreviations", () => {
	const meow = (id: string, lv10: SubSkillType) => ({ ...entry(id, "Meowscarada", "AAA"), subSkills: { lv10 } });
	renderSolver([meow("m1", "Helping Bonus"), meow("m2", "Helping Speed M")]);
	const cells = [...document.querySelectorAll("section.card tbody td:not(.icon-cell)")].filter((td) =>
		td.textContent?.startsWith("Meowscarada Lv60"),
	);
	expect(cells).toHaveLength(2);
	for (const td of cells) {
		// The one with Helping Bonus is also tagged.
		expect(td.textContent).toMatch(/^Meowscarada Lv60 · Serious · (Helping Bonus)?$/);
		expect(td.querySelectorAll(".subskill-icon")).toHaveLength(1);
	}
	expect(cells.map((td) => td.querySelector(".subskill-icon")?.getAttribute("aria-label")).sort()).toEqual([
		"Helping Bonus",
		"Helping Speed M",
	]);
});

test("box shows the stats a nature raises and lowers under its name", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([{ ...entry("a", "Pikachu", "AAA"), nature: "Gentle" }, entry("b", "Bulbasaur", "AAA")]),
	);
	render(<App />);
	const rows = section("Your box").querySelectorAll("tbody tr");
	const effects = rows[0].querySelector(".nature-effects");
	expect(effects?.getAttribute("aria-label")).toBe("▲ Skill, ▼ Energy");
	expect(effects?.querySelectorAll("svg.stat-icon")).toHaveLength(2);
	// Neutral natures (Serious) have no effects to show.
	expect(rows[1].querySelector(".nature-effects")).toBeNull();
});

test("solver labels draw a nature's effects as icons, keeping the name only for neutral natures", () => {
	const meow = (id: string, nature: string) => ({ ...entry(id, "Meowscarada", "AAA"), nature });
	renderSolver([meow("m1", "Gentle"), meow("m2", "Hardy")]);
	const cells = [...document.querySelectorAll("section.card tbody td:not(.icon-cell)")].filter((td) =>
		td.textContent?.startsWith("Meowscarada Lv60"),
	);
	expect(cells).toHaveLength(2);
	const gentle = cells.find((td) => td.querySelector(".nature-effects"));
	expect(gentle?.querySelector(".nature-effects")?.getAttribute("aria-label")).toBe("Gentle: ▲ Skill, ▼ Energy");
	expect(gentle?.textContent).not.toContain("Gentle");
	expect(cells.find((td) => !td.querySelector(".nature-effects"))?.textContent).toContain("Hardy");
});

test("Replaces column shows the replaced Pokémon with icons instead of letters", () => {
	localStorage.setItem(
		"pscalc.teams",
		JSON.stringify({ scald_chunky_salad: ["gourgeist", "gourgeist2", "meow", "meow2", "drag", "spirit", "amoon", "quag"] }),
	);
	renderSolver([
		entry("sandslash", "Sandslash", "ABC", 6),
		entry("gourgeist", "Gourgeist (Jumbo)", "AAA"),
		entry("gourgeist2", "Gourgeist (Jumbo)", "AAA"),
		{ ...entry("meow", "Meowscarada", "AAA"), nature: "Gentle" },
		entry("meow2", "Meowscarada", "AAA"),
		entry("drag", "Dragonite", "ABB"),
		entry("spirit", "Spiritomb", "AAA"),
		entry("amoon", "Amoonguss", "AAA"),
		entry("quag", "Quagsire", "AAA"),
	]);
	const replaced = [...section("Bench").querySelectorAll(".replaced")];
	expect(replaced.length).toBeGreaterThan(0);
	for (const r of replaced) {
		expect(r.querySelector(".ing-icons img")).toBeTruthy();
		expect(r.querySelector("img.poke-icon")).toBeTruthy();
		expect(r.textContent).not.toMatch(/\b[ABC]{3}\b/);
		// The full text label is still there on hover.
		expect(r.getAttribute("title")).toMatch(/Lv60 [ABC]{3}/);
	}
});

test("level scaling: lower-level Pokémon count as the chosen level, the box marks it and keeps real levels", () => {
	localStorage.setItem(
		"pscalc.box.v1",
		JSON.stringify([{ ...entry("bulba", "Bulbasaur", "ABC"), level: 10 }, entry("pika", "Pikachu", "AAA")]),
	);
	render(<App />);
	// Also on the Box tab: the level column shows the real and the scaled level.
	const boxRow = () => section("Your box").querySelectorAll("tbody tr")[0] as HTMLElement;
	fireEvent.click(within(screen.getByRole("group", { name: "Level scaling" })).getByText("60"));
	expect(boxRow().querySelectorAll("td")[2].textContent).toBe("10→60");
	expect(boxRow().querySelectorAll(".ing-icons .locked")).toHaveLength(0);
	fireEvent.click(within(screen.getByRole("group", { name: "Level scaling" })).getByText("Off"));
	expect(boxRow().querySelectorAll("td")[2].textContent).toBe("10");
	fireEvent.click(screen.getByText("Slot solver"));
	const nameCell = () =>
		[...document.querySelectorAll("section.card tbody td:not(.icon-cell)")].find((td) =>
			td.textContent?.startsWith("Bulbasaur"),
		) as HTMLElement;
	expect(nameCell().textContent).toMatch(/^Bulbasaur Lv10/);
	expect(nameCell().querySelectorAll(".ing-icons .locked")).toHaveLength(2);

	fireEvent.click(within(screen.getByRole("group", { name: "Level scaling" })).getByText("60"));
	expect(nameCell().textContent).toMatch(/^Bulbasaur Lv10→60/);
	expect(nameCell().querySelectorAll(".ing-icons .locked")).toHaveLength(0); // Lv30 and Lv60 slots unlocked
	// Pikachu is already Lv60: unchanged.
	expect(document.body.textContent).toContain("Pikachu Lv60");
	expect(document.body.textContent).not.toContain("Pikachu Lv60→");
	expect(JSON.parse(localStorage.getItem("pscalc.levelScale") ?? "null")).toBe(60);

	// The saved box itself is untouched.
	expect(JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]")[0].level).toBe(10);

	// Off restores real levels.
	fireEvent.click(screen.getByText("Slot solver"));
	fireEvent.click(within(screen.getByRole("group", { name: "Level scaling" })).getByText("Off"));
	expect(nameCell().textContent).toMatch(/^Bulbasaur Lv10(?!→)/);
});

test("final evolution: every Pokémon counts as its final form, the box marks it and keeps the real ones", () => {
	localStorage.setItem("pscalc.box.v1", JSON.stringify([entry("bulba", "Bulbasaur", "AAA"), entry("pika", "Pikachu", "AAA")]));
	render(<App />);
	// Also on the Box tab: the real Pokémon, with its final form and skill level under it.
	fireEvent.click(screen.getByLabelText(/Final evolution/));
	const bulba = rowOf(section("Your box"), "Bulbasaur");
	expect(bulba.textContent).toContain("→ Venusaur");
	expect(bulba.querySelectorAll("td")[3].textContent).toMatch(/^\d+→\d+$/);
	fireEvent.click(screen.getByLabelText(/Final evolution/));
	expect(rowOf(section("Your box"), "Bulbasaur").textContent).not.toContain("Venusaur");
	fireEvent.click(screen.getByText("Slot solver"));
	expect(document.body.textContent).not.toContain("Venusaur");
	fireEvent.click(screen.getByLabelText(/Final evolution/));
	expect(document.body.textContent).toContain("Bulbasaur→Venusaur Lv60");
	expect(document.body.textContent).toContain("Pikachu→Raichu Lv60");
	expect(JSON.parse(localStorage.getItem("pscalc.finalEvolution") ?? "false")).toBe(true);
	expect(JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]")[0].pokemonName).toBe("Bulbasaur");
});

test("max Sub Skill Seeds: solvers use upgraded subskills, the box keeps the real ones", () => {
	const meow = (id: string, lv10: SubSkillType) => ({ ...entry(id, "Meowscarada", "AAA"), subSkills: { lv10 } });
	renderSolver([meow("m1", "Helping Speed S"), meow("m2", "Helping Bonus")]);
	const icons = () => [...document.querySelectorAll("section.card tbody .subskill-icon")].map((i) => i.getAttribute("aria-label"));
	expect(icons()).toContain("Helping Speed S");
	fireEvent.click(screen.getByLabelText(/Max Sub Skill Seeds/));
	expect(icons()).toContain("Helping Speed M");
	expect(icons()).not.toContain("Helping Speed S");
	const upgraded = document.querySelector('section.card tbody .subskill-icon[aria-label="Helping Speed M"]');
	expect(upgraded?.getAttribute("title")).toBe("Lv10 Helping Speed M (Sub Skill Seed: was Helping Speed S)");
	expect(JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]")[0].subSkills.lv10).toBe("Helping Speed S");
});

test("recipes are listed by energy, highest first, and changing the dish type picks the top one", () => {
	renderSolver([]);
	const recipe = screen.getByLabelText("Recipe") as HTMLSelectElement;
	const energies = () => [...recipe.options].map((o) => Number(/· ([\d,]+) energy/.exec(o.text)?.[1].replace(/,/g, "")));
	expect(energies().length).toBeGreaterThan(10);
	expect(energies()).toEqual([...energies()].sort((a, b) => b - a));
	fireEvent.change(screen.getByLabelText("Type"), { target: { value: "dessert" } });
	expect(recipe.selectedIndex).toBe(0);
	expect(energies()).toEqual([...energies()].sort((a, b) => b - a));
	expect([...recipe.options].some((o) => o.text.startsWith("Slowpoke Tail Roll Cake"))).toBe(true);
});

test("the theme button cycles Auto → Light → Dark, saved per device (not synced)", () => {
	render(<App />);
	const button = () => screen.getByRole("button", { name: /^Theme: / });
	expect(button().getAttribute("aria-label")).toBe("Theme: Auto (follows your device) (click to change)");
	expect(document.documentElement.dataset.theme).toBeUndefined();
	fireEvent.click(button());
	expect(document.documentElement.dataset.theme).toBe("light");
	expect(localStorage.getItem("pscalc-theme")).toBe('"light"');
	fireEvent.click(button());
	expect(document.documentElement.dataset.theme).toBe("dark");
	expect(button().getAttribute("aria-label")).toBe("Theme: Dark (click to change)");
	fireEvent.click(button());
	expect(document.documentElement.dataset.theme).toBeUndefined();
	expect(Object.keys(localStorage).filter((k) => k.startsWith("pscalc.") && k.includes("theme"))).toEqual([]);
});
