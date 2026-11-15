// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import IconSelect from "./IconSelect";

afterEach(cleanup);

function Harness() {
	const [value, setValue] = useState("b");
	return (
		<label>
			Fruit
			<IconSelect
				value={value}
				onChange={setValue}
				options={["apple", "banana", "cherry"].map((f) => ({ value: f[0], text: f, content: <b>{f}</b> }))}
			/>
		</label>
	);
}

test("opens, moves with the keyboard and picks like a select", () => {
	render(<Harness />);
	const button = screen.getByLabelText("Fruit");
	expect(button.textContent).toContain("banana");
	expect(screen.queryByRole("listbox")).toBeNull();

	fireEvent.keyDown(button, { key: "ArrowDown" });
	const list = screen.getByRole("listbox");
	expect(screen.getByRole("option", { name: "banana" }).getAttribute("aria-selected")).toBe("true");
	fireEvent.keyDown(list, { key: "ArrowDown" });
	fireEvent.keyDown(list, { key: "Enter" });
	expect(screen.queryByRole("listbox")).toBeNull();
	expect(button.textContent).toContain("cherry");

	// Typing a letter jumps to the next option starting with it; Escape closes without picking.
	fireEvent.click(button);
	fireEvent.keyDown(screen.getByRole("listbox"), { key: "a" });
	fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
	expect(button.textContent).toContain("cherry");

	fireEvent.click(button);
	fireEvent.click(screen.getByRole("option", { name: "apple" }));
	expect(button.textContent).toContain("apple");
});

test("a click outside closes it", () => {
	render(<Harness />);
	fireEvent.click(screen.getByLabelText("Fruit"));
	expect(screen.getByRole("listbox")).toBeTruthy();
	fireEvent.mouseDown(document.body);
	expect(screen.queryByRole("listbox")).toBeNull();
});
