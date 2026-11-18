import { useEffect, useRef, useState } from "react";
import type { ImportWarning, ScreenshotReading } from "../ocr/read";
import type { OcrEngine, ScreenshotLang } from "../ocr/tesseract";
import { getLang, ingredientLabel, type Key, pokemonLabel, t } from "./i18n";
import { readLearnedIcons } from "./learnedIcons";
import { useStoredState } from "./storage";

export interface ImportItem {
	id: string;
	fileName: string;
	/** Object URL of the screenshot, shown next to the form while reviewing. */
	url: string;
	status: "waiting" | "reading" | "done" | "error";
	reading?: ScreenshotReading;
}

const screenshotLangs: { lang: ScreenshotLang; label: string }[] = [
	{ lang: "zh-TW", label: "繁體中文" },
	{ lang: "ja", label: "日本語" },
	{ lang: "en", label: "English" },
];

/** What to check for each warning, for the review list. */
export function warningText(w: ImportWarning, reading: ScreenshotReading): string {
	if (w === "iconName") {
		return t("warnIconName", {
			icon: reading.iconPokemon ? pokemonLabel(reading.iconPokemon) : "?",
			name: reading.namePokemon ? pokemonLabel(reading.namePokemon) : "?",
		});
	}
	if (w.startsWith("lv") && w !== "level") return t("warnSubskill", { lv: w.replace("lv", "Lv") });
	if (w === "ingredients" && reading.ingredientIcons?.lv30 && reading.ingredientIcons.lv60) {
		return t("warnIngredientsSeen", {
			lv30: ingredientLabel(reading.ingredientIcons.lv30),
			lv60: ingredientLabel(reading.ingredientIcons.lv60),
		});
	}
	const keys: Record<string, Key> = {
		layout: "warnLayout",
		pokemon: "warnPokemon",
		form: "warnForm",
		level: "warnLevel",
		skillLevel: "warnSkillLevel",
		nature: "warnNature",
		ingredients: "warnIngredients",
	};
	return t(keys[w]);
}

/**
 * Reads Pokémon details screenshots with OCR (on the device) and lists the results. Each result is
 * reviewed in the Add Pokémon form before it goes into the box.
 */
