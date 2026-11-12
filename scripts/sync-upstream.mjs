// Copies the calculation code we reuse from nitoyon/pokesleep-tool (MIT) into src/vendor/pokesleep-tool.
// Usage: git clone https://github.com/nitoyon/pokesleep-tool.git .upstream/pokesleep-tool && node scripts/sync-upstream.mjs
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const upstream = ".upstream/pokesleep-tool";
const dest = "src/vendor/pokesleep-tool";
const entries = ["src/util/PokemonStrength.ts", "src/util/PokemonIv.ts", "src/util/PokemonRp.ts"];
// English display names for ingredients, natures, etc.
const extraFiles = ["src/i18n/en/data.json"];

const seen = new Set(extraFiles);
const stack = [...entries];
while (stack.length) {
	const file = stack.pop();
	if (seen.has(file)) continue;
	seen.add(file);
	const src = readFileSync(join(upstream, file), "utf8");
	for (const [, rel] of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
		const base = normalize(join(dirname(file), rel));
		const hit = ["", ".ts", ".tsx", ".json"].map((e) => base + e).find((p) => existsSync(join(upstream, p)) && !p.endsWith("/"));
		if (hit) stack.push(hit);
	}
}

rmSync(dest, { recursive: true, force: true });
for (const file of seen) {
	const out = join(dest, file.replace(/^src\//, ""));
	mkdirSync(dirname(out), { recursive: true });
	cpSync(join(upstream, file), out);
}
const commit = execSync("git rev-parse HEAD", { cwd: upstream }).toString().trim();
writeFileSync(
	join(dest, "NOTICE.md"),
	`Files in this directory are copied unmodified from https://github.com/nitoyon/pokesleep-tool\n` +
		`(commit ${commit}), licensed under the MIT License. Copyright (c) nitoyon.\n\n` +
		`Do not edit by hand; re-run \`node scripts/sync-upstream.mjs\`.\n\nFiles:\n` +
		[...seen].sort().map((f) => `- ${f}`).join("\n") + "\n",
);
console.log(`Copied ${seen.size} files from ${commit}`);
