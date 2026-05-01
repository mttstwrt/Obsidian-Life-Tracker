import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import UnoCSS from "unocss/vite";
import { type Plugin, type PluginOption, defineConfig } from "vite";

const setOutDir = (mode: string) => {
	switch (mode) {
		case "development":
			return "./test-vault/.obsidian/plugins/obsidian-life-tracker";
		case "production":
			return "build";
	}
};

function copyAssets(getOutDir: () => string, mode: string): Plugin {
	return {
		name: "lt:copy-assets",
		apply: "build",
		closeBundle() {
			const outDir = resolve(__dirname, getOutDir());
			const manifestSrc = resolve(__dirname, "public/manifest.json");
			const versionsSrc = resolve(__dirname, "public/versions.json");
			copyFileSync(manifestSrc, resolve(outDir, "manifest.json"));
			if (existsSync(versionsSrc)) {
				copyFileSync(versionsSrc, resolve(outDir, "versions.json"));
			}
			if (mode === "development") {
				const hotreload = resolve(outDir, ".hotreload");
				if (!existsSync(hotreload)) writeFileSync(hotreload, "");
			}
		},
	};
}

export default defineConfig(({ mode }) => {
	const outDir = setOutDir(mode) ?? "build";
	return {
		plugins: [
			UnoCSS(),
			svelte({ preprocess: vitePreprocess() }) as PluginOption,
			copyAssets(() => outDir, mode),
		],
		build: {
			lib: {
				entry: "src/main",
				formats: ["cjs"],
			},
			rollupOptions: {
				output: {
					entryFileNames: "main.js",
					assetFileNames: "styles.css",
					sourcemapBaseUrl: pathToFileURL(
						`${__dirname}/test-vault/.obsidian/plugins/obsidian-life-tracker/`,
					).toString(),
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					...builtins,
				],
			},
			outDir,
			emptyOutDir: false,
			sourcemap: "inline",
		},
	};
});