export default function ScreenshotImport(props: {
	items: ImportItem[];
	setItems: (update: (items: ImportItem[]) => ImportItem[]) => void;
	reviewingId: string | undefined;
	onReview: (item: ImportItem) => void;
}) {
	const { items, setItems, reviewingId, onReview } = props;
	const [lang, setLang] = useStoredState<ScreenshotLang>("pscalc.screenshotLang", getLang() === "zh-TW" ? "zh-TW" : "en");
	const [loading, setLoading] = useState<number | undefined>();
	const [dragging, setDragging] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const engine = useRef<{ lang: ScreenshotLang; engine: Promise<OcrEngine> } | undefined>(undefined);
	const queue = useRef(Promise.resolve());
	const fileInput = useRef<HTMLInputElement>(null);

	useEffect(
		() => () => {
			engine.current?.engine.then((e) => e.terminate());
		},
		[],
	);

	const getEngine = async (): Promise<OcrEngine> => {
		if (engine.current?.lang !== lang) {
			const old = engine.current;
			const { createBrowserOcrEngine } = await import("../ocr/browser");
			setLoading(0);
			engine.current = { lang, engine: createBrowserOcrEngine(lang, (p) => setLoading(p)) };
			old?.engine.then((e) => e.terminate());
		}
		try {
			return await engine.current.engine;
		} catch (e) {
			engine.current = undefined;
			throw e;
		} finally {
			setLoading(undefined);
		}
	};

	const addFiles = (files: File[]) => {
		const images = files.filter((f) => f.type.startsWith("image/"));
		if (images.length === 0) return;
		setError(undefined);
		const added: ImportItem[] = images.map((f) => ({
			id: crypto.randomUUID(),
			fileName: f.name || "clipboard.png",
			url: URL.createObjectURL(f),
			status: "waiting",
		}));
		setItems((list) => [...list, ...added]);
		const update = (id: string, patch: Partial<ImportItem>) =>
			setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
		// Read one screenshot at a time, in the order they were added.
		images.forEach((file, i) => {
			const { id } = added[i];
			queue.current = queue.current.then(async () => {
				try {
					update(id, { status: "reading" });
					const [{ decodeImage, loadIngredientIcons, loadPokemonIcons }, { readScreenshot }] = await Promise.all([
						import("../ocr/browser"),
						import("../ocr/read"),
					]);
					const [ocr, img, icons, builtIn] = await Promise.all([
						getEngine(),
						decodeImage(file),
						loadIngredientIcons(),
						loadPokemonIcons(),
					]);
					// Built-in icons plus the ones learned from this user's earlier imports.
					const reading = await readScreenshot(img, ocr, icons, [...builtIn, ...readLearnedIcons()]);
					update(id, { status: reading.warnings.includes("layout") ? "error" : "done", reading });
				} catch (e) {
					console.error(e);
					update(id, { status: "error" });
					setError(t("importEngineFailed"));
				}
			});
		});
	};

	// Paste images anywhere on the Box tab.
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => {
			const files = [...(e.clipboardData?.files ?? [])];
			if (files.some((f) => f.type.startsWith("image/"))) {
				e.preventDefault();
				addFiles(files);
			}
		};
		document.addEventListener("paste", onPaste);
		return () => document.removeEventListener("paste", onPaste);
	});

	const discard = (item: ImportItem) => {
		URL.revokeObjectURL(item.url);
		setItems((list) => list.filter((x) => x.id !== item.id));
	};

	return (
		<section className="card">
			<h2>{t("importTitle")}</h2>
			<p className="muted small">{t("importHelp")}</p>
			<div
				className={`drop-zone${dragging ? " dragging" : ""}`}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					addFiles([...e.dataTransfer.files]);
				}}
			>
				<label>
					{t("screenshotLang")}{" "}
					<select value={lang} onChange={(e) => setLang(e.target.value as ScreenshotLang)}>
						{screenshotLangs.map((l) => (
							<option key={l.lang} value={l.lang}>
								{l.label}
							</option>
						))}
					</select>
				</label>
				<button type="button" onClick={() => fileInput.current?.click()}>
					{t("chooseScreenshots")}
				</button>
				<span className="muted small">{t("orDropPaste")}</span>
				<input
					ref={fileInput}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					multiple
					hidden
					onChange={(e) => {
						addFiles([...(e.target.files ?? [])]);
						e.target.value = "";
					}}
				/>
			</div>
			{loading !== undefined && <p className="muted small">{t("loadingOcr", { pct: Math.round(loading * 100) })}</p>}
			{error && <p className="error small">{error}</p>}
			{items.length > 0 && (
				<ul className="import-list">
					{items.map((item) => (
						<li key={item.id} className={item.id === reviewingId ? "reviewing" : ""}>
							<img src={item.url} alt="" />
							<div className="import-info">
								<div>
									<strong>{item.reading?.entry.pokemonName ? pokemonLabel(item.reading.entry.pokemonName) : item.fileName}</strong>
									{item.reading?.entry.pokemonName && <span className="muted"> Lv{item.reading.entry.level}</span>}
								</div>
								<div className="muted small">
									{item.status === "waiting" && t("importWaiting")}
									{item.status === "reading" && t("importReading")}
									{item.status === "error" && t("warnLayout")}
									{item.status === "done" &&
										item.reading &&
										(item.reading.warnings.length === 0
											? t("importComplete")
											: t("importToCheck", { n: item.reading.warnings.length }))}
								</div>
							</div>
							<div className="row-actions">
								{item.status === "done" && (
									<button type="button" onClick={() => onReview(item)} disabled={item.id === reviewingId}>
										{t("importReview")}
									</button>
								)}
								<button type="button" className="secondary" onClick={() => discard(item)}>
									{t("importDiscard")}
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
