/**
 * When a screenshot was taken, from the file itself (no OCR of the status bar's clock, which is sometimes
 * hidden):
 *
 * 1. Metadata in the image: iPhone screenshots carry an XMP `photoshop:DateCreated` (e.g.
 *    "2026-11-23T07:36:56"); photos and many Android screenshots carry an EXIF `DateTimeOriginal`
 *    ("2026:11:23 07:36:56"). Both are local time without a time zone, which is what we want.
 * 2. The file name: Android names screenshots like "Screenshot_20261113-111914.png", Telegram exports
 *    "photo_2026-11-26_12-26-53.jpg", macOS "Screenshot 2026-11-13 at 11.19.14.png".
 *
 * Chat apps usually strip the metadata, and the file's modified time is often just when it was copied,
 * so the caller falls back to that (or asks) when this returns nothing.
 */

/**
 * "chatApp": a name a chat app gave the picture when it was saved from a chat (Telegram's
 * "photo_3_2026-11-27_11-27-54.jpg"): its time is when it was sent or saved, not when it was taken.
 */
export type PhotoTimeSource = "metadata" | "fileName" | "chatApp";

export interface PhotoTime {
	/** Local time, "YYYY-MM-DDTHH:MM:SS". */
	time: string;
	source: PhotoTimeSource;
}

const pad = (n: number | string) => String(n).padStart(2, "0");

/** A plausible local time from its parts (Pokémon Sleep came out in 2023), or undefined. */
function toTime(y: string, mo: string, d: string, h: string, mi: string, s = "0"): string | undefined {
	const [Y, M, D, hh, mm, ss] = [y, mo, d, h, mi, s].map(Number);
	if (Y < 2023 || Y > 2099 || M < 1 || M > 12 || D < 1 || D > 31 || hh > 23 || mm > 59 || ss > 59) return undefined;
	return `${Y}-${pad(M)}-${pad(D)}T${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Metadata sits before the image data; this much of the file is searched. */
const metadataBytes = 256 * 1024;

const xmpDate =
	/(?:photoshop:DateCreated|xmp:CreateDate|exif:DateTimeOriginal)(?:>|=["'])\s*(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/;
const exifDate = /(20\d\d):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/;

/** The time stored in the image's metadata (XMP or EXIF), if any. */
export function metadataTime(bytes: Uint8Array): string | undefined {
	// Latin-1 keeps one character per byte, so the ASCII dates are found as they are.
	let text = "";
	const end = Math.min(bytes.length, metadataBytes);
	for (let i = 0; i < end; i += 8192) {
		text += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 8192)));
	}
	for (const re of [xmpDate, exifDate]) {
		const m = text.match(re);
		const time = m && toTime(m[1], m[2], m[3], m[4], m[5], m[6]);
		if (time) return time;
	}
	return undefined;
}

/** Date and time in a file name: 2026-11-26_12-26-53, 20261113-111914, 2026-11-13 at 11.19.14, … */
const nameDate = /(20\d\d)[-_.]?(\d\d)[-_.]?(\d\d)(?:[ _T-]|\s*at\s*)*(\d\d)[-_.:h]?(\d\d)(?:[-_.:m]?(\d\d))?/;

export function fileNameTime(name: string): string | undefined {
	const m = name.match(nameDate);
	return m ? toTime(m[1], m[2], m[3], m[4], m[5], m[6]) : undefined;
}

/** Telegram's names for pictures saved from a chat: "photo_2026-11-26_12-26-53.jpg", "photo_3_2026-11-27_11-27-54.jpg". */
const chatAppName = /^photo_(\d+_)?\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d/;

/** When the screenshot was taken, from its metadata or else its file name. */
export function photoTakenAt(bytes: Uint8Array, fileName: string): PhotoTime | undefined {
	const meta = metadataTime(bytes);
	if (meta) return { time: meta, source: "metadata" };
	const named = fileNameTime(fileName);
	if (named) return { time: named, source: chatAppName.test(fileName) ? "chatApp" : "fileName" };
	return undefined;
}

/** A Date's local time as "YYYY-MM-DDTHH:MM:SS". */
export function localTime(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
