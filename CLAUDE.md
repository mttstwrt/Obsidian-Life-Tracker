# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The directory name (`obsidian-event-tracker`) and the README describe a planned **Life Tracker** Obsidian plugin — a unified habit / maintenance / reverse-habit / project / counter tracker built on a single event-stream model. The actual code is still the unmodified **`obsidian-svelte-plugin`** starter template (an example view that mounts a Svelte component). None of the Life Tracker concepts (definitions, events, fieldSchema, dashboard) exist yet.

When the user asks for feature work, assume it's a step in the README's phased plan (Phase 0 → Phase 7) unless they say otherwise. Phase 0 (parser/writer round-trip with unit tests) and Phase 1 (data layer over Obsidian's Vault API) are the natural starting points and should land before any UI work.

## Stack note

The README's "Tech stack" section says **Svelte 5 (runes mode)** and **esbuild**. The repo is Svelte 5 + runes, but the bundler is **Vite 6** — chosen over esbuild because the existing config already handles Obsidian's quirks (CJS lib output, externals list, `sourcemapBaseUrl` for devtools) and the README's esbuild line is just inherited from `obsidian-sample-plugin`'s default. Nothing in the Life Tracker plan actually depends on esbuild.

Write new components in runes mode (`$state`, `$derived`, `$effect`, `$props`). Mount Svelte components from Obsidian views via `mount()` / `unmount()` from `svelte` — see `src/views/ExampleView.ts` for the pattern. The legacy `new Component({ target })` API is gone in Svelte 5.

## Commands

Package manager is **bun** (`bun.lockb` present).

- `bun dev` — Vite watch build. Outputs into `test-vault/.obsidian/plugins/obsidian-svelte-plugin/` so you can reload the plugin live in Obsidian pointed at `test-vault/`.
- `bun run build` — production build into `build/`.
- `bun run check` — `svelte-check` against `tsconfig.json` (type-checks `.ts` and `.svelte`).
- `bun run format` — Biome formatter on `src/`.
- `bun run lint` — Biome linter with `--apply-unsafe` (will rewrite source).

There is no test runner configured. When Phase 0 work begins, the README expects unit tests for the parser/writer; pick a runner (bun's built-in `bun test` is the obvious fit given `bun-types` in devDeps) and add the script before writing tests.

## Build / runtime architecture

`vite.config.ts` is non-standard in two ways that matter:

1. **Output dir switches on mode.** `development` writes directly into `test-vault/.obsidian/plugins/obsidian-svelte-plugin/`; `production` writes to `build/`. `emptyOutDir: false` so Obsidian's `data.json` and other plugin files survive rebuilds.
2. **Library build, CJS only.** Entry is `src/main`, output is a single `main.js` + `styles.css`. Obsidian loads plugins as CommonJS, so this is required — don't switch to ESM output.
3. **Externals matter.** `obsidian`, `electron`, all `@codemirror/*`, all `@lezer/*`, and Node builtins are external. Anything imported from these is provided by Obsidian at runtime; bundling them will break the plugin.

`sourcemap: "inline"` plus `sourcemapBaseUrl` pointing at the test vault is how breakpoints in Obsidian's devtools map back to TS — the README's "Source mapping" section explains the path setup if it stops working.

UnoCSS is wired through Vite (`uno.config.ts`) with the Svelte extractor and `presetUno` (Tailwind-compatible utilities). Styles are imported via `import "virtual:uno.css"` in `src/main.ts`.

## Plugin entry shape

`src/main.ts` exports the default `Plugin` subclass Obsidian instantiates. The current scaffold:

- Loads/saves settings via `loadData()`/`saveData()` (Obsidian's per-plugin JSON storage — this is **not** where Life Tracker definitions or events go; those live in vault markdown files per the README).
- Registers a custom `ItemView` (`VIEW_TYPE_EXAMPLE`) and a ribbon icon that activates it.
- The view (`src/views/ExampleView.ts`) calls `mount(Component, { target: this.contentEl })` in `onOpen` and `unmount()` in `onClose`. This is the pattern to follow for any new Obsidian view backed by Svelte.

`public/manifest.json` is the plugin manifest Obsidian reads. Its `id` (`obsidian-svelte-plugin`) must match the dev output folder name in `vite.config.ts` — if you rename one, rename both.

## Data-layer ground rules (from README, when implementing)

If/when you start Phase 0–1, these constraints are non-obvious and load-bearing:

- **One markdown file per definition.** Frontmatter is the definition; events live as a list under `## Events`. The plugin must ignore everything outside frontmatter and that section.
- **Event line format is positional + extensible:** `- {ISO timestamp} | {value} | {note} | {key="value" pairs}`. Always four pipe-delimited segments, even when fields are empty. Field-block values are *always* quoted; `"` and newlines inside values are forbidden at write time.
- **`appendEvent` does targeted edits, never full-file rewrites.** This is the sync-conflict mitigation; don't optimize it away.
- **Coercion never throws.** Bad values keep their `raw` string and surface `coercionError` / `rangeWarning` on the `FieldValue` wrapper. Silent data loss is the failure mode to design against.
- **Round-trip determinism is a tested property.** Writer emits fields in `fieldSchema` order, then unknown keys alphabetically. Parse → re-serialize should be byte-equal.

The README's Phase 0 / Phase 1 checklists are the spec — read them before designing the parser or vault adapter.
