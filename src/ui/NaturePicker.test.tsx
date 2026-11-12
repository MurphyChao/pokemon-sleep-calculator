// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import Nature from "../vendor/pokesleep-tool/util/Nature";
import NaturePicker from "./NaturePicker";

afterEach(cleanup);

let latest = "";
function Harness(props: { initial: string }) {
	const [value, setValue] = useState(props.initial);
	latest = value;
	return <NaturePicker value={value} onChange={setValue} />;
}
const click = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));

test("▲ help speed + ▼ skill = Naughty", () => {
	render(<Harness initial="Serious" />);
	click("Increase Help speed");
	expect(latest).toBe("Serious"); // incomplete: unchanged
	expect(screen.getByText(/Pick a ▼ stat/)).toBeTruthy();
	click("Decrease Skill");
	expect(latest).toBe("Naughty");
});

test("every non-neutral nature is reachable and round-trips", () => {
	for (const n of Nature.allNatures.filter((x) => !x.isNeautral)) {
		render(<Harness initial="Serious" />);
		const label = (e: string) =>
			({ "Speed of help": "Help speed", "Energy recovery": "Energy", "Ingredient finding": "Ingredients", "Main skill chance": "Skill", "EXP gains": "EXP" })[e];
		click(`Increase ${label(n.upEffect)}`);
		click(`Decrease ${label(n.downEffect)}`);
		expect(latest).toBe(n.name);
		cleanup();
	}
});

test("shows an existing nature and blocks picking the same stat in both rows", () => {
	render(<Harness initial="Naughty" />);
	expect(screen.getByRole("button", { name: "Increase Help speed" }).getAttribute("aria-pressed")).toBe("true");
	expect((screen.getByRole("button", { name: "Decrease Help speed" }) as HTMLButtonElement).disabled).toBe(true);
	click("Neutral");
	expect(new Nature(latest).isNeautral).toBe(true);
});
