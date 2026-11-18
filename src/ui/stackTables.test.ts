// @vitest-environment jsdom
import { labelStackTables } from "./stackTables";

test("stack tables get each cell labelled by its column header (text, or an icon's name), following colspans", () => {
	document.body.innerHTML = `
		<table class="stack">
			<thead><tr>
				<th class="icon-cell"></th><th>Pokémon</th><th class="ing-col"><img alt="Soft Potato"></th><th>Lv</th><th></th>
			</tr></thead>
			<tbody>
				<tr><td class="icon-cell"></td><td>Sandslash</td><td>28</td><td>50</td><td class="row-actions"></td></tr>
				<tr class="total"><td colspan="2">Total</td><td>90</td><td>1.00</td><td></td></tr>
			</tbody>
		</table>
		<table><thead><tr><th>Other</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>`;
	labelStackTables(document);
	const [row, total] = document.querySelectorAll<HTMLTableRowElement>("table.stack tbody tr");
	const cells = (r: HTMLTableRowElement) => [...r.cells].map((c) => c.dataset.label ?? "");
	expect(cells(row)).toEqual(["", "Pokémon", "Soft Potato", "Lv", ""]);
	expect(row.cells[2].dataset.col).toBe("ing-col");
	expect(cells(total)).toEqual(["", "Soft Potato", "Lv", ""]);
	// Tables without the class are left alone.
	expect(document.querySelector<HTMLElement>("table:not(.stack) td")?.dataset.label).toBeUndefined();
});
