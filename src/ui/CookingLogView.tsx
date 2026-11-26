import { useEffect, useRef, useState } from "react";
import {
	type CookingLog,
	type CookingRecord,
	dayString,
	findShot,
	isCooked,
	isSunday,
	type Meal,
	mealSlot,
	meals,
	mergeRecord,
	parseDay,
	slotKey,
	tastyChance,
	tastyMultiplier,
	weekDays,
	weekStart,
	weekStats,
} from "../core/cooking";
import { localTime, photoTakenAt } from "../core/photoDate";
import { type RecipeType, recipes } from "../core/recipes";
import type { CookingReading, CookingWarning } from "../ocr/cooking";
import type { ScreenshotLang } from "../ocr/tesseract";
import { getLang, type Key, Rich, recipeLabel, t } from "./i18n";
import DishIcon from "./DishIcon";
import IconSelect, { type IconSelectOption } from "./IconSelect";
import { screenshotLangs } from "./ScreenshotImport";
import { useStoredState } from "./storage";
import TableHelp from "./TableHelp";
import { useOcrEngine } from "./useOcrEngine";

const mealLabels: Record<Meal, Key> = { 0: "mealBreakfast", 1: "mealLunch", 2: "mealDinner" };
const recipeTypes: { type: RecipeType; label: Key }[] = [
	{ type: "curry", label: "curry" },
	{ type: "salad", label: "salad" },
	{ type: "dessert", label: "dessert" },
];
const recipeById = new Map(recipes.map((r) => [r.id, r]));
const dishName = (id: string | undefined) => {
	const r = id ? recipeById.get(id) : undefined;
	return r ? recipeLabel(r) : "?";
};
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** "Mon 11/23" in the page's language. */
function dayLabel(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "numeric", day: "numeric" }): string {
	return parseDay(day).toLocaleDateString(getLang(), opts);
}

/** How the screenshot's time was found (see core/photoDate.ts); "fileDate" is the least reliable. */
type TimeSource = "metadata" | "fileName" | "fileDate";

/** A screenshot being read or waiting for review. */
interface CookingItem {
	id: string;
	fileName: string;
	url: string;
	status: "waiting" | "reading" | "done" | "error";
	reading?: CookingReading;
	/** The fields to save, as read and then edited. */
	draft?: CookingRecord;
	time?: string;
	timeSource?: TimeSource;
	fingerprint?: string;
}

const warningKeys: Record<CookingWarning, Key> = {
	layout: "cookingWarnLayout",
	recipe: "cookingWarnRecipe",
	energy: "cookingWarnEnergy",
	extraTasty: "cookingWarnExtraTasty",
	tastyBonus: "cookingWarnTastyBonus",
};

/** First 16 hex digits of the file's SHA-256, to recognize the same screenshot uploaded again. */
async function fingerprint(file: Blob): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
	return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** When the screenshot was taken: its metadata, its file name, or else the file's modified time. */
async function takenAt(file: File): Promise<{ time: string; source: TimeSource }> {
	const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
	const found = photoTakenAt(head, file.name);
	if (found) return found;
	return { time: localTime(new Date(file.lastModified || Date.now())), source: "fileDate" };
}

/** Picker of every dish with its picture, grouped by type. */
function RecipeSelect(props: { value: string | undefined; onChange: (id: string | undefined) => void }) {
	const options: IconSelectOption[] = [
		{ value: "", text: t("cookingPickDish"), content: <span className="muted">{t("cookingPickDish")}</span> },
		...recipeTypes.flatMap((rt) =>
			recipes
				.filter((r) => r.type === rt.type)
				.map((r) => ({
					value: r.id,
					text: recipeLabel(r),
					group: t(rt.label),
					content: (
						<>
							<DishIcon recipeId={r.id} decorative />
							{recipeLabel(r)}
						</>
					),
				})),
		),
	];
	return <IconSelect value={props.value ?? ""} options={options} onChange={(id) => props.onChange(id || undefined)} />;
}

