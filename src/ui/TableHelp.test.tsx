// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TableHelp from "./TableHelp";

afterEach(cleanup);

test("the explanation is always in the page; the phone-only button toggles whether it's unfolded", () => {
	render(<TableHelp>How the table works</TableHelp>);
	const text = screen.getByText("How the table works");
	const button = screen.getByRole("button", { name: /How to read this/ });
	expect(text.className).not.toContain("open");
	expect(button.getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(button);
	expect(text.className).toContain("open");
	expect(button.getAttribute("aria-expanded")).toBe("true");
});
