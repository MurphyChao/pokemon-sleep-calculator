import { describe, expect, it } from "vitest";
import { bestMatch, normalize } from "./match";

const subskills = [
	{ key: "Helping Speed S", names: ["Helping Speed S", "幫忙速度S", "おてつだいスピードS"] },
	{ key: "Helping Speed M", names: ["Helping Speed M", "幫忙速度M", "おてつだいスピードM"] },
	{ key: "Research EXP Bonus", names: ["Research EXP Bonus", "研究EXP獎勵", "リサーチEXPボーナス"] },
];

describe("normalize", () => {
	it("drops spaces OCR puts between characters and folds look-alike characters", () => {
		expect(normalize("お て つ だ い ス ピ一 ド M")).toBe(normalize("おてつだいスピードM"));
		expect(normalize("スキ ル 確 率 ア ッ プ M")).toBe("スキル確率アップM");
	});
	it("reads a trailing 5 or $ as S", () => {
		expect(normalize("幫忙 速度 $")).toBe("幫忙速度S");
		expect(normalize("技能 機 率 提升 5")).toBe("技能機率提升S");
	});
});

describe("bestMatch", () => {
	it("tells S and M apart", () => {
		expect(bestMatch("幫忙 速度 $", subskills)?.key).toBe("Helping Speed S");
		expect(bestMatch("お て つ だ い ス ピー ド M", subskills)?.key).toBe("Helping Speed M");
	});
	it("tolerates a misread character", () => {
		expect(bestMatch("リサ ー チ EXP ボ ポー ナス", subskills)?.key).toBe("Research EXP Bonus");
	});
	it("rejects unrelated text", () => {
		expect(bestMatch("每1小時21分20秒", subskills)).toBeUndefined();
	});
	it("finds a name inside a longer line when partial", () => {
		const pokemon = [
			{ key: "Shinx", names: ["Shinx", "小貓怪", "コリンク"] },
			{ key: "Luxio", names: ["Luxio", "勒克貓", "ルクシオ"] },
		];
		expect(bestMatch("Lv.14 コリ ンク", pokemon, { partial: true })?.key).toBe("Shinx");
	});
});
