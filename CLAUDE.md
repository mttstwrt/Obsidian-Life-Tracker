# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Life Tracker** is a working Obsidian plugin (v0.1.x) — a unified habit / maintenance / reverse-habit / project / counter tracker built on a single event-stream model. The README's Phase 0 → Phase 7 plan has landed: parser/writer, vault data layer, dashboard with seven tabs, sidebar, daily-note two-way sync, charts, `lifetracker` code blocks, and a runtime API for co-installed plugins.

Design docs for larger changes live in `docs/` (`overview-and-agent-integration-plan.md`, `score-tracker-plan.md`) — write one before a feature that crosses more than a couple of files, and follow the existing shape: goals, decisions-already-made table, per-file implementation surface, order of work.

## Commands

Package manager is **bun** (`bun.lockb` present).

- `bun dev` — Vite watch build into `test-vault/.obsidian/plugins/obsidian-life-tracker/`. Open `test-vault/` in Obsidian for a live-reloading dev environment (a `.hotreload` marker is written automatically).
- `bun run build` — production build into `build/`.
- `bun run check` — `svelte-check` over `.ts` and `.svelte`. **This is the main safety net for kind/union changes** (see below) — run it on every change.
- `bun test` — bun's test runner over `src/data/__tests__/`.
- `bun run format` / `bun run lint` — Biome. `lint` passes `--apply-unsafe` and will rewrite source.

## Stack

Svelte 5 (runes mode), TypeScript, **Vite 6** (not esbuild — the README's "Tech stack" line is inherited from `obsidian-sample-plugin` and is wrong), UnoCSS, `yaml` for frontmatter.

Write components in runes mode (`$state`, `$derived`, `$derived.by`, `$effect`, `$props`). Mount from Obsidian views with `mount()` / `unmount()` from `svelte` — see `src/views/DashboardView.ts`. The legacy `new Component({ target })` API is gone in Svelte 5.

## Build / runtime architecture

`vite.config.ts` is non-standard in ways that matter:

1. **Output dir switches on mode.** `development` → `test-vault/.obsidian/plugins/obsidian-life-tracker/`; `production` → `build/`. `emptyOutDir: false` so `data.json` and other plugin files survive rebuilds.
2. **Library build, CJS only.** Entry `src/main`, output a single `main.js` + `styles.css`. Obsidian loads plugins as CommonJS — don't switch to ESM.
3. **Externals matter.** `obsidian`, `electron`, all `@codemirror/*`, all `@lezer/*`, and Node builtins are external, provided by Obsidian at runtime. Bundling them breaks the plugin.
4. `sourcemap: "inline"` + `sourcemapBaseUrl` pointing at the test vault is what makes devtools breakpoints map back to TS.

`public/manifest.json`'s `id` (`obsidian-life-tracker`) must match the dev output folder name in `vite.config.ts` — rename one, rename both.

## Layout

- `src/data/` — all logic that isn't rendering. Pure and unit-tested; **put new logic here, not in components.** Components should read derived state and call into `plugin` / `DataLayer`.
- `src/data/__tests__/` — bun tests, one per data module.
- `src/components/` — Svelte 5 UI. `Dashboard.svelte` owns tab state and loads data once, passing `summaries` down.
- `src/views/` — Obsidian `ItemView` / `Modal` subclasses; thin wrappers that mount a Svelte component.
- `src/main.ts` — the `Plugin` subclass: settings, commands, ribbon icons, daily-note watching, and the orchestration methods components call (`openLogModal`, `logEventViaApi`, `reorderDefinitions`, `refreshDashboards`, …).
- `src/api.ts` — the versioned `plugin.api` runtime surface (MCP-shaped tool descriptors + `invoke`). See `docs/integration.md`.
- `test-vault/LifeTracker/definitions/` — seeded example definitions, also used as parser fixtures by `exampleData.test.ts`.

## Data-layer ground rules

These constraints are load-bearing and non-obvious:

- **One markdown file per definition.** Frontmatter is the definition; events are a list under `## Events`. Ignore everything outside those two regions — the body between them is user prose and must round-trip untouched.
- **Event line format is positional + extensible:** `- {ISO timestamp} | {value} | {note} | {key="value" pairs}`. Always four pipe-delimited segments, even when empty. Field-block values are *always* quoted; `"` and newlines are forbidden at write time.
- **`appendEvent` does targeted edits, never full-file rewrites** (`dataLayer.ts`). This is the Obsidian Sync conflict mitigation — don't optimize it away. Same for `editEvent` / `deleteEvent`, which locate lines by `id="…"`.
- **Coercion never throws.** Bad values keep their `raw` string and surface `coercionError` / `rangeWarning` on the `FieldValue` wrapper. Silent data loss is the failure mode to design against.
- **Parsers are lenient, forms are strict.** `parseDefinitionFile` degrades gracefully (unknown enum values warn rather than fail); `buildDefinitionFromInput` rejects bad input up front. A file that fails to parse is warned about and skipped in `loadDefinitions` — never rewritten.
- **Round-trip determinism is a tested property.** The writer emits fields in `fieldSchema` order, then unknown keys alphabetically. Parse → re-serialize is byte-equal.
- **`source` is the dedup key.** Writers that can fire repeatedly for one logical event (the daily-note auto-log) set it; `appendEvent` refuses a second event with a `source` already in the file.

## Adding or changing a definition kind

`Definition` is a discriminated union on `kind`, and that discriminant is the app's organizing axis. Adding a kind is a guided change — several sites are *exhaustive* over the union, so `bun run check` enumerates most of the work for you:

- **Compile errors you'll get immediately:** `buildDefinition` and `definitionToYamlObject` (`definitionFile.ts`), `buildDefinitionFromInput` / `emptyFormInput` / `definitionToFormInput` (`definitionForm.ts`), `TAG_BY_KIND` (`dailyNote.ts`, an exhaustive `Record`), and the `create_definition` switch in `api.ts`.
- **Silent gaps `check` will *not* catch** — statement switches and if-chains that just fall through: `summarizeAll` (`dashboard.ts`), `valueExpected` (`logForm.ts`), `valueForAutoLog` (`planSync.ts`), `formatEventValue` (`DashboardAnalytics.svelte`), `unitLabel` (`LogEventForm.svelte`), and the group construction in `DashboardOverview.svelte`. Walk these by hand.
- Also: `VALID_KINDS` (`definitionFile.ts`), `KINDS` (`api.ts`), `ORDER_TAB_KEYS` (`definitionOrder.ts`) and the `tabKinds` map in `main.ts` if the kind gets its own dashboard tab, and the expected-kinds list in `exampleData.test.ts`.

`kind` is written into user markdown, so a kind added here is *invisible* (parse-skipped with a warning, not destroyed) on older plugin builds. Note new kinds in `docs/integration.md` for file-contract consumers.

`CURRENT_SCHEMA_VERSION` only needs bumping when existing definitions must change shape; `MIGRATIONS` is currently empty. Adding a new kind doesn't require either.

## Settings vs. vault data

`loadData()` / `saveData()` (Obsidian's per-plugin `data.json`) holds **only** UI preferences: root folder, plan heading, quick-log ids, display order, view modes. Definitions and events live in vault markdown — never put tracked data in `data.json`.

`data.json` is a whole-file write, so concurrent edits from two synced devices can clobber each other. `definitionOrder` handles this by rebasing onto disk at write time (`mergeDefinitionOrder`) and re-reading on `onExternalSettingsChange`. Follow that pattern for any new list-shaped setting; `normalizeDefinitionOrder` also shows the house style for coercing untrusted `data.json` (drop what you don't recognize, never throw).
