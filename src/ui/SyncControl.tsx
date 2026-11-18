import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AccessToken,
	AuthExpiredError,
	cachedToken,
	driveStore,
	fetchAccount,
	type GoogleAccount,
	googleClientId,
	MissingDriveAccessError,
	SignInDeniedError,
	signIn,
	signOut,
	takeSignInResult,
} from "../sync/google";
import { acceptRemote, forceUpload, type RemoteFile, type SyncData, type SyncMeta, sync } from "../sync/sync";
import { t } from "./i18n";
import { storageChangedEvent, storagePrefix, storageReplacedEvent } from "./storage";

/** Sync settings on this device; deliberately outside the "pscalc." keys so they aren't synced. */
const settingsKey = "pscalc-sync";
interface SyncSettings {
	/** Signed in (sync on). */
	enabled: boolean;
	account?: GoogleAccount;
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
	| { kind: "signingIn" }
	| { kind: "syncing" }
	| { kind: "signIn" }
	| { kind: "error"; message: string }
	| { kind: "conflict"; remote: SyncData; remoteFile: RemoteFile; remoteSavedAt?: number };

const autoSyncDelay = 2000;

function errorMessage(e: unknown): string {
	if (e instanceof MissingDriveAccessError) return t("syncNeedDrive");
	if (e instanceof SignInDeniedError) return t("syncDenied");
	return e instanceof Error ? e.message : String(e);
}

function GoogleLogo() {
	return (
		<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
			<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
			<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
			<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
			<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
		</svg>
	);
}

export default function SyncControl() {
	// Read before any effect runs, so the auto sync on load already sees a token Google just returned.
	const [signInResult] = useState(takeSignInResult);
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
					const token = cachedToken();
					if (!token) {
						if (!interactive) return setStatus({ kind: "signIn" });
						// Leaves the page; the sync runs again when Google sends the user back.
						return signIn({ loginHint: loadSettings().account?.email });
					}
					try {
						const meta = loadSettings().meta;
						const result = await sync(driveStore(token.token), readLocal(), meta, Date.now());
						if (result.kind === "conflict") return setStatus(result);
						if (result.kind === "downloaded") writeLocal(result.remote);
						setSettings({ ...loadSettings(), enabled: true, meta: result.meta });
						setStatus({ kind: "idle" });
						return;
					} catch (e) {
						if (!(e instanceof AuthExpiredError) || attempt > 0 || !interactive) throw e;
					}
				}
			} catch (e) {
				setStatus(e instanceof AuthExpiredError ? { kind: "signIn" } : { kind: "error", message: errorMessage(e) });
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

	/** After the first sign-in on this device: remember the account, then sync. */
	const finishSignIn = useCallback(
		async (token: AccessToken) => {
			try {
				const account = await fetchAccount(token.token);
				// Not "enabled" until the first sync succeeds (or its conflict is resolved).
				localStorage.setItem(settingsKey, JSON.stringify({ enabled: false, account } satisfies SyncSettings));
				await run(true);
			} catch (e) {
				setStatus({ kind: "error", message: errorMessage(e) });
			}
		},
		[run],
	);

	// Coming back from Google's sign-in page: finish signing in, or show why it failed.
	const handledSignIn = useRef(false);
	useEffect(() => {
		if (handledSignIn.current) return;
		handledSignIn.current = true;
		const result = signInResult;
		if (!result) return;
		if ("error" in result) setStatus({ kind: "error", message: errorMessage(result.error) });
		else if (!loadSettings().enabled) void finishSignIn(result.token);
		// Already signed in before: the auto sync above picks up the renewed token.
	}, [signInResult, finishSignIn]);

	if (!googleClientId) return null;

	const turnOn = () => {
		setStatus({ kind: "signingIn" });
		signIn({ chooseAccount: true });
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
				setSettings({ ...loadSettings(), enabled: true, meta: acceptRemote(status.remote, status.remoteFile, now) });
			} else {
				setSettings({
					...loadSettings(),
					enabled: true,
					meta: await forceUpload(driveStore(token.token), readLocal(), status.remoteFile.id, now),
				});
			}
			setStatus({ kind: "idle" });
		} catch (e) {
			setStatus({ kind: "error", message: errorMessage(e) });
		}
	};

	const time = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

	if (!settings.enabled && status.kind !== "conflict") {
		return (
			<div className="sync">
				<button
					type="button"
					className="google-signin"
					onClick={turnOn}
					disabled={status.kind === "syncing"}
					title={t("syncHint")}
					aria-label={status.kind === "signingIn" || status.kind === "syncing" ? t("syncSigningIn") : t("syncTurnOn")}
				>
					<GoogleLogo />
					{/* Phones show just the logo (App.css). */}
					<span className="google-label">
						{status.kind === "signingIn" || status.kind === "syncing" ? t("syncSigningIn") : t("syncTurnOn")}
					</span>
				</button>
				{status.kind === "error" && <span className="sync-error small">{status.message}</span>}
			</div>
		);
	}

	const account = settings.account ?? loadSettings().account;
	return (
		<div className="sync">
			<span className="account" title={account?.email}>
				{account?.picture && <img src={account.picture} alt="" referrerPolicy="no-referrer" />}
				<span className="account-name">{account?.name || account?.email || t("syncSignedIn")}</span>
			</span>
			<span className="muted small sync-status" title={t("syncHint")}>
				{status.kind === "syncing"
					? t("syncSyncing")
					: status.kind === "signIn"
						? t("syncSignIn")
						: settings.meta
							? t("syncedAt", { time: time(settings.meta.syncedAt) })
							: t("syncOn")}
			</span>
			{status.kind === "error" && <span className="sync-error small">{status.message}</span>}
			<button
				type="button"
				className="sync-now"
				aria-label={t("syncNow")}
				onClick={() => run(true)}
				disabled={status.kind === "syncing" || status.kind === "conflict"}
			>
				{/* Phones show just the icon (App.css). */}
				<span className="sync-now-icon" aria-hidden="true">
					⟳
				</span>
				<span className="sync-now-label">{t("syncNow")}</span>
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
