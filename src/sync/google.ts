/**
 * Signing in to the user's own Google account (Google Identity Services token flow) and the Drive
 * file in that account that holds the synced data.
 *
 * The data goes to Drive's hidden app-data folder: only this app can read it, and the app cannot
 * see any of the user's other files (scope drive.appdata). Google's script is only loaded once the
 * user turns sync on.
 */
import type { RemoteFile, RemoteStore } from "./sync";

/** OAuth client ID (a Google Cloud "Web application" client); sync is hidden when unset. */
export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

// openid/email/profile: show who is signed in; drive.appdata: the sync file.
const driveScope = "https://www.googleapis.com/auth/drive.appdata";
const scope = `openid email profile ${driveScope}`;
const fileName = "pokemon-sleep-calculator.json";

interface TokenResponse {
	access_token?: string;
	/** Space-separated scopes the user actually granted (they can untick some on the consent screen). */
	scope?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}
interface GisError {
	type: string;
	message?: string;
}
interface TokenClient {
	requestAccessToken(opts?: { prompt?: string }): void;
}
interface GoogleOAuth {
	initTokenClient(config: {
		client_id: string;
		scope: string;
		callback: (r: TokenResponse) => void;
		error_callback: (e: GisError) => void;
	}): TokenClient;
	revoke(token: string, done?: () => void): void;
}
declare global {
	interface Window {
		google?: { accounts: { oauth2: GoogleOAuth } };
	}
}

let gisScript: Promise<GoogleOAuth> | undefined;
/** Set once Google's script has loaded, so a click can open the popup without waiting (popup blockers). */
let gisLoaded: GoogleOAuth | undefined;
function loadGis(): Promise<GoogleOAuth> {
	gisScript ??= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = "https://accounts.google.com/gsi/client";
		script.async = true;
		script.onload = () => {
			gisLoaded = window.google?.accounts.oauth2;
			if (gisLoaded) resolve(gisLoaded);
			else reject(new Error("Google sign-in unavailable"));
		};
		script.onerror = () => {
			gisScript = undefined;
			reject(new Error("Could not load Google sign-in"));
		};
		document.head.appendChild(script);
	});
	return gisScript;
}

export interface AccessToken {
	token: string;
	expiresAt: number;
}

// Kept for the browser session only, so a reload doesn't ask again; tokens last about an hour.
const tokenKey = "pscalc-sync-token";

export function cachedToken(): AccessToken | undefined {
	try {
		const t = JSON.parse(sessionStorage.getItem(tokenKey) ?? "null") as AccessToken | null;
		return t && t.expiresAt > Date.now() + 60_000 ? t : undefined;
	} catch {
		return undefined;
	}
}

/** Loads Google's script ahead of a click (e.g. on hover), so the click opens the popup straight away. */
export function preloadGoogle() {
	if (googleClientId) loadGis().catch(() => {});
}

let tokenClient: TokenClient | undefined;
let pending: { resolve: (t: AccessToken) => void; reject: (e: Error) => void } | undefined;
let lateListener: ((t: AccessToken) => void) | undefined;

/**
 * Called with a token that arrives after its sign-in was given up as cancelled. Google's script
 * watches whether the popup is closed, and Google's sign-in pages can make it look closed early
 * (Cross-Origin-Opener-Policy), so a "closed" report isn't final. Returns an unsubscribe function.
 */
export function onLateSignIn(listener: (t: AccessToken) => void): () => void {
	lateListener = listener;
	return () => {
		if (lateListener === listener) lateListener = undefined;
	};
}

function handleToken(r: TokenResponse) {
	const p = pending;
	pending = undefined;
	if (!r.access_token) return p?.reject(new Error(r.error_description || r.error || "Sign-in failed"));
	if (!r.scope?.split(" ").includes(driveScope)) return p?.reject(new MissingDriveAccessError());
	const token = { token: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 };
	sessionStorage.setItem(tokenKey, JSON.stringify(token));
	if (p) p.resolve(token);
	else lateListener?.(token);
}

function handleError(e: GisError) {
	const p = pending;
	pending = undefined;
	p?.reject(
		e.type === "popup_closed"
			? new SignInCancelledError()
			: e.type === "popup_failed_to_open"
				? new PopupBlockedError()
				: new Error(e.message || e.type),
	);
}

