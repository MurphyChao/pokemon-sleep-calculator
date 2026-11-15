import { describe, expect, it } from "vitest";
import { decode, encode, forceUpload, type RemoteStore, type SyncData, type SyncMeta, sync } from "./sync";

/** In-memory stand-in for the Drive file; `files` is shared so several devices can use one. */
function fakeStore(files: Map<string, { content: string; version: number }> = new Map()) {
	let next = 1;
	const store: RemoteStore = {
		async find() {
			const [id, f] = [...files][0] ?? [];
			return id && f ? { id, version: String(f.version) } : undefined;
		},
		async download(id) {
			return files.get(id)?.content ?? "";
		},
		async create(content) {
			const id = `file${next++}`;
			files.set(id, { content, version: 1 });
			return { id, version: "1" };
		},
		async update(id, content) {
			const f = files.get(id);
			if (!f) throw new Error("missing");
			f.content = content;
			f.version++;
			return { id, version: String(f.version) };
		},
	};
	return { store, files };
}

const box = (...names: string[]) => JSON.stringify(names.map((pokemonName, i) => ({ id: String(i), pokemonName })));
const data = (names: string[], extra: SyncData = {}): SyncData => ({ "pscalc.box.v1": box(...names), ...extra });

describe("sync", () => {
	it("uploads when Drive has no file yet", async () => {
		const { store, files } = fakeStore();
		const result = await sync(store, data(["Pikachu"]), undefined, 1);
		expect(result.kind).toBe("uploaded");
		expect(decode([...files.values()][0].content).data).toEqual(data(["Pikachu"]));
	});

	it("does nothing when neither side changed", async () => {
		const { store } = fakeStore();
		const local = data(["Pikachu"]);
		const first = await sync(store, local, undefined, 1);
		if (first.kind === "conflict") throw new Error();
		expect((await sync(store, local, first.meta, 2)).kind).toBe("upToDate");
	});

	it("uploads local changes and downloads remote ones", async () => {
		const shared = fakeStore();
		const a = await sync(shared.store, data(["Pikachu"]), undefined, 1);
		if (a.kind === "conflict") throw new Error();

		// A second device starting empty takes the Drive copy without asking.
		const b = await sync(shared.store, { "pscalc.lang": '"en"' }, undefined, 2);
		expect(b.kind).toBe("downloaded");
		if (b.kind !== "downloaded") throw new Error();
		expect(b.remote).toEqual(data(["Pikachu"]));

		// B adds a Pokémon and uploads; A then downloads it.
		const b2 = await sync(shared.store, data(["Pikachu", "Eevee"]), b.meta, 3);
		expect(b2.kind).toBe("uploaded");
		const a2 = await sync(shared.store, data(["Pikachu"]), a.meta, 4);
		expect(a2.kind).toBe("downloaded");
		if (a2.kind !== "downloaded") throw new Error();
		expect(a2.remote).toEqual(data(["Pikachu", "Eevee"]));
	});

	it("reports a conflict when both sides changed, resolvable either way", async () => {
		const { store, files } = fakeStore();
		const first = await sync(store, data(["Pikachu"]), undefined, 1);
		if (first.kind === "conflict") throw new Error();
		const [id] = [...files.keys()];
		await store.update(id, encode(data(["Pikachu", "Eevee"]), 2));

		const result = await sync(store, data(["Pikachu", "Bulbasaur"]), first.meta, 3);
		expect(result.kind).toBe("conflict");
		if (result.kind !== "conflict") throw new Error();
		expect(result.remote).toEqual(data(["Pikachu", "Eevee"]));
		expect(result.remoteSavedAt).toBe(2);

		const meta: SyncMeta = await forceUpload(store, data(["Pikachu", "Bulbasaur"]), result.remoteFile.id, 4);
		expect(decode(files.get(id)?.content ?? "").data).toEqual(data(["Pikachu", "Bulbasaur"]));
		expect((await sync(store, data(["Pikachu", "Bulbasaur"]), meta, 5)).kind).toBe("upToDate");
	});

	it("asks before replacing a never-synced device's own box", async () => {
		const { store } = fakeStore();
		await sync(store, data(["Pikachu"]), undefined, 1);
		expect((await sync(store, data(["Eevee"]), undefined, 2)).kind).toBe("conflict");
	});

	it("treats identical data on both sides as up to date", async () => {
		const { store } = fakeStore();
		await sync(store, data(["Pikachu"]), undefined, 1);
		expect((await sync(store, data(["Pikachu"]), undefined, 2)).kind).toBe("upToDate");
	});

	it("rejects files that aren't ours", () => {
		expect(() => decode(JSON.stringify({ hello: 1 }))).toThrow();
	});
});
