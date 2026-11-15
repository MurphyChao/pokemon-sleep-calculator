import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";

export interface IconSelectOption {
	value: string;
	/** What the option shows (may contain icons). */
	content: ReactNode;
	/** Plain-text form, for the button's tooltip and typing to find an option. */
	text: string;
}

/**
 * A dropdown whose options can contain icons (a native <select> can only show text). Behaves like a
 * select: click or Enter/Space/↓ opens it, ↑/↓/Home/End move, Enter/Space picks, Esc or a click
 * outside closes, typing a letter jumps to the next option starting with it. Put it inside a <label>
 * to name it.
 */
export default function IconSelect(props: {
	value: string;
	options: IconSelectOption[];
	onChange: (value: string) => void;
}) {
	const { value, options, onChange } = props;
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	// The list is positioned against the window: cards clip anything that sticks out of them.
	const [place, setPlace] = useState<{ top: number; left: number; minWidth: number; maxHeight: number }>();
	const root = useRef<HTMLDivElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const id = useId();
	const selectedIndex = Math.max(
		0,
		options.findIndex((o) => o.value === value),
	);
	const selected = options[selectedIndex];

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		const dismiss = (e: Event) => {
			if (!list.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", close);
		window.addEventListener("scroll", dismiss, true);
		window.addEventListener("resize", dismiss);
		list.current?.focus();
		return () => {
			document.removeEventListener("mousedown", close);
			window.removeEventListener("scroll", dismiss, true);
			window.removeEventListener("resize", dismiss);
		};
	}, [open]);

	useEffect(() => {
		if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
	}, [open, active]);

	const show = () => {
		const r = button.current?.getBoundingClientRect();
		if (r) {
			// Open downwards, or upwards when there's more room above.
			const below = window.innerHeight - r.bottom - 8;
			const above = r.top - 8;
			const up = below < 200 && above > below;
			setPlace({
				top: up ? Math.max(8, r.top - 4 - Math.min(above, 320)) : r.bottom + 4,
				left: r.left,
				minWidth: r.width,
				maxHeight: Math.min(up ? above : below, 320),
			});
		}
		setActive(selectedIndex);
		setOpen(true);
	};
	const pick = (i: number) => {
		setOpen(false);
		button.current?.focus();
		if (options[i] && options[i].value !== value) onChange(options[i].value);
	};

	const onButtonKey = (e: KeyboardEvent) => {
		if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
			e.preventDefault();
			show();
		}
	};
	const onListKey = (e: KeyboardEvent) => {
		const last = options.length - 1;
		const moves: Record<string, number> = {
			ArrowDown: Math.min(last, active + 1),
			ArrowUp: Math.max(0, active - 1),
			Home: 0,
			End: last,
		};
		if (e.key in moves) {
			e.preventDefault();
			setActive(moves[e.key]);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			pick(active);
		} else if (e.key === "Escape" || e.key === "Tab") {
			if (e.key === "Escape") e.preventDefault();
			setOpen(false);
			button.current?.focus();
		} else if (e.key.length === 1) {
			const key = e.key.toLowerCase();
			const order = [...options.keys()].map((k) => (active + 1 + k) % options.length);
			const next = order.find((i) => options[i].text.toLowerCase().startsWith(key));
			if (next !== undefined) setActive(next);
		}
	};

	return (
		<div className="icon-select" ref={root}>
			<button
				type="button"
				ref={button}
				className="icon-select-button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? `${id}-list` : undefined}
				title={selected?.text}
				onClick={() => (open ? setOpen(false) : show())}
				onKeyDown={onButtonKey}
			>
				<span className="icon-select-value">{selected?.content}</span>
				<span className="icon-select-caret" aria-hidden="true">
					▾
				</span>
			</button>
			{open && (
				<ul
					id={`${id}-list`}
					ref={list}
					className="icon-select-list"
					style={place}
					role="listbox"
					tabIndex={-1}
					aria-activedescendant={`${id}-${active}`}
					onKeyDown={onListKey}
				>
					{options.map((o, i) => (
						<li
							key={o.value}
							id={`${id}-${i}`}
							data-index={i}
							role="option"
							aria-selected={o.value === value}
							aria-label={o.text}
							className={`${i === active ? "active" : ""} ${o.value === value ? "selected" : ""}`}
							onMouseEnter={() => setActive(i)}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => pick(i)}
						>
							{o.content}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