/**
 * Asks Google for an access token. Call from a click: it opens a popup (just a flash once the user
 * already agreed).
 * @param chooseAccount show the account chooser and consent screen even if already granted.
 */
export function signIn(chooseAccount = false): Promise<AccessToken> {
	const clientId = googleClientId;
	if (!clientId) return Promise.reject(new Error("Google sync is not configured"));
	const start = (oauth: GoogleOAuth) =>
		new Promise<AccessToken>((resolve, reject) => {
			pending?.reject(new SignInCancelledError());
			pending = { resolve, reject };
			tokenClient ??= oauth.initTokenClient({
				client_id: clientId,
				scope,
				callback: handleToken,
				error_callback: handleError,
			});
			tokenClient.requestAccessToken({ prompt: chooseAccount ? "select_account consent" : "" });
		});
	// Open the popup synchronously within the click when possible.
	return gisLoaded ? start(gisLoaded) : loadGis().then(start);
}

/** The sign-in popup was closed (or looked closed) before Google answered. */
export class SignInCancelledError extends Error {
	constructor() {
		super("Sign-in cancelled");
	}
}

/** The browser blocked the sign-in popup. */
export class PopupBlockedError extends Error {
	constructor() {
		super("The sign-in window was blocked");
	}
}

/** The user signed in but left the Google Drive permission unticked on the consent screen. */
export class MissingDriveAccessError extends Error {
	constructor() {
		super("Google Drive access was not granted");
	}
}

export function signOut() {
	const t = cachedToken();
	sessionStorage.removeItem(tokenKey);
	if (t) loadGis().then((oauth) => oauth.revoke(t.token), () => {});
}

export class AuthExpiredError extends Error {}

export interface GoogleAccount {
	email?: string;
	name?: string;
	picture?: string;
}

/** The signed-in user's name, email and picture. */
export async function fetchAccount(token: string): Promise<GoogleAccount> {
	const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${token}` } });
	if (res.status === 401) {
		sessionStorage.removeItem(tokenKey);
		throw new AuthExpiredError("Google sign-in expired");
	}
	if (!res.ok) throw new Error(`Google account error ${res.status}`);
	const { email, name, picture } = (await res.json()) as GoogleAccount;
	return { email, name, picture };
}

/** The sync file in Drive's app-data folder. */
export function driveStore(token: string): RemoteStore {
	const call = async (url: string, init: RequestInit = {}) => {
		const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
		if (res.status === 401) {
			sessionStorage.removeItem(tokenKey);
			throw new AuthExpiredError("Google sign-in expired");
		}
		if (!res.ok) {
			const text = await res.text();
			let message = text.slice(0, 200);
			try {
				message = (JSON.parse(text) as { error: { message: string } }).error.message;
			} catch {}
			throw new Error(`Google Drive: ${message} (${res.status})`);
		}
		return res;
	};
	const api = "https://www.googleapis.com/drive/v3/files";
	const upload = "https://www.googleapis.com/upload/drive/v3/files";
	const fields = "fields=id,version";
	const asFile = async (res: Response): Promise<RemoteFile> => {
		const f = (await res.json()) as { id: string; version: string };
		return { id: f.id, version: String(f.version) };
	};
	return {
		async find() {
			const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
			const res = await call(`${api}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&fields=files(id,version)`);
			const { files } = (await res.json()) as { files: { id: string; version: string }[] };
			return files[0] && { id: files[0].id, version: String(files[0].version) };
		},
		async download(id) {
			return (await call(`${api}/${id}?alt=media`)).text();
		},
		async create(content) {
			const boundary = `pscalc${Math.random().toString(36).slice(2)}`;
			const metadata = JSON.stringify({ name: fileName, parents: ["appDataFolder"], mimeType: "application/json" });
			const body =
				`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
				`--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
			return asFile(
				await call(`${upload}?uploadType=multipart&${fields}`, {
					method: "POST",
					headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
					body,
				}),
			);
		},
		async update(id, content) {
			return asFile(
				await call(`${upload}/${id}?uploadType=media&${fields}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: content,
				}),
			);
		},
	};
}