/** Editable fields of a record: the dish and its result, or the pot's bonus (or both, when editing a meal). */
function RecordFields(props: {
	record: CookingRecord;
	setRecord: (r: CookingRecord) => void;
	show: { slot: boolean; dish: boolean; bonus: boolean };
}) {
	const { record: r, setRecord, show } = props;
	const num = (v: string) => (v === "" ? undefined : Math.max(0, Math.round(Number(v)) || 0));
	return (
		<div className="form-grid cooking-fields">
			{show.slot && (
				<>
					<label>
						{t("cookingDay")}
						<input type="date" value={r.day} onChange={(e) => e.target.value && setRecord({ ...r, day: e.target.value })} />
					</label>
					<label>
						{t("cookingMeal")}
						<select value={r.meal} onChange={(e) => setRecord({ ...r, meal: Number(e.target.value) as Meal })}>
							{meals.map((m) => (
								<option key={m} value={m}>
									{t(mealLabels[m])}
								</option>
							))}
						</select>
					</label>
				</>
			)}
			{show.dish && (
				<>
					<label>
						{t("recipe")}
						<RecipeSelect value={r.recipeId} onChange={(recipeId) => setRecord({ ...r, recipeId })} />
					</label>
					<label>
						{t("cookingEnergy")}
						<input type="number" min={0} inputMode="numeric" value={r.energy ?? ""} onChange={(e) => setRecord({ ...r, energy: num(e.target.value) })} />
					</label>
					<label className="cooking-check">
						<input type="checkbox" checked={!!r.extraTasty} onChange={(e) => setRecord({ ...r, extraTasty: e.target.checked })} />
						{t("cookingExtraTasty")} <span className="muted small">(×{tastyMultiplier(r.day)})</span>
					</label>
				</>
			)}
			{show.bonus && (
				<label>
					{t("cookingTastyBonus")}
					<input type="number" min={0} max={70} inputMode="numeric" value={r.tastyBonus ?? ""} onChange={(e) => setRecord({ ...r, tastyBonus: num(e.target.value) })} />
				</label>
			)}
		</div>
	);
}

