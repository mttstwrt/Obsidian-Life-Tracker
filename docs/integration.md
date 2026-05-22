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
- **Reserved key `id`**: the ULID-style event id. Always present; do not collide with this key in `fieldSchema`.
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
