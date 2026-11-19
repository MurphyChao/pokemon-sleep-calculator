import { useEffect } from "react";
import { useStoredState } from "./storage";

/** "auto" follows the device's light/dark setting. */
export type Theme = "auto" | "light" | "dark";
export const themes: Theme[] = ["auto", "light", "dark"];

/**
 * Saved per device, not under "pscalc." so Google sync leaves it alone (a phone and a PC may want different
 * themes). index.html reads it too, to apply it before the page first draws.
 */
export const themeKey = "pscalc-theme";

/** Shows the theme: sets data-theme on <html> (App.css picks the colors), none for "auto". */
export function applyTheme(theme: Theme) {
	if (theme === "auto") delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = theme;
}

/** The saved theme, applied whenever it changes. */
export function useTheme(): [Theme, (theme: Theme) => void] {
	const [stored, setTheme] = useStoredState<Theme>(themeKey, "auto");
	const theme = themes.includes(stored) ? stored : "auto";
	useEffect(() => applyTheme(theme), [theme]);
	return [theme, setTheme];
}
