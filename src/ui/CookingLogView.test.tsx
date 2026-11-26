// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

// Tests run on Thursday 2026-11-05 at 12:00 (src/test-setup.ts): lunch, in the week of Monday 11/2.

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const week = () => document.querySelector("table.cooking-week") as HTMLElement;
const row = (startsWith: string) => {
	const r = [...week().querySelectorAll("tbody tr")].find((x) => x.querySelector("th")?.textContent?.startsWith(startsWith));
	if (!r) throw new Error(`row ${startsWith} not found`);
	return r as HTMLElement;
};
const cell = (day: string, meal: number) => within(row(day)).getAllByRole("button")[meal];
const stats = () => (document.querySelector(".cooking-stats") as HTMLElement).textContent;

test("cooking log: a week of meals, entered by hand, with its totals", () => {
	render(<App />);
	fireEvent.click(screen.getByText("Cooking log"));
	// The solvers' settings don't apply here.
	expect(document.querySelector(".settings-toggle")).toBeNull();
	expect(screen.getByRole("heading", { name: "Week of 11/2 – 11/8" })).toBeTruthy();
	expect(row("Thu").className).toContain("today");
	expect(row("Sun").className).toContain("sunday");

	// Thursday lunch: Extra Tasty guacamole, with a 20% bonus from the cooking screen.
	fireEvent.click(cell("Thu", 1));
	const dialog = screen.getByRole("dialog");
	fireEvent.change(within(dialog).getByLabelText("Recipe"), { target: { value: "bulldoze_guacamole_and_chips" } });
	fireEvent.change(within(dialog).getByLabelText("Final energy"), { target: { value: "211909" } });
	fireEvent.click(within(dialog).getByLabelText(/^Extra Tasty \(×2\)/));
	fireEvent.change(within(dialog).getByLabelText("Extra Tasty bonus (%)"), { target: { value: "20" } });
	expect(dialog.textContent).toContain("30% Extra Tasty chance");
	fireEvent.click(within(dialog).getByText("Save"));
	expect(screen.queryByRole("dialog")).toBeNull();

	expect(cell("Thu", 1).textContent).toBe("★ \"Bulldoze\" Guacamole and Chips211,909");
	// Sunday dinner, not Extra Tasty.
	fireEvent.click(cell("Sun", 2));
	fireEvent.change(screen.getByLabelText("Recipe"), { target: { value: "honey_gather_chocolate_waffles" } });
	fireEvent.change(screen.getByLabelText("Final energy"), { target: { value: "140142" } });
	expect(screen.getByRole("dialog").textContent).toContain("Sunday: 30% base chance");
	fireEvent.click(screen.getByText("Save"));

	expect(stats()).toContain("Total energy352,051");
	expect(stats()).toContain("Meals cooked2 / 21");
	// Expected Extra Tasty: 30% (10% + 20% bonus) on Thursday + 30% on Sunday.
	expect(stats()).toContain("Extra Tasty1 (expected 0.6)");
	expect(stats()).toContain("Best dish\"Bulldoze\" Guacamole and Chips 211,909");
	expect(JSON.parse(localStorage.getItem("pscalc.cookingLog.v1") ?? "{}")["2026-11-05/1"]).toEqual({
		day: "2026-11-05",
		meal: 1,
		recipeId: "bulldoze_guacamole_and_chips",
		energy: 211909,
		extraTasty: true,
		tastyBonus: 20,
	});

	// Delete a meal.
	fireEvent.click(cell("Sun", 2));
	fireEvent.click(screen.getByText("Delete"));
	expect(stats()).toContain("Meals cooked1 / 21");

	// Other weeks.
	fireEvent.click(screen.getByLabelText("Previous week"));
	expect(screen.getByRole("heading", { name: "Week of 10/26 – 11/1" })).toBeTruthy();
	expect(stats()).toContain("Meals cooked0 / 21");
	fireEvent.click(screen.getByText("This week"));
	expect(screen.getByRole("heading", { name: "Week of 11/2 – 11/8" })).toBeTruthy();
});

test("cooking log: a meal with only the cooking screen's bonus shows its chance, not a dish", () => {
	localStorage.setItem("pscalc.cookingLog.v1", JSON.stringify({ "2026-11-03/0": { day: "2026-11-03", meal: 0, tastyBonus: 15 } }));
	render(<App />);
	fireEvent.click(screen.getByText("Cooking log"));
	expect(cell("Tue", 0).textContent).toBe("25% Extra Tasty chance");
	expect(stats()).toContain("Meals cooked0 / 21");
});
