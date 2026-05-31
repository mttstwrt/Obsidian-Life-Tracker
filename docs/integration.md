# Integrating with Life Tracker

This document describes Life Tracker's on-disk data model so other Obsidian plugins (calendar, dashboard, journal, etc.) can read, render, and write Life Tracker data without depending on the plugin runtime.

The **file format is the integration contract**. There is no JS API; instead, every piece of state lives in plain markdown in the user's vault. That gives integrators three guarantees:

- **Decoupled lifecycle.** The calendar plugin can read Life Tracker data even when Life Tracker is disabled, uninstalled, or loading later in startup order.
- **No plugin-to-plugin imports.** No `app.plugins.plugins["obsidian-life-tracker"]` calls, no shared types package.
- **User-portable.** Everything is greppable, syncable, and survives the plugin.

## Where data lives

```
<vault>/
└── <rootFolder>/                  # default: "LifeTracker"
    └── definitions/
        ├── running.md             # one file per definition
        ├── lifting.md
        ├── wash-sheets.md
        └── …
```

- `rootFolder` is user-configurable. To discover it, read `<vault>/.obsidian/plugins/obsidian-life-tracker/data.json` and use the `rootFolder` key; fall back to `"LifeTracker"` if absent.
- The file basename **is** the definition id (e.g. `running.md` → `id: "running"`). The frontmatter also stores `id`, and the two should match — trust the frontmatter when they disagree.

Daily-note mirrors live wherever the **core Daily Notes** plugin is configured to write them (folder + date format from `app.internalPlugins.getPluginById("daily-notes").instance.options`). See "Daily-note format" below.

## Definition file format

Each definition is a markdown file with **YAML frontmatter** followed by an optional human-readable body and an **`## Events`** section. Everything outside frontmatter and that section is ignored.

```markdown
---
id: running
displayName: Running
emoji: 🏃
kind: habit
status: active
tags: [exercise, cardio]
created: 2026-04-01T08:00:00.000Z
schemaVersion: 1
valueType: duration
unit: minutes
targetCadence: 4/week
defaultDuration: 30
fieldSchema:
  - key: quality
    type: number
    range: [1, 5]
    prompt: "How did it feel?"
  - key: route
    type: string
    prompt: "Route (optional)"
---

# Running

## Events

- 2026-04-28T07:14 | 32 | morning loop, felt good | id="01HW..." quality="4" route="park-loop"
- 2026-04-26T18:02 | 45 |  | id="01HW..." quality="3" route="hill-route"
- 2026-04-24T07:30 | 28 | short |  id="01HW..."
```

### Frontmatter shape

All definitions share a common base:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Slug; matches file basename. |
| `displayName` | string | Shown in UI. |
| `emoji` | string? | Optional. |
| `kind` | `"habit" \| "maintenance" \| "reverse-habit" \| "project" \| "counter"` | Determines kind-specific fields below. |
| `status` | `"active" \| "dormant" \| "archived"` | Filter out `archived` in most views. |
| `tags` | string[] | Plain tag names without `#`. |
| `created` | ISO timestamp | When the definition was created. |
| `schemaVersion` | number | Currently `1`. Integrators should check this. |
| `fieldSchema` | `FieldDef[]?` | Custom fields. See below. |
| `defaultDuration` | number? | Default planned-block length in minutes. |

Kind-specific fields:

- **habit**: `valueType: "boolean" \| "count" \| "duration" \| "custom"`, `unit?: string`, `targetCadence: string` (e.g. `"4/week"`, `"daily"`).
- **maintenance**: `intervalDays: number`, `warningThresholdDays: number`.
- **reverse-habit**: `noteRequired?: boolean`, `milestones?: number[]`.
- **project**: `dormantAfterDays?: number`.
- **counter**: `unit?: string`, `goal?: number`, `resetCadence?: "yearly" \| "monthly" \| "never"`.

### Custom fields (`fieldSchema`)

```ts
interface FieldDef {
  key: string;            // snake_case, matches /^[a-z_][a-z0-9_]*$/
  type: "number" | "string" | "boolean" | "enum" | "list";
  range?: [number, number];
  options?: string[];     // for enum
  itemType?: "number" | "string" | "boolean";  // for list
  required?: boolean;
  prompt?: string;
  retired?: boolean;      // retired fields are no longer logged, but old events keep their values
}
```

## Event line format

Events live as a markdown bullet list under `## Events`. Each line has **exactly four pipe-separated segments**:

```
- {timestamp} | {value} | {note} | {key="value" pairs}
```

Examples:

