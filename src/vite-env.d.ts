/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** OAuth client ID for Google Drive sync; see README. */
	readonly VITE_GOOGLE_CLIENT_ID?: string;
}
