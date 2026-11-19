import { type ReactNode, useState } from "react";
import { t } from "./i18n";

/**
 * A table's (or section's) explanation. Always shown on wider screens; on phones it's folded behind a small
 * "How to read this" button (or `label`; App.css), so the content comes first.
 */
export default function TableHelp(props: { children: ReactNode; label?: string }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" className="secondary help-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
				{props.label ?? t("howToRead")} {open ? "▴" : "▾"}
			</button>
			<p className={open ? "muted small table-help open" : "muted small table-help"}>{props.children}</p>
		</>
	);
}