```
- 2026-04-28T07:14 | 32 | morning loop, felt good | id="01HW..." quality="4" route="park-loop"
- 2026-04-26T18:02 | 45 |  | id="01HW..."
- 2026-05-21T22:00 |  |  | id="01HW..."
```

Rules:

- All four segments are always present, even when empty (trailing `|` if the field block is empty).
- **Timestamp**: ISO-8601 local time, typically `YYYY-MM-DDTHH:MM` (seconds optional). No `|` or newline.
- **Value**: number (e.g. `32`, `1`, `-0.5`) or empty. Booleans are stored as `1` for true.
- **Note**: arbitrary text, but **never** contains `|`, `"`, or `\n`.
- **Field block**: zero or more `key="value"` pairs separated by single spaces. Values are *always* quoted; `"` and newlines inside values are forbidden at write time.
- **Reserved keys `id` and `source`**: `id` is the ULID-style event id (always present); `source` is an optional provenance string (e.g. `source="daily-note"` when the event was logged by ticking a checkbox). Do not collide with either key in `fieldSchema`.
- **Field ordering** (when writing): `id` first, then keys in `fieldSchema` order, then any unknown keys sorted alphabetically. Parse → re-serialize is byte-equal for well-formed lines.

### Coercion

Parsing must **never throw**. Bad values keep their raw string and surface as warnings, not errors — silent data loss is the failure mode to design against. If you write your own parser, return an `{ok: false, error}` for structurally broken lines but accept anything else.

## Daily-note mirror

When the user logs an event, Life Tracker mirrors it into the day's daily note under the **plan heading** (default `## Timeline`, configurable in settings as `planHeading`). The same heading is where users write planned items.

Line shapes (current; see `src/data/dailyNote.ts:formatPlanLine`):

| Definition kind | Line |
|---|---|
| habit / reverse-habit / counter | `- [ ] HH:mm - HH:mm Label #habit` (end time optional) |
| maintenance | `- [ ] HH:mm Label #maint` (no end time) |
| project | `- [ ] HH:mm - HH:mm Project: Label #work` |

Variations:

- A **logged** line is checked (`- [x]`).
- A **planned but not logged** line is unchecked (`- [ ]`).
- If `linkActivitiesToDefinitions` is on, the label is wrapped as `[[<id>|<displayName>]]` (or `[[<id>]]` when they match).
- Additional `#tags` from the definition follow the kind tag.

### Bidirectional sync

- User ticks `- [ ] 07:00 Running` → Life Tracker logs a `running` event at `<date>T07:00`.
- User logs an event through the plugin UI → the matching `- [ ]` line gets ticked, or (when `recordUnplannedEvents` is on, the default) a new pre-checked line is appended.
- User un-ticks a previously auto-logged line → the event is deleted from the definition file.
- Manually-logged events are not removed by un-ticking — only events whose timestamp equals the planned `<date>THH:MM` exactly (no seconds) are eligible.

Lines under the heading that don't match any definition are ignored. The label match is case-insensitive against `displayName`, then `id`.

## Reading data from another plugin

The recommended pattern (read-only consumer like a calendar):

1. Read settings to discover paths:
   ```ts
   const data = JSON.parse(await app.vault.adapter.read(".obsidian/plugins/obsidian-life-tracker/data.json"));
   const definitionsFolder = `${data.rootFolder ?? "LifeTracker"}/definitions`;
   const planHeading = data.planHeading ?? "Timeline";
   ```
2. List `definitionsFolder` and parse each `.md` file's frontmatter + `## Events` section.
3. Index events by date for whatever view you're rendering.
4. For "what was planned today", read the day's daily note and scan under `## ${planHeading}` for `- [ ]` / `- [x]` lines.

### Watching for changes

Register on the vault:

```ts
app.vault.on("modify", (file) => {
  if (file.path.startsWith(definitionsFolder)) refreshDefinition(file.path);
  if (isDailyNotePath(file.path)) refreshDay(file.path);
});
app.vault.on("create", …);
app.vault.on("delete", …);
app.vault.on("rename", …);
```

To resolve "is this a daily note?", reuse the format from the core Daily Notes plugin's settings — see `src/data/dailyNote.ts:parseDailyNotePath` in this repo for a working parser.

## Consumer read API (reference implementation)

A read-only consumer (analytics dashboard, calendar, an AI wellness coach correlating Life Tracker events with other sources) needs three primitives: **discover paths → enumerate definitions → stream events**. None of them touch the Life Tracker runtime; they read markdown through the vault API. The sketch below is self-contained — drop it into your own plugin and adapt.

