/**
 * Pokémon icons learned from the user's own screenshot imports: when a reading is confirmed ("Add to
 * box") and its icon wasn't already recognized as that Pokémon, the icon becomes a reference for it, so the
 * next screenshot of that Pokémon is recognized by its icon even if the name is a nickname. Kept in
 * localStorage (and so in Google sync) as base64 of the normalized icon's RGBA pixels (about 12 KB each).
 */
import type { IconReference } from "../ocr/pokemonIcon";
import { iconDistance, iconSize, maxMatchDistance } from "../ocr/pokemonIcon";
import type { RgbaImage } from "../ocr/image";
import { storageChangedEvent } from "./storage";

export const learnedIconsKey = "pscalc.learnedIcons";
/** Most icons kept per Pokémon (shiny, costumes…). */
const maxPerPokemon = 5;

interface StoredIcon {
	pokemonName: string;
	/** Base64 of iconSize × iconSize RGBA pixels. */
	pixels: string;
}

function toBase64(bytes: ArrayLike<number> & { subarray(a: number, b: number): ArrayLike<number> }): string {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
	return btoa(s);
}

function fromBase64(text: string): Uint8ClampedArray {
	const s = atob(text);
	const out = new Uint8ClampedArray(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

function readStored(): StoredIcon[] {
	try {
		const list = JSON.parse(localStorage.getItem(learnedIconsKey) ?? "[]");
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

/** Learned reference icons (skipping any that don't decode to the expected size). */
export function readLearnedIcons(): IconReference[] {
	return readStored().flatMap((s) => {
		const data = fromBase64(s.pixels);
		return data.length === iconSize * iconSize * 4
			? [{ pokemonName: s.pokemonName, icon: { width: iconSize, height: iconSize, data } }]
			: [];
	});
}

/**
 * Learns `icon` as `pokemonName`'s, unless a learned icon of it already looks the same or it has the
 * most kept. Returns whether it was added.
 */
export function learnIcon(pokemonName: string, icon: RgbaImage): boolean {
	if (icon.width !== iconSize || icon.height !== iconSize) return false;
	const own = readLearnedIcons().filter((r) => r.pokemonName === pokemonName);
	if (own.length >= maxPerPokemon || own.some((r) => iconDistance(icon, r.icon) <= maxMatchDistance)) return false;
	localStorage.setItem(learnedIconsKey, JSON.stringify([...readStored(), { pokemonName, pixels: toBase64(icon.data) }]));
	window.dispatchEvent(new Event(storageChangedEvent));
	return true;
}
