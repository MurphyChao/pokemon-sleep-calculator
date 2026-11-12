// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import SubSkillPicker, { type SubSkillSelection } from "./SubSkillPicker";

afterEach(cleanup);

let latest: SubSkillSelection = {};
function Harness(props: { initial?: SubSkillSelection }) {
	const [value, setValue] = useState<SubSkillSelection>(props.initial ?? {});
	latest = value;
	return <SubSkillPicker value={value} onChange={setValue} />;
}

const grid = (name: string) => {
	const b = [...document.querySelectorAll(".subskill-grid button")].find((x) => x.textContent?.startsWith(name));
	if (!b) throw new Error(`no button ${name}`);
	return b as HTMLButtonElement;
};

test("clicks fill levels in order", () => {
	render(<Harness />);
	fireEvent.click(grid("Helping Speed M"));
	fireEvent.click(grid("Ingredient Finder M"));
	fireEvent.click(grid("Helping Bonus"));
	expect(latest).toMatchObject({ lv10: "Helping Speed M", lv25: "Ingredient Finder M", lv50: "Helping Bonus" });
	expect(grid("Ingredient Finder M").textContent).toContain("Lv25");
});

test("clicking a chosen subskill removes it and the next click refills that level", () => {
	render(<Harness />);
	fireEvent.click(grid("Helping Speed M"));
	fireEvent.click(grid("Ingredient Finder M"));
	fireEvent.click(grid("Helping Bonus"));
	fireEvent.click(grid("Ingredient Finder M"));
	expect(latest.lv25).toBeNull();
	expect(latest.lv50).toBe("Helping Bonus"); // later levels don't shift
	fireEvent.click(grid("Skill Trigger M"));
	expect(latest.lv25).toBe("Skill Trigger M");
});

test("all five levels full disables unchosen buttons; Clear empties everything", () => {
	render(
		<Harness
			initial={{
				lv10: "Helping Speed M",
				lv25: "Ingredient Finder M",
				lv50: "Helping Bonus",
				lv70: "Helping Speed S",
				lv80: "Inventory Up L",
			}}
		/>,
	);
	expect(grid("Skill Trigger M").disabled).toBe(true);
	expect(grid("Helping Bonus").disabled).toBe(false);
	fireEvent.click(screen.getByText("Clear"));
	expect(Object.values(latest).every((v) => v === null)).toBe(true);
});

test("clicking a filled slot removes it", () => {
	render(<Harness initial={{ lv10: "Helping Speed M" }} />);
	fireEvent.click(screen.getByTitle("Remove Helping Speed M"));
	expect(latest.lv10).toBeNull();
});
