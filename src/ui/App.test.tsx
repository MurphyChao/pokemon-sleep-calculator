// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BoxEntry } from "../core/box";
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
	fireEvent.click(within(rowOf(team, "Sandslash")).getByText("To bench"));
	const bench = section("Bench");
	expect(rowOf(bench, "Sandslash").textContent).toMatch(/Makes it possible|−\d\.\d\d/);
	// Independent of the current team: skill Lv6 Sandslash saves about 0.47 slots vs. the best team without it.
	const cells = rowOf(bench, "Sandslash").querySelectorAll("td");
	// Columns end with: Saves (current team), Saves (vs. best), Extra Tasty, Replaces, button.
	expect(Number(cells[cells.length - 4].textContent?.replace("−", ""))).toBeCloseTo(0.47, 1);

	// And back to the team.
	fireEvent.click(within(rowOf(bench, "Sandslash")).getByText("To team"));
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

test("adds a Pokémon from the Box form", () => {
	render(<App />);
	fireEvent.change(screen.getByPlaceholderText("Type to search"), { target: { value: "Sandslash" } });
	fireEvent.click(screen.getByText("Add to box"));
	expect(screen.getByText("Box (1)")).toBeTruthy();
	expect(JSON.parse(localStorage.getItem("pscalc.box.v1") ?? "[]")[0].pokemonName).toBe("Sandslash");
});

test("key level buttons set the level and the number box still accepts any level", () => {
	render(<App />);
	const level = screen.getByLabelText("Level") as HTMLInputElement;
	fireEvent.click(screen.getByRole("button", { name: "60" }));
	expect(level.value).toBe("60");
	expect(screen.getByRole("button", { name: "60" }).getAttribute("aria-pressed")).toBe("true");
	fireEvent.change(level, { target: { value: "61" } });
	expect(level.value).toBe("61");
	fireEvent.click(screen.getByRole("button", { name: "80" }));
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
	fireEvent.click(within(rowOf(team, "Sylveon")).getByText("Exclude"));
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
	fireEvent.click(within(rowOf(section("Bench"), "Swampert")).getByText("To team"));
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
	const first = rows()[0].querySelector("td")?.textContent ?? "";
	fireEvent.click(within(rows()[0] as HTMLElement).getByText("Exclude"));
	expect(total()).toBeLessThanOrEqual(before);
	expect(rowOf(section("Bench"), first).textContent).toContain("excluded");
});

test("Energy solver: recipe level buttons and arrows", () => {
	localStorage.setItem("pscalc.box.v1", JSON.stringify([entry("spirit", "Spiritomb", "AAA")]));
	render(<App />);
	fireEvent.click(screen.getByText("Energy solver"));
	const input = screen.getByLabelText("Recipe level") as HTMLInputElement;
	expect(input.value).toBe("1");
	fireEvent.click(screen.getByText("50"));
	expect(input.value).toBe("50");
	expect(screen.getByText("50").getAttribute("aria-pressed")).toBe("true");
	fireEvent.click(screen.getByLabelText("Recipe level up"));
	expect(input.value).toBe("51");
	fireEvent.click(screen.getByLabelText("Recipe level down"));
	fireEvent.click(screen.getByLabelText("Recipe level down"));
	expect(input.value).toBe("49");
	fireEvent.click(screen.getByText("70"));
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
	expect((within(card).getByLabelText("Extra Tasty Pokémon") as HTMLSelectElement).value).toBe("dedenne");
	// The default partner is the one giving the best result; pick Sceptile to compare with the berry Pokémon.
	fireEvent.change(within(card).getByLabelText(/Partner/), { target: { value: "sceptile" } });
	const card2 = section("Swap partner");
	expect(card2.textContent).toMatch(/Dedenne[^,]* while chance ≤ \d+% \(Sun \d+%\), otherwise Sceptile|Always/);
	expect(card2.textContent).toMatch(/[+−±][\d,]+ vs\. the best team/);
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
	expect(boxTable.textContent).toContain("幫忙速度M");

	// Typing a Chinese name selects the Pokémon.
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
		"大塊滿滿熱水沙拉 (95)",
	);

	fireEvent.change(screen.getByLabelText(/語言/), { target: { value: "en" } });
	expect(screen.getByText("Energy solver")).toBeTruthy();
	expect(section("Best team").textContent).toMatch(/[\d,]+ strength \/ day/);
});