### 1. Discover paths

```ts
import type { App } from "obsidian";

interface LifeTrackerPaths {
  rootFolder: string;
  definitionsFolder: string;
  planHeading: string;
}

async function discoverPaths(app: App): Promise<LifeTrackerPaths> {
  const dataPath = ".obsidian/plugins/obsidian-life-tracker/data.json";
  let data: Record<string, unknown> = {};
  if (await app.vault.adapter.exists(dataPath)) {
    try {
      data = JSON.parse(await app.vault.adapter.read(dataPath));
    } catch {
      /* fall through to defaults — never throw on a missing/garbled settings file */
    }
  }
  const rootFolder = (data.rootFolder as string) ?? "LifeTracker";
  return {
    rootFolder,
    definitionsFolder: `${rootFolder}/definitions`,
    planHeading: (data.planHeading as string) ?? "Timeline",
  };
}
```

Reading `data.json` works even when Life Tracker is disabled — that's the point of the file-as-contract. If the file is absent (plugin never installed), you still get sane defaults.

### 2. Enumerate definitions

Use Obsidian's metadata cache for frontmatter (no YAML dependency, and it's already parsed for you). Read the body once to pull the `## Events` section.

```ts
import type { TFile } from "obsidian";

interface Definition {
  id: string;                 // file basename — but trust frontmatter.id when present
  frontmatter: Record<string, unknown>;
  fieldSchema: FieldDef[];    // frontmatter.fieldSchema ?? []
  file: TFile;
}

async function loadDefinitions(app: App, paths: LifeTrackerPaths): Promise<Definition[]> {
  const folder = app.vault.getFolderByPath(paths.definitionsFolder);
  if (!folder) return [];
  const defs: Definition[] = [];
  for (const child of folder.children) {
    if (!("extension" in child) || child.extension !== "md") continue;
    const file = child as TFile;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    defs.push({
      id: (fm.id as string) ?? file.basename,
      frontmatter: fm,
      fieldSchema: (fm.fieldSchema as FieldDef[]) ?? [],
      file,
    });
  }
  return defs;
}
```

Filter on `frontmatter.status` (skip `"archived"`) and `frontmatter.schemaVersion` (warn if `> 1`) at the call site, per the rules in "Stability and versioning".

### 3. Parse event lines

This mirrors `src/data/eventLine.ts:parseEventLine`. Two rules carry over and matter: **the body is always four ` | `-delimited segments** (an empty field block shows up as a trailing ` |`), and **parsing never throws** — a structurally broken line is skipped, never fatal. The reserved keys are `id` (ULID-style event id) and `source` (provenance string; e.g. `daily-note` when the event came from a ticked checkbox). Everything else is a custom field.

```ts
interface ParsedEvent {
  id: string;
  timestamp: string;          // ISO-8601 local, e.g. "2026-04-28T07:14" (no zone)
  value?: number;
  note?: string;
  source?: string;
  fields: Record<string, string>;  // raw values; coerce per fieldSchema if you need typed
}

// Split the line body into exactly 4 segments on " | ", tolerating an empty
// trailing field block ("… | note |"). Returns null for malformed lines.
function splitFour(body: string): [string, string, string, string] | null {
  const parts: string[] = [];
  let rest = body;
  for (let i = 0; i < 3; i++) {
    const idx = rest.indexOf(" | ");
    if (idx < 0) {
      if (i === 2 && rest.endsWith(" |")) return [...parts, rest.slice(0, -2), ""] as [string, string, string, string];
      return null;
    }
    parts.push(rest.slice(0, idx));
    rest = rest.slice(idx + 3);
  }
  return [...parts, rest] as [string, string, string, string];
}

const FIELD_PAIR_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)="([^"\n]*)"\s*/;

function parseEventLine(line: string): ParsedEvent | null {
  const m = line.match(/^-\s+(.*)$/);
  if (!m) return null;
  const split = splitFour(m[1]);
  if (!split) return null;
  const [tsRaw, valueRaw, noteRaw, block] = split;

  const fields: Record<string, string> = {};
  let id = "";
  let source: string | undefined;
  let rest = block.trim();
  while (rest.length > 0) {
    const pair = rest.match(FIELD_PAIR_RE);
    if (!pair) break;            // tolerate garbage tail rather than throwing
    const [, key, val] = pair;
    if (key === "id") id = val;
    else if (key === "source") source = val;
    else fields[key] = val;
    rest = rest.slice(pair[0].length);
  }

  const value = /^-?\d+(\.\d+)?$/.test(valueRaw) ? Number(valueRaw) : undefined;
  return {
    id,
    timestamp: tsRaw,
    value,
    note: noteRaw === "" ? undefined : noteRaw,
    source,
    fields,
  };
}
```

