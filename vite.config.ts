import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/**
 * Files the screenshot importer's OCR engine (Tesseract.js) loads at run time, served from our own
 * site under tesseract/ instead of the jsDelivr CDN. Keys are paths under tesseract/; see src/ocr/browser.ts.
 */
function tesseractFiles(): Record<string, string> {
	const core = pkgDir("tesseract.js-core");
	const files: Record<string, string> = {
		"worker.min.js": join(pkgDir("tesseract.js"), "dist/worker.min.js"),
	};
	// The worker picks one of these depending on the browser's WebAssembly SIMD support.
	for (const variant of ["relaxedsimd-lstm", "simd-lstm", "lstm"]) {
		const name = `tesseract-core-${variant}.wasm.js`;
		files[`core/${name}`] = join(core, name);
	}
	for (const lang of ["chi_tra", "jpn", "eng"]) {
		files[`lang/${lang}.traineddata.gz`] = join(
			pkgDir(`@tesseract.js-data/${lang}`),
			`4.0.0_best_int/${lang}.traineddata.gz`,
		);
	}
	return files;
}

function tesseractAssets(): Plugin {
	const files = tesseractFiles();
	return {
		name: "tesseract-assets",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = req.url?.split("?")[0].replace(/^.*?\/tesseract\//, "");
				const file = req.url?.includes("/tesseract/") && path ? files[path] : undefined;
				if (!file) return next();
				res.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
				res.end(readFileSync(file));
			});
		},
		generateBundle() {
			for (const [path, file] of Object.entries(files)) {
				this.emitFile({ type: "asset", fileName: `tesseract/${path}`, source: readFileSync(file) });
			}
		},
	};
}

export default defineConfig({
	base: "./",
	plugins: [react(), tesseractAssets()],
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		// Rarity and Rank tests roll species 2,000 times: 1–2 s on a fast machine, several times that on GitHub's
		// runners, past the default 5 s.
		testTimeout: 30_000,
	},
});
