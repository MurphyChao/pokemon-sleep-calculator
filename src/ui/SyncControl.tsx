import { useCallback, useEffect, useRef, useState } from "react";
import { AuthExpiredError, cachedToken, driveStore, googleClientId, signIn, signOut } from "../sync/google";
import { acceptRemote, forceUpload, type RemoteFile, type SyncData, type SyncMeta, sync } from "../sync/sync";
import { t } from "./i18n";
import { storageChangedEvent, storagePrefix, storageReplacedEvent } from "./storage";

/** Sync settings on this device; deliberately outside the "pscalc." keys so they aren't synced. */
const settingsKey = "pscalc-sync";
interface SyncSettings {
	enabled: boolean;
	meta?: SyncMeta;
}

function loadSettings(): SyncSettings {
	try {
		return { enabled: false, ...JSON.parse(localStorage.getItem(settingsKey) ?? "{}") };
	} catch {
		return { enabled: false };
	}
}

function saveSettings(s: SyncSettings) {
	if (s.enabled) localStorage.setItem(settingsKey, JSON.stringify(s));
	else localStorage.removeItem(settingsKey);
}

function readLocal(): SyncData {
	const data: SyncData = {};
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(storagePrefix)) data[key] = localStorage.getItem(key) ?? "";
	}
	return data;
}

/** Replaces this device's saved data and tells the page to re-read it. */
function writeLocal(data: SyncData) {
	for (const key of Object.keys(readLocal())) if (!(key in data)) localStorage.removeItem(key);
	for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
	window.dispatchEvent(new Event(storageReplacedEvent));
}

type Status =
	| { kind: "idle" }
	| { kind: "syncing" }
	| { kind: "signIn" }
	| { kind: "error"; message: string }
	| { kind: "conflict"; remote: SyncData; remoteFile: RemoteFile; remoteSavedAt?: number };

const autoSyncDelay = 2000;

export default function SyncControl() {
	const [settings, setSettingsState] = useState(loadSettings);
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const running = useRef(false);
	const again = useRef(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	const setSettings = useCallback((s: SyncSettings) => {
		saveSettings(s);
		setSettingsState(s);
	}, []);

	/** @param interactive started by a click, so a sign-in popup is allowed. */
	const run = useCallback(
		async (interactive: boolean) => {
			if (running.current) {
				again.current = true;
				return;
			}
			running.current = true;
			setStatus({ kind: "syncing" });
			try {
				for (let attempt = 0; ; attempt++) {
					let token = cachedToken();
					if (!token) {
						if (!interactive) return setStatus({ kind: "signIn" });
						token = await signIn();
					}
					try {
						const meta = loadSettings().meta;
						const result = await sync(driveStore(token.token), readLocal(), meta, Date.now());
						if (result.kind === "conflict") return setStatus(result);
						if (result.kind === "downloaded") writeLocal(result.remote);
						setSettings({ enabled: true, meta: result.meta });
						setStatus({ kind: "idle" });
						return;
					} catch (e) {
						if (!(e instanceof AuthExpiredError) || attempt > 0) throw e;
					}
				}
			} catch (e) {
				setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
			} finally {
				running.current = false;
				if (again.current) {
					again.current = false;
					if (cachedToken()) void run(false);
				}
			}
		},
		[setSettings],
	);

	// Sync on load, when the tab comes back into view, and shortly after any change.
	useEffect(() => {
		if (!settings.enabled) return;
		const auto = () => {
			if (cachedToken()) void run(false);
			else setStatus((s) => (s.kind === "idle" ? { kind: "signIn" } : s));
		};
		const onChange = () => {
			clearTimeout(timer.current);
			timer.current = setTimeout(auto, autoSyncDelay);
		};
		const onVisible = () => document.visibilityState === "visible" && auto();
		auto();
		window.addEventListener(storageChangedEvent, onChange);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearTimeout(timer.current);
			window.removeEventListener(storageChangedEvent, onChange);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [settings.enabled, run]);

	if (!googleClientId) return null;

	const turnOn = async () => {
		setStatus({ kind: "syncing" });
		try {
			await signIn(true);
			await run(true);
		} catch (e) {
			setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
		}
	};
	const turnOff = () => {
		signOut();
		setSettings({ enabled: false });
		setStatus({ kind: "idle" });
	};
	const resolve = async (keep: "local" | "remote") => {
		if (status.kind !== "conflict") return;
		const token = cachedToken();
		if (!token) return run(true);
		try {
			const now = Date.now();
			if (keep === "remote") {
				writeLocal(status.remote);
				setSettings({ enabled: true, meta: acceptRemote(status.remote, status.remoteFile, now) });
			} else {
				setSettings({
					enabled: true,
					meta: await forceUpload(driveStore(token.token), readLocal(), status.remoteFile.id, now),
				});
			}
			setStatus({ kind: "idle" });
		} catch (e) {
			setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
		}
	};

	const time = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

	if (!settings.enabled && status.kind !== "conflict") {
		return (
			<div className="sync">
				<button type="button" onClick={turnOn} disabled={status.kind === "syncing"}>
					{status.kind === "syncing" ? t("syncSyncing") : t("syncTurnOn")}
				</button>
				{status.kind === "error" && <span className="sync-error small">{status.message}</span>}
			</div>
		);
	}

	return (
		<div className="sync">
			<span className="muted small" title={t("syncHint")}>
				{status.kind === "syncing"
					? t("syncSyncing")
					: status.kind === "signIn"
						? t("syncSignIn")
						: settings.meta
							? t("syncedAt", { time: time(settings.meta.syncedAt) })
							: t("syncOn")}
			</span>
			{status.kind === "error" && <span className="sync-error small">{status.message}</span>}
			<button type="button" onClick={() => run(true)} disabled={status.kind === "syncing" || status.kind === "conflict"}>
				{t("syncNow")}
			</button>
			<button type="button" className="link" onClick={turnOff}>
				{t("syncTurnOff")}
			</button>
			{status.kind === "conflict" && (
				<div className="sync-conflict">
					<p>{t("syncConflict")}</p>
					<button type="button" onClick={() => resolve("local")}>
						{t("syncKeepLocal")}
					</button>
					<button type="button" onClick={() => resolve("remote")}>
						{status.remoteSavedAt
							? t("syncUseRemoteAt", { time: time(status.remoteSavedAt) })
							: t("syncUseRemote")}
					</button>
				</div>
			)}
		</div>
	);
}