/** Reads cooking screenshots on the device and lists them for review before they go into the log. */
function CookingImport(props: { log: CookingLog; save: (records: CookingRecord[]) => void; onSaved: (day: string) => void }) {
	const { log, save, onSaved } = props;
	const [lang, setLang] = useStoredState<ScreenshotLang>("pscalc.screenshotLang", getLang());
	const { getEngine, loading } = useOcrEngine(lang);
	const [items, setItems] = useState<CookingItem[]>([]);
	const [dragging, setDragging] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const queue = useRef(Promise.resolve());
	const fileInput = useRef<HTMLInputElement>(null);

	const update = (id: string, patch: Partial<CookingItem>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

	const addFiles = (files: File[]) => {
		const images = files.filter((f) => f.type.startsWith("image/"));
		if (images.length === 0) return;
		setError(undefined);
		const added: CookingItem[] = images.map((f) => ({
			id: crypto.randomUUID(),
			fileName: f.name || "clipboard.png",
			url: URL.createObjectURL(f),
			status: "waiting",
		}));
		setItems((list) => [...list, ...added]);
		images.forEach((file, i) => {
			const { id } = added[i];
			queue.current = queue.current.then(async () => {
				try {
					update(id, { status: "reading" });
					const [{ decodeImage }, { readCookingScreenshot }] = await Promise.all([import("../ocr/browser"), import("../ocr/cooking")]);
					const [ocr, img, when, print] = await Promise.all([getEngine(), decodeImage(file), takenAt(file), fingerprint(file)]);
					const reading = await readCookingScreenshot(img, ocr);
					const slot = mealSlot(when.time);
					const draft: CookingRecord =
						reading.kind === "result"
							? { ...slot, recipeId: reading.recipeId, energy: reading.energy, extraTasty: reading.extraTasty }
							: reading.kind === "pot"
								? { ...slot, tastyBonus: reading.tastyBonus }
								: { ...slot };
					update(id, {
						status: reading.kind === "unknown" ? "error" : "done",
						reading,
						draft,
						time: when.time,
						timeSource: when.source,
						fingerprint: print,
					});
				} catch (e) {
					console.error(e);
					update(id, { status: "error" });
					setError(t("importEngineFailed"));
				}
			});
		});
	};

	// Paste images anywhere on the tab.
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

	const discard = (item: CookingItem) => {
		URL.revokeObjectURL(item.url);
		setItems((list) => list.filter((x) => x.id !== item.id));
	};

	const recordOf = (item: CookingItem): CookingRecord | undefined =>
		item.draft && { ...item.draft, shots: item.fingerprint ? [item.fingerprint] : undefined };

	/** What to check before saving: unreadable fields, a guessed time, or a screenshot logged before. */
	const checks = (item: CookingItem): string[] => {
		const out = (item.reading?.warnings ?? []).map((w) => t(warningKeys[w]));
		if (item.timeSource === "fileDate") out.push(t("cookingTimeGuessed"));
		const dup = item.fingerprint && findShot(log, item.fingerprint);
		if (dup) out.push(t("cookingDuplicate", { day: dayLabel(dup.day), meal: t(mealLabels[dup.meal]) }));
		return out;
	};

	const saveItems = (list: CookingItem[]) => {
		const records = list.flatMap((x) => recordOf(x) ?? []);
		if (records.length === 0) return;
		save(records);
		onSaved(records[records.length - 1].day);
		for (const x of list) URL.revokeObjectURL(x.url);
		const ids = new Set(list.map((x) => x.id));
		setItems((all) => all.filter((x) => !ids.has(x.id)));
	};

	const ready = items.filter((x) => x.status === "done" && checks(x).length === 0);

	return (
		<section className="card">
			<h2>{t("cookingImportTitle")}</h2>
			<TableHelp label={t("importHowItWorks")}>{t("cookingImportHelp")}</TableHelp>
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
					<span className="label-long">{t("screenshotLang")}</span>
					<span className="label-short">{t("language")}</span>{" "}
					<select aria-label={t("screenshotLang")} value={lang} onChange={(e) => setLang(e.target.value as ScreenshotLang)}>
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
				<ul className="cooking-review">
					{items.map((item) => {
						const kind = item.reading?.kind;
						const draft = item.draft;
						const toCheck = item.status === "done" ? checks(item) : [];
						const existing = draft && log[slotKey(draft.day, draft.meal)];
						const replaces =
							existing && draft && kind === "result" && isCooked(existing) && existing.recipeId !== draft.recipeId
								? t("cookingReplaces", { dish: dishName(existing.recipeId) })
								: undefined;
						return (
							<li key={item.id}>
								<a href={item.url} target="_blank" rel="noreferrer">
									<img src={item.url} alt={item.fileName} />
								</a>
								<div className="cooking-review-body">
									<div>
										<strong>
											{kind === "result" && t("cookingKindResult")}
											{kind === "pot" && t("cookingKindPot")}
											{(kind === "unknown" || item.status === "error") && t("cookingWarnLayout")}
											{!kind && item.status !== "error" && item.fileName}
										</strong>{" "}
										<span className="muted small">
											{item.status === "waiting" && t("importWaiting")}
											{item.status === "reading" && t("importReading")}
											{item.time &&
												item.timeSource !== "fileDate" &&
												t(item.timeSource === "metadata" ? "cookingTimeMetadata" : "cookingTimeFileName", {
													time: item.time.replace("T", " ").slice(0, 16),
												})}
										</span>
									</div>
									{item.status === "done" && draft && (
										<RecordFields
											record={draft}
											setRecord={(d) => update(item.id, { draft: d })}
											show={{ slot: true, dish: kind === "result", bonus: kind === "pot" }}
										/>
									)}
									{(toCheck.length > 0 || replaces) && (
										<ul className="warnings small">
											{toCheck.map((w) => (
												<li key={w}>{w}</li>
											))}
											{replaces && <li>{replaces}</li>}
										</ul>
									)}
									<div className="row-actions">
										{item.status === "done" && (
											<button type="button" onClick={() => saveItems([item])}>
												{t("cookingSave")}
											</button>
										)}
										<button type="button" className="secondary" onClick={() => discard(item)}>
											{t("importDiscard")}
										</button>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}
			{ready.length > 1 && (
				<div className="actions">
					<button type="button" onClick={() => saveItems(ready)}>
						{t("cookingSaveAll", { n: ready.length })}
					</button>
				</div>
			)}
		</section>
	);
}

/** Pop-up to add, change or delete one meal of the log. */
function MealEditor(props: { record: CookingRecord; onSave: (r: CookingRecord) => void; onDelete?: () => void; onClose: () => void }) {
	const [draft, setDraft] = useState(props.record);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [props.onClose]);
	const title = `${dayLabel(draft.day)} · ${t(mealLabels[draft.meal])}`;
	return (
		<div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
			<div className="modal cooking-editor" role="dialog" aria-modal="true" aria-label={title}>
				<button type="button" className="secondary modal-close" aria-label={t("close")} onClick={props.onClose}>
					×
				</button>
				<section className="card">
					<h2>{title}</h2>
					<RecordFields record={draft} setRecord={setDraft} show={{ slot: false, dish: true, bonus: true }} />
					<p className="muted small">
						{t("cookingChance", { pct: tastyChance(draft) })}
						{isSunday(draft.day) && ` · ${t("cookingSundayNote")}`}
					</p>
					<div className="actions">
						<button type="button" onClick={() => props.onSave(draft)}>
							{t("cookingSave")}
						</button>
						{props.onDelete && (
							<button type="button" className="danger" onClick={props.onDelete}>
								{t("delete")}
							</button>
						)}
						<button type="button" className="secondary" onClick={props.onClose}>
							{t("cancel")}
						</button>
					</div>
				</section>
			</div>
		</div>
	);
}

/** The cooking log tab: screenshots in, a week of meals and its numbers out. */
export default function CookingLogView() {
	const [log, setLog] = useStoredState<CookingLog>("pscalc.cookingLog.v1", {});
	const thisWeek = weekStart(mealSlot(localTime(new Date())).day);
	const [monday, setMonday] = useState(thisWeek);
	const [editing, setEditing] = useState<{ record: CookingRecord; exists: boolean } | undefined>();
	const days = weekDays(monday);
	const stats = weekStats(log, monday);
	const maxDay = Math.max(1, ...stats.dayEnergy);
	const today = mealSlot(localTime(new Date())).day;

	const save = (records: CookingRecord[]) => setLog(records.reduce(mergeRecord, log));
	const shiftWeek = (weeks: number) => {
		const d = parseDay(monday);
		d.setDate(d.getDate() + weeks * 7);
		setMonday(dayString(d));
	};

	return (
		<div className="cooking-view">
			<CookingImport log={log} save={save} onSaved={(day) => setMonday(weekStart(day))} />

			<section className="card">
				<div className="cooking-week-nav">
					<button type="button" className="secondary" onClick={() => shiftWeek(-1)} aria-label={t("cookingPrevWeek")}>
						‹
					</button>
					<h2>
						{t("cookingWeek", {
							from: dayLabel(days[0], { month: "numeric", day: "numeric" }),
							to: dayLabel(days[6], { month: "numeric", day: "numeric" }),
						})}
					</h2>
					<button type="button" className="secondary" onClick={() => shiftWeek(1)} aria-label={t("cookingNextWeek")}>
						›
					</button>
					{monday !== thisWeek && (
						<button type="button" className="secondary" onClick={() => setMonday(thisWeek)}>
							{t("cookingThisWeek")}
						</button>
					)}
				</div>
				<div className="cooking-stats">
					<div>
						<span className="muted small">{t("cookingTotal")}</span>
						<strong>{fmt(stats.totalEnergy)}</strong>
					</div>
					<div>
						<span className="muted small">{t("cookingMealsCooked")}</span>
						<strong>{t("cookingMealsValue", { n: stats.cooked })}</strong>
					</div>
					<div>
						<span className="muted small">{t("cookingExtraTasty")}</span>
						<strong>{t("cookingTastyValue", { n: stats.extraTasty, e: stats.expectedExtraTasty.toFixed(1) })}</strong>
					</div>
					{stats.best && (
						<div>
							<span className="muted small">{t("cookingBest")}</span>
							<strong className="cooking-best">
								<DishIcon recipeId={stats.best.recipeId} decorative />
								{dishName(stats.best.recipeId)} {fmt(stats.best.energy ?? 0)}
							</strong>
						</div>
					)}
				</div>
				<TableHelp>
					<Rich text={t("cookingWeekHelp")} />
				</TableHelp>
				<table className="cooking-week">
					<thead>
						<tr>
							<th />
							{meals.map((m) => (
								<th key={m}>{t(mealLabels[m])}</th>
							))}
							<th className="num">{t("cookingDayTotal")}</th>
						</tr>
					</thead>
					<tbody>
						{days.map((day, i) => (
							<tr key={day} className={`${isSunday(day) ? "sunday" : ""}${day === today ? " today" : ""}`}>
								<th scope="row">{dayLabel(day)}</th>
								{meals.map((meal) => {
									const r = log[slotKey(day, meal)];
									const cooked = r && isCooked(r);
									return (
										<td key={meal}>
											<button
												type="button"
												className={`cooking-cell${cooked ? " cooked" : ""}${r?.extraTasty ? " tasty" : ""}`}
												onClick={() => setEditing({ record: r ?? { day, meal }, exists: !!r })}
											>
												{cooked ? (
													<>
														<span className="cooking-dish">
															<DishIcon recipeId={r.recipeId} decorative />
															<span className="cooking-dish-name">
																{r.extraTasty && <span aria-label={t("cookingExtraTasty")}>★ </span>}
																{dishName(r.recipeId)}
															</span>
														</span>
														<span className="cooking-energy">{r.energy !== undefined ? fmt(r.energy) : "—"}</span>
													</>
												) : (
													<span className="muted">{r?.tastyBonus !== undefined ? t("cookingChance", { pct: tastyChance(r) }) : "+"}</span>
												)}
											</button>
										</td>
									);
								})}
								<td className="num">
									{stats.dayEnergy[i] > 0 && (
										<>
											<span className="cooking-bar" style={{ width: `${(stats.dayEnergy[i] / maxDay) * 100}%` }} />
											{fmt(stats.dayEnergy[i])}
										</>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			{editing && (
				<MealEditor
					record={editing.record}
					onClose={() => setEditing(undefined)}
					onSave={(r) => {
						setLog({ ...log, [slotKey(r.day, r.meal)]: r });
						setEditing(undefined);
					}}
					onDelete={
						editing.exists
							? () => {
									const { [slotKey(editing.record.day, editing.record.meal)]: _, ...rest } = log;
									setLog(rest);
									setEditing(undefined);
								}
							: undefined
					}
				/>
			)}
		</div>
	);
}
