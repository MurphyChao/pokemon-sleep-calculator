import { describe, expect, it } from "vitest";
import { fileNameTime, metadataTime, photoTakenAt } from "./photoDate";

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe("metadataTime", () => {
	it("reads an iPhone screenshot's XMP date", () => {
		const xmp = '\x89PNG....iTXtXML:com.adobe.xmp<rdf:Description><photoshop:DateCreated>2026-11-23T07:36:56</photoshop:DateCreated>';
		expect(metadataTime(bytes(xmp))).toBe("2026-11-23T07:36:56");
	});
	it("reads XMP attributes and dates without seconds", () => {
		expect(metadataTime(bytes('<rdf:Description xmp:CreateDate="2026-11-23T07:36">'))).toBe("2026-11-23T07:36:00");
	});
	it("reads an EXIF date", () => {
		expect(metadataTime(bytes("\xff\xd8\xff\xe1..Exif\0\0MM\0*....2026:11:13 11:19:14\0"))).toBe("2026-11-13T11:19:14");
	});
	it("finds nothing in a stripped file", () => {
		expect(metadataTime(bytes("\xff\xd8\xff\xe0..JFIF\0 no dates here 1234:56:78"))).toBeUndefined();
	});
});

describe("fileNameTime", () => {
	it.each([
		["Screenshot_20261113-111914.png", "2026-11-13T11:19:14"],
		["Screenshot_2026-11-13-11-19-14-123_jp.pokemon.pokemonsleep.jpg", "2026-11-13T11:19:14"],
		["photo_2026-11-26_12-26-53.jpg", "2026-11-26T12:26:53"],
		["Screenshot 2026-11-13 at 11.19.14.png", "2026-11-13T11:19:14"],
		["IMG_20261113_111914.jpg", "2026-11-13T11:19:14"],
	])("%s", (name, time) => {
		expect(fileNameTime(name)).toBe(time);
	});
	it("ignores names without a date", () => {
		expect(fileNameTime("70182082-3883-4F6D-ABD1-207A1DB9A50A.png")).toBeUndefined();
		expect(fileNameTime("IMG_1234.PNG")).toBeUndefined();
	});
});

describe("photoTakenAt", () => {
	it("prefers the metadata to the file name", () => {
		expect(photoTakenAt(bytes("<photoshop:DateCreated>2026-11-23T07:36:56<"), "photo_2026-11-26_12-26-53.jpg")).toEqual({
			time: "2026-11-23T07:36:56",
			source: "metadata",
		});
		expect(photoTakenAt(bytes("nothing"), "photo_2026-11-26_12-26-53.jpg")).toEqual({
			time: "2026-11-26T12:26:53",
			source: "fileName",
		});
		expect(photoTakenAt(bytes("nothing"), "IMG_1234.PNG")).toBeUndefined();
	});
});
