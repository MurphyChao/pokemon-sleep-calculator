/**
 * On phones, tables with the "stack" class are shown as one card per row (see App.css), with each cell
 * labelled by its column's header. This copies the header labels onto the cells as data-label (the header
 * text, or the name of an icon header such as an ingredient) and the header's class as data-col, so the
 * CSS can show them. Run once on start; it keeps tables up to date as rows change.
 */

function headerLabel(th: Element): string {
	const text = th.textContent?.trim();
	if (text) return text;
	const img = th.querySelector("img[alt], [aria-label]");
	return img?.getAttribute("alt") || img?.getAttribute("aria-label") || "";
}

/** Labels the body cells of one table from its header row, following colspans. */
export function labelTable(table: HTMLTableElement) {
	const headers = [...(table.tHead?.rows[0]?.cells ?? [])];
	if (headers.length === 0) return;
	for (const body of table.tBodies) {
		for (const row of body.rows) {
			let col = 0;
			for (const cell of row.cells) {
				const th = headers[col];
				const label = cell.colSpan === 1 && th ? headerLabel(th) : "";
				if (label) cell.dataset.label = label;
				else delete cell.dataset.label;
				if (th?.className && cell.colSpan === 1) cell.dataset.col = th.className;
				else delete cell.dataset.col;
				col += cell.colSpan;
			}
		}
	}
}

export function labelStackTables(root: ParentNode) {
	for (const table of root.querySelectorAll<HTMLTableElement>("table.stack")) labelTable(table);
}

/** Labels stack tables now and whenever the page changes (batched to one pass per frame). */
export function watchStackTables(root: HTMLElement) {
	let queued = false;
	const run = () => {
		queued = false;
		labelStackTables(root);
	};
	new MutationObserver(() => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(run);
	}).observe(root, { childList: true, subtree: true, characterData: true });
	run();
}
