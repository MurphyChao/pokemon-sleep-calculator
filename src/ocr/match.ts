/**
 * Matches OCR text to the game's names (subskills, natures, Pokémon) in Traditional Chinese,
 * Japanese and English. OCR often confuses look-alike characters, so both sides are normalized
 * the same way and the closest name by edit distance wins.
 */

/** Kanji that OCR returns for katakana of the same shape (and vice versa), folded to one form. */
const lookalikes: Record<string, string> = {
	"一": "ー",
	"－": "ー",
	"-": "ー",
	"—": "ー",
	"口": "ロ",
	"力": "カ",
	"工": "エ",
	"卜": "ト",
	"二": "ニ",
	"八": "ハ",
	"夕": "タ",
	"へ": "ヘ",
};

export function normalize(text: string): string {
	let s = text.normalize("NFKC").toUpperCase();
	s = s.replace(/[\s・、。.,:;'"`()（）［］[\]{}|/\\!?！？_~*·•]/g, "");
	s = [...s].map((c) => lookalikes[c] ?? c).join("");
	// A trailing S (as in "Helping Speed S") is often read as 5 or $.
	return s.replace(/[5$]+$/, "S");
}

function editDistance(a: string[], b: string[]): number {
	const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let diag = prev[0];
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = prev[j];
			prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
			diag = tmp;
		}
	}
	return prev[b.length];
}

/** Edit distance from `needle` to the best-matching part of `text` (text may have junk around it). */
function substringDistance(needle: string[], text: string[]): number {
	let prev = new Array(text.length + 1).fill(0);
	for (let i = 1; i <= needle.length; i++) {
		const cur = [i];
		for (let j = 1; j <= text.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (needle[i - 1] === text[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return Math.min(...prev);
}

export interface Candidate<K> {
	key: K;
	/** Names of this key as shown in the game, in any language. */
	names: string[];
}

export interface MatchResult<K> {
	key: K;
	/** 0 = exact; edit distance divided by the name's length. */
	score: number;
}

/**
 * The candidate whose name is closest to `text`, or undefined if none is close enough.
 * `partial`: the text may contain other words around the name (e.g. "Lv. 22 古月鳥").
 */
export function bestMatch<K>(
	text: string,
	candidates: Candidate<K>[],
	opts: { partial?: boolean; maxScore?: number } = {},
): MatchResult<K> | undefined {
	const t = [...normalize(text)];
	if (t.length === 0) return undefined;
	let best: MatchResult<K> | undefined;
	let bestLength = 0;
	for (const c of candidates) {
		for (const name of c.names) {
			const n = [...normalize(name)];
			if (n.length === 0) continue;
			const d = opts.partial ? substringDistance(n, t) : editDistance(n, t);
			const score = d / n.length;
			// On a tie prefer the longer name: a short name can hide inside a longer one.
			if (!best || score < best.score || (score === best.score && n.length > bestLength)) {
				best = { key: c.key, score };
				bestLength = n.length;
			}
		}
	}
	return best && best.score <= (opts.maxScore ?? 0.34) ? best : undefined;
}