### 4. Stream events (optionally by date range)

Timestamps are ISO-8601 **local time with no zone**, so for same-shaped strings a lexicographic compare is a valid chronological compare — you can range-filter without constructing `Date` objects. Yield lazily so a coach scanning months of history across many definitions doesn't materialize everything at once.

```ts
interface EventRow extends ParsedEvent {
  definitionId: string;
}

async function* streamEvents(
  app: App,
  defs: Definition[],
  range?: { from?: string; to?: string },  // inclusive ISO-local bounds
): AsyncGenerator<EventRow> {
  for (const def of defs) {
    const text = await app.vault.cachedRead(def.file);
    const lines = text.split("\n");
    let inEvents = false;
    for (const raw of lines) {
      if (raw.startsWith("## ")) { inEvents = raw.trim() === "## Events"; continue; }
      if (!inEvents) continue;
      const ev = parseEventLine(raw);
      if (!ev) continue;
      if (range?.from && ev.timestamp < range.from) continue;
      if (range?.to && ev.timestamp > range.to) continue;
      yield { ...ev, definitionId: def.id };
    }
  }
}
```

Usage:

```ts
const paths = await discoverPaths(app);
const defs = (await loadDefinitions(app, paths))
  .filter((d) => d.frontmatter.status !== "archived");

for await (const ev of streamEvents(app, defs, { from: "2026-05-01", to: "2026-05-31" })) {
  // feed ev into your correlation / summarization layer
}
```

### 5. Cache and invalidate

Re-reading every definition on every query is fine for a one-shot summary but wasteful for an interactive view. Cache parsed events in memory keyed by file path and invalidate on vault events scoped to the definitions folder:

```ts
const refresh = (file: TFile) => {
  if (file.path.startsWith(paths.definitionsFolder)) invalidate(file.path);
};
app.vault.on("modify", refresh);
app.vault.on("create", refresh);
app.vault.on("delete", refresh);
app.vault.on("rename", (file, oldPath) => { invalidate(oldPath); refresh(file); });
```

Only add a daily-note watcher if you also surface **planned-but-not-logged** items (the `- [ ]` checkboxes under `planHeading`); logged events all live in the definition files.

## Writing data from another plugin

If you must write:

- **Append events with targeted edits, never full-file rewrites.** Rewriting the whole file maximizes Obsidian Sync conflicts. Read the file, locate `## Events`, insert your new line at the bottom of that section, write only the affected slice (or, if your vault adapter doesn't support partial writes, write the full file but keep all other bytes byte-identical to what you read).
- **Respect the 4-segment format.** Always emit all four `|`-separated segments, even when value/note/fields are empty.
- **Generate a fresh event id.** Use a ULID-style id under the reserved `id` key.
- **Never write `"` or newlines inside field values or the note.** Reject the input at the boundary.
- **Don't reorder existing fields.** When editing an existing event, preserve `id` first and the relative order of other keys.

For daily-note plan lines, prefer using the same line shapes Life Tracker emits (so its watcher round-trips correctly). If your plugin adds an unchecked plan line, Life Tracker will auto-log when the user ticks it; if you add a pre-checked line, Life Tracker will treat it as a fresh log on next file-modify event.

## Stability and versioning

- Frontmatter carries `schemaVersion: 1`. Check it; surface a warning if you see a higher number.
- The 4-segment event line is the most stable part of the contract. Field ordering and the wikilink format may extend (new optional segments), but the existing segments will not be reordered or removed within `schemaVersion: 1`.
- Settings keys (`rootFolder`, `planHeading`, `recordUnplannedEvents`, `linkActivitiesToDefinitions`) are stable but may grow. Treat unknown keys as opaque.

## Open questions for the calendar plugin

Things worth deciding before you build:

- **Read-only first?** A purely-read calendar view (show events on a month grid, click through to the definition file) avoids most of the conflict surface. Defer writing until the read story is solid.
- **Planned vs. logged styling.** The daily-note checkbox state (`[ ]` vs `[x]`) is the canonical "did this happen yet" signal. Map it to your calendar's "tentative vs. confirmed" visual.
- **Event range queries.** Naive: re-parse every definition on every range query. Realistic: cache parsed events in memory and refresh on `modify`/`create`/`delete`/`rename` of files inside `definitionsFolder`. The daily-note watcher only matters if you also surface planned-but-not-logged items.
