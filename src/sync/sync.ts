/**
 * Two-way sync of the app's saved data (every localStorage key starting with "pscalc.") with one
 * file in cloud storage. Independent of Google so it can be tested; see drive.ts for the real store.
 *
 * The last synced copy is remembered (as the remote file's version and the data's snapshot), so a
 * sync can tell which side changed: only this device → upload, only the remote → download, both → a
 * conflict the user resolves.
 */

/** Saved values: localStorage key → raw JSON string. */
export type SyncData = Record<string, string>;

export interface RemoteFile {
	id: string;
	/** Changes whenever the file's content changes. */
	version: string;
}

export interface RemoteStore {
	find(): Promise<RemoteFile | undefined>;
	download(id: string): Promise<string>;
	create(content: string): Promise<RemoteFile>;
	update(id: string, content: string): Promise<RemoteFile>;
}

/** What the last successful sync left behind (stored on this device, outside the synced keys). */
export interface SyncMeta {
	fileId: string;
	version: string;
	snapshot: string;
	syncedAt: number;
}

export type SyncResult =
	| { kind: "upToDate" | "uploaded"; meta: SyncMeta }
	| { kind: "downloaded"; meta: SyncMeta; remote: SyncData }
	| { kind: "conflict"; remote: SyncData; remoteFile: RemoteFile; remoteSavedAt?: number };

interface FileContent {
	app: "pokemon-sleep-calculator";
	format: 1;
	savedAt: number;
	/** Parsed values, so the file is readable. */
	data: Record<string, unknown>;
}

/** Canonical string for comparing data sets. */
export function snapshot(data: SyncData): string {
	return JSON.stringify(Object.keys(data).sort().map((k) => [k, data[k]]));
}

export function encode(data: SyncData, now: number): string {
	const content: FileContent = {
		app: "pokemon-sleep-calculator",
		format: 1,
		savedAt: now,
		data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, JSON.parse(v)])),
	};
	return JSON.stringify(content);
}

export function decode(text: string): { data: SyncData; savedAt?: number } {
	const content = JSON.parse(text) as Partial<FileContent>;
	if (content.app !== "pokemon-sleep-calculator" || content.format !== 1 || typeof content.data !== "object") {
		throw new Error("Not a sync file from this app");
	}
	const data: SyncData = {};
	for (const [k, v] of Object.entries(content.data ?? {})) data[k] = JSON.stringify(v);
	return { data, savedAt: content.savedAt };
}

/** True when the data holds nothing worth keeping over a remote copy (a new device). */
function isBlank(data: SyncData): boolean {
	const box = data["pscalc.box.v1"];
	return box === undefined || box === "[]";
}

/**
 * One sync round. Does not change local data itself: on "downloaded" the caller applies `remote`.
 * @param meta the previous sync's result, undefined if this device never synced.
 */
export async function sync(
	store: RemoteStore,
	local: SyncData,
	meta: SyncMeta | undefined,
	now: number,
): Promise<SyncResult> {
	const localSnapshot = snapshot(local);
	const done = (kind: "upToDate" | "uploaded", file: RemoteFile): SyncResult => ({
		kind,
		meta: { fileId: file.id, version: file.version, snapshot: localSnapshot, syncedAt: now },
	});

	const file = await store.find();
	if (!file) return done("uploaded", await store.create(encode(local, now)));

	const localChanged = meta?.snapshot !== localSnapshot;
	const remoteChanged = meta?.fileId !== file.id || meta.version !== file.version;
	if (!remoteChanged) {
		if (!localChanged) return done("upToDate", file);
		return done("uploaded", await store.update(file.id, encode(local, now)));
	}

	const { data: remote, savedAt } = decode(await store.download(file.id));
	const remoteSnapshot = snapshot(remote);
	if (remoteSnapshot === localSnapshot) return done("upToDate", file);
	if (!localChanged || (!meta && isBlank(local))) {
		return { kind: "downloaded", meta: acceptRemote(remote, file, now), remote };
	}
	return { kind: "conflict", remote, remoteFile: file, remoteSavedAt: savedAt };
}

/** Resolves a conflict by overwriting the remote file with this device's data. */
export async function forceUpload(store: RemoteStore, local: SyncData, fileId: string, now: number): Promise<SyncMeta> {
	const file = await store.update(fileId, encode(local, now));
	return { fileId: file.id, version: file.version, snapshot: snapshot(local), syncedAt: now };
}

/** The meta to store after replacing local data with a downloaded copy. */
export function acceptRemote(remote: SyncData, file: RemoteFile, now: number): SyncMeta {
	return { fileId: file.id, version: file.version, snapshot: snapshot(remote), syncedAt: now };
}
