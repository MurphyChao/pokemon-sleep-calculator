/// <reference types="vite/client" />

/** Identifies this build (set by vite.config.ts): results saved by another build aren't reused. */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
	/** OAuth client ID for Google Drive sync; see README. */
	readonly VITE_GOOGLE_CLIENT_ID?: string;
}
