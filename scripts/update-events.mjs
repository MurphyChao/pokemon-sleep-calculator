/**
 * Updates the event list (src/vendor/pokesleep-tool/data/event.json) from pokesleep-tool, whose developer adds
 * events as they're announced. Only the event list: Pokémon and model changes go through `npm run sync-upstream`.
 *
 * Checks the downloaded list's shape before writing it, and prints the events that are new or changed. When
 * run in GitHub Actions, sets the step output `changed` to "true" or "false".
 *
 * Usage: npm run update-events
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = "https://raw.githubusercontent.com/nitoyon/pokesleep-tool/HEAD/src/data/event.json";
const file = join(dirname(fileURLToPath(import.meta.url)), "../src/vendor/pokesleep-tool/data/event.json");

const output = (changed) => {
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
};

/** Throws unless `data` looks like pokesleep-tool's event list. */
function check(data) {
	if (!data || !Array.isArray(data.bonus) || !Array.isArray(data.drowsy)) throw new Error("no bonus/drowsy lists");
	for (const e of data.bonus) {
		if (typeof e.name !== "string" || !e.name) throw new Error(`bonus event without a name: ${JSON.stringify(e)}`);
		for (const key of ["start", "end"]) {
			if (Number.isNaN(new Date(e[key]).getTime())) throw new Error(`${e.name}: bad ${key} date ${e[key]}`);
		}
		// Harmless (it never counts as running), as in an old upstream entry with its dates swapped.
		if (new Date(e.end) <= new Date(e.start)) console.warn(`warning: ${e.name} ends before it starts (ignored)`);
		if (typeof e.effects !== "object" || e.effects === null) throw new Error(`${e.name}: no effects`);
		if (typeof e.target !== "object" || e.target === null) throw new Error(`${e.name}: no target`);
	}
	if (data.bonus.length < 10) throw new Error(`only ${data.bonus.length} bonus events: looks truncated`);
}

const response = await fetch(url);
if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
const text = await response.text();
const data = JSON.parse(text);
check(data);

const current = JSON.parse(readFileSync(file, "utf8"));
if (JSON.stringify(current) === JSON.stringify(data)) {
	console.log(`Event list unchanged (${data.bonus.length} bonus events).`);
	output(false);
} else {
	const before = new Map(current.bonus.map((e) => [e.name, JSON.stringify(e)]));
	for (const e of data.bonus) {
		const was = before.get(e.name);
		if (was !== JSON.stringify(e)) {
			console.log(`${was ? "changed" : "new    "} ${e.name}: ${e.start} → ${e.end} ${JSON.stringify(e.effects)}`);
		}
	}
	writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
	console.log(`Event list updated (${data.bonus.length} bonus events).`);
	output(true);
}
