/**
 * On phones, tables with the "stack" class are shown as one card per row (see App.css), with each cell
 * labelled by its column's header. This copies the header labels onto the cells as data-label (the header
 * text, or the name of an icon header such as an ingredient, whose picture goes in --label-icon), the
 * header's class as data-col, its data-short (a shorter label for phones) as data-short, and data-empty
 * on cells showing nothing or "–", so the CSS can show them.
 * Run once on start; it keeps tables up to date as rows change.
 */

function headerLabel(th: Element): { label: string; icon?: string } {
	const text = th.textContent?.trim();
	if (text) return { label: text };
	const img = th.querySelector("img[alt], [aria-label]");
	const label = img?.getAttribute("alt") || img?.getAttribute("aria-label") || "";
	const src = img?.getAttribute("src");
	return src ? { label, icon: src } : { label };
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
				const { label, icon } = cell.colSpan === 1 && th ? headerLabel(th) : { label: "" };
				if (label) cell.dataset.label = label;
				else delete cell.dataset.label;
				if (icon) {
					cell.dataset.labelIcon = "";
					cell.style.setProperty("--label-icon", `url("${icon}")`);
				} else if ("labelIcon" in cell.dataset) {
					delete cell.dataset.labelIcon;
					cell.style.removeProperty("--label-icon");
				}
				if (th?.className && cell.colSpan === 1) cell.dataset.col = th.className;
				else delete cell.dataset.col;
				const short = cell.colSpan === 1 ? (th as HTMLElement | undefined)?.dataset.short : undefined;
				if (short) cell.dataset.short = short;
				else delete cell.dataset.short;
				const text = cell.textContent?.trim() ?? "";
				const empty = (text === "" || text === "–") && !cell.querySelector("img, svg, input, button");
				if (empty) cell.dataset.empty = "";
				else delete cell.dataset.empty;
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
