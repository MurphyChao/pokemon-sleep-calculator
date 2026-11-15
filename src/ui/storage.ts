import { useEffect, useState } from "react";

/** Prefix of every localStorage key the app saves (and Google sync copies). */
export const storagePrefix = "pscalc.";
/** Fired on window after saved values were replaced from outside (e.g. by Google sync): hooks re-read them. */
export const storageReplacedEvent = "pscalc:storage-replaced";
/** Fired on window when a hook saved a changed value. */
export const storageChangedEvent = "pscalc:storage-changed";

function read<T>(key: string, initial: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw === null ? initial : (JSON.parse(raw) as T);
	} catch {
		return initial;
	}
}

/** useState that persists JSON to localStorage. */
export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
	const [value, setValue] = useState<T>(() => read(key, initial));
	useEffect(() => {
		const reload = () => setValue(read(key, initial));
		window.addEventListener(storageReplacedEvent, reload);
		return () => window.removeEventListener(storageReplacedEvent, reload);
	}, [key]);
	useEffect(() => {
		const raw = JSON.stringify(value);
		if (localStorage.getItem(key) === raw) return;
		localStorage.setItem(key, raw);
		window.dispatchEvent(new Event(storageChangedEvent));
	}, [key, value]);
	return [value, setValue];
}
