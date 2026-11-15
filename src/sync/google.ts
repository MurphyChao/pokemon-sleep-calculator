/**
 * Signing in to the user's own Google account and the Drive file in that account that holds the
 * synced data.
 *
 * Sign-in uses Google's OAuth 2.0 flow for browser apps with a full-page redirect: the page goes to
 * Google and comes back with an access token in the URL fragment. (Google Identity Services' popup
 * flow was tried first, but in some browsers the popup closed after "Allow" without ever handing the
 * token back to the page.)
 *
 * The data goes to Drive's hidden app-data folder: only this app can read it, and the app cannot
 * see any of the user's other files (scope drive.appdata).
 */
import type { RemoteFile, RemoteStore } from "./sync";

/** OAuth client ID (a Google Cloud "Web application" client); sync is hidden when unset. */
export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

// openid/email/profile: show who is signed in; drive.appdata: the sync file.
const driveScope = "https://www.googleapis.com/auth/drive.appdata";
const scope = `openid email profile ${driveScope}`;
const fileName = "pokemon-sleep-calculator.json";

export interface AccessToken {
	token: string;
	expiresAt: number;
}

// Kept for the browser session only, so a reload doesn't ask again; tokens last about an hour.
const tokenKey = "pscalc-sync-token";
/** The random state sent with a sign-in, to check that the redirect back answers it. */
const stateKey = "pscalc-sync-state";

export function cachedToken(): AccessToken | undefined {
	try {
		const t = JSON.parse(sessionStorage.getItem(tokenKey) ?? "null") as AccessToken | null;
		return t && t.expiresAt > Date.now() + 60_000 ? t : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The address Google sends the user back to: the app's own page (must be listed under "Authorized
 * redirect URIs" in the OAuth client).
 */
export function redirectUri(): string {
	return new URL(import.meta.env.BASE_URL, window.location.href).href.replace(/[?#].*$/, "");
}

/**
 * Sends the page to Google's sign-in; it comes back to this page, where takeSignInResult() picks up
 * the token. Everything the app saves is in localStorage, so only the open tab and forms are lost.
 * @param chooseAccount show Google's account chooser even if already signed in to one account.
 * @param loginHint the email of the account to renew the sign-in for.
 */
export function signIn(opts: { chooseAccount?: boolean; loginHint?: string } = {}) {
	if (!googleClientId) throw new Error("Google sync is not configured");
	const state = crypto.randomUUID();
	sessionStorage.setItem(stateKey, state);
	const params = new URLSearchParams({
		client_id: googleClientId,
		redirect_uri: redirectUri(),
		response_type: "token",
		scope,
		include_granted_scopes: "true",
		state,
	});
	if (opts.chooseAccount) params.set("prompt", "select_account");
	if (opts.loginHint) params.set("login_hint", opts.loginHint);
	window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

export type SignInResult = { token: AccessToken } | { error: Error };

let signInResult: SignInResult | undefined | null = null;

/**
 * If this page load is the redirect back from Google's sign-in: its token (saved for the session) or
 * error. The URL fragment is cleared. Returns the same result on every call during this page load.
 */
export function takeSignInResult(): SignInResult | undefined {
	if (signInResult !== null) return signInResult;
	signInResult = undefined;
	const hash = new URLSearchParams(window.location.hash.slice(1));
	const state = hash.get("state");
	if (!state || !(hash.has("access_token") || hash.has("error"))) return undefined;
	window.history.replaceState(null, "", window.location.pathname + window.location.search);
	const expected = sessionStorage.getItem(stateKey);
	sessionStorage.removeItem(stateKey);
	if (state !== expected) return (signInResult = { error: new Error("Sign-in response didn't match; please try again") });
	const error = hash.get("error");
	if (error) {
		return (signInResult = {
			error: error === "access_denied" ? new SignInDeniedError() : new Error(`Google sign-in: ${hash.get("error_description") || error}`),
		});
	}
	if (!hash.get("scope")?.split(" ").includes(driveScope)) return (signInResult = { error: new MissingDriveAccessError() });
	const token = { token: hash.get("access_token") ?? "", expiresAt: Date.now() + Number(hash.get("expires_in") ?? 3600) * 1000 };
	sessionStorage.setItem(tokenKey, JSON.stringify(token));
	return (signInResult = { token });
}

/** The user cancelled on Google's consent screen (or Google refused access). */
export class SignInDeniedError extends Error {
	constructor() {
		super("Google sign-in was cancelled or denied");
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
	// Google's revoke endpoint doesn't send CORS headers; the request still goes through.
	if (t) {
		fetch("https://oauth2.googleapis.com/revoke", {
			method: "POST",
			mode: "no-cors",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ token: t.token }),
		}).catch(() => {});
	}
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
