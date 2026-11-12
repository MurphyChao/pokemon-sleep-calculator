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
	fireEvent.click(screen.getByText("Solver"));
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

test("inventory limit and camp ticket checkboxes are saved", () => {
	render(<App />);
	const limit = screen.getByLabelText(/Inventory limit/) as HTMLInputElement;
	const ticket = screen.getByLabelText(/Good Camp Ticket/) as HTMLInputElement;
	expect(limit.checked).toBe(true);
	expect(ticket.checked).toBe(false);
	fireEvent.click(limit);
	fireEvent.click(ticket);
	expect(JSON.parse(localStorage.getItem("pscalc.yieldOptions") ?? "{}")).toEqual({
		inventoryLimit: false,
		campTicket: true,
	});
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
