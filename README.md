# Life Tracker

A unified habit, maintenance, reverse-habit, project, counter, and score tracker for [Obsidian](https://obsidian.md). One plugin for the things a habit tracker can't quite express — recurring chores, streaks you want to *grow* instead of break, long-running projects, open-ended counters, daily ratings — built on a single event-stream model so every kind shares the same logging, history, and analytics.

All data lives in plain markdown inside your vault. No database, no sidecar files, nothing proprietary — just one file per thing you track.

## What you can track

| Kind | What it's for | Example |
| --- | --- | --- |
| **Habit** | Things you want to do on a cadence | Run 4×/week, meditate daily |
| **Maintenance** | Things that need redoing every so often | Wash sheets, replace water filter, call parents |
| **Reverse habit** | Gaps you want to grow | Days without doomscrolling, days since a setback |
| **Project** | Effort over time, no fixed cadence | Writing a book, learning a language |
| **Counter** | Things you accumulate, optionally toward a goal | Books read this year, push-ups total |
| **Score** | How well something went, on a scale you choose | Sleep quality, energy, how work was |

Every entry is an *event* — a thing that happened at a moment in time, optionally with a value, a note, and any custom fields you've defined (e.g. mood, route, pages read). The same event stream powers every view.

## Features

- **Dashboard view** with tabs for Overview, Habits, Maintenance, Projects, Counters, Scores, and Analytics. The Overview tab is a unified day grid over everything you track — as much history as fits your screen — with a toggle between per-definition rows and tag-aggregated rows; click any cell to log or plan for that date.
- **Sidebar panel** for at-a-glance status without leaving your current note.
- **Daily-note sync** — tick a checkbox under your timeline heading and the matching event is logged automatically; un-tick it to remove the event. Compatible with the Tasks plugin's metadata.
- **Quick-log commands** for any definition, bindable to your own hotkeys.
- **Custom fields per definition** — number, string, boolean, enum, list. Add or retire fields without migrating old data.
- **Undo** on every log, with an inline notice.
- **Charts**: calendar heatmaps, sparklines, streak bars, freshness timelines, milestone timelines, and per-field charts.
- **Embeddable views** — drop a `lifetracker` fenced code block into any note to render a chart inline:

  ````markdown
  ```lifetracker
  view: heatmap        # heatmap | sparkline | streak | events | score
  definition: running  # or definitions: [...] / tags: [exercise]
  days: 90             # optional
  ```
  ````

- **Plain-markdown storage** — greppable, sync-friendly, portable. Your data outlives the plugin.

## Installing

### From the community plugin browser
Once published: open **Settings → Community plugins → Browse**, search for "Life Tracker", install, and enable.

### Manually
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](../../releases).
2. Drop them into `<your-vault>/.obsidian/plugins/obsidian-life-tracker/`.
3. Reload Obsidian and enable the plugin under **Settings → Community plugins**.

## Getting started

1. **Pick a root folder.** In the plugin's settings tab, set the folder Life Tracker should keep its definitions in (default: `LifeTracker/`). Each thing you track gets its own markdown file there.
2. **Create your first definition.** Run the command **Life Tracker: New definition**, choose a kind, give it a name and emoji, and (optionally) add custom fields.
3. **Log an event.** Use **Life Tracker: Log event** to pick a definition and fill in the form, or assign a hotkey to a per-definition quick-log command for one-keystroke logging.
4. **Open the dashboard** from the activity ribbon icon (or the **Open dashboard** command). The Overview tab shows everything you track on one day grid; the kind-specific tabs show streaks, freshness, effort, and totals.
5. **Open the sidebar** from the second ribbon icon for a compact always-on view.

### Logging from your daily note
If you keep a timeline / schedule in your daily note, Life Tracker can mirror it both ways:

- Set the **Plan heading** in settings (default: `Timeline`) to whatever heading you use.
- Write checkbox lines under that heading, e.g. `- [ ] 07:00 Running`.
- When you tick the box, Life Tracker matches the label to a definition and logs the event for the daily note's date.
- When you log an event through the plugin, the matching checkbox in your daily note gets ticked.
- Un-ticking removes the auto-logged event; manually-logged events are left alone.

Lines requiring fields you haven't filled in are skipped (with a console hint) instead of being logged with blanks — open the log modal to complete them.

## How your data is stored

Each definition is a markdown file. The frontmatter is the definition; the events live as a list under an `## Events` heading.

```markdown
---
id: running
displayName: Running
emoji: 🏃
kind: habit
status: active
valueType: duration
unit: minutes
targetCadence: 4/week
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

You can read, search, and edit these files directly — Life Tracker will pick up your changes on next load. Events are appended with targeted edits (never full-file rewrites), which keeps Obsidian Sync conflicts to a minimum.

## Agent & AI integration

Life Tracker is built to be driven by other tools — a calendar plugin, an analytics dashboard, or an AI agent that logs and reviews your activity. There are two integration surfaces, both documented in full in [`docs/integration.md`](docs/integration.md):

- **The file contract** — everything lives in plain markdown (see [How your data is stored](#how-your-data-is-stored)). Any consumer can read definitions and events straight from the vault, even when Life Tracker is disabled. This is the canonical surface for decoupled, read-only integrations.
- **The runtime API** — an in-process, versioned surface on the plugin instance for co-installed plugins that need *safe writes* or *computed summaries* (streaks, freshness, period progress). Writes should go through it: ULID generation, field coercion, daily-note mirroring, and cache invalidation all live in the plugin runtime and are easy to get wrong from outside.

### Connecting an agent

There is **no standalone MCP server** — Life Tracker doesn't run a background process or open a port. Instead, a co-installed Obsidian plugin (the reference consumer is the *vault-assistant* AI agent) reaches the API directly on the plugin instance:

```ts
const lt = app.plugins.plugins["obsidian-life-tracker"] as
  | { api?: LifeTrackerApi }
  | undefined;
if (!lt?.api) return;              // plugin missing or disabled — fall back to the file contract
if (!lt.api.version.startsWith("1.")) warnIncompatible(lt.api.version);

const summaries = await lt.api.invoke("get_summaries", {});
```

The API exposes **MCP-shaped tool descriptors** (`name` / `description` / `inputSchema`), so they map 1:1 onto MCP or OpenAI tool schemas — hand them straight to a language model. `invoke` never throws and always resolves to a JSON string; failures come back as `{"error": "..."}`, a shape designed for a language-model consumer.

v1 tools: `list_definitions`, `query_events`, `get_summaries`, `log_event`, `edit_event`, `delete_event`, `plan_item`, `create_definition`.

Note for score definitions: `log_event` requires an explicit `value` inside the definition's scale. An absent value defaults to `1` for other kinds, which on a score would silently record the worst possible rating, so the API rejects it instead.

Prefer the API for writes (`log_event` runs the same path as the UI — dedup, coercion, daily-note mirror) and for computed status (`get_summaries`); use the file contract for decoupled reads. See [`docs/integration.md`](docs/integration.md) for the full contract, a read-only consumer reference implementation, and versioning guarantees.

## Status

Life Tracker is in early development (v0.1.x). Core logging, dashboards, the sidebar, and daily-note sync are working. Expect rough edges around analytics and mobile UX. Issues and feedback welcome.

## Development

Built with TypeScript, Svelte 5 (runes mode), Vite, and UnoCSS. Package manager is [bun](https://bun.sh).

```bash
bun install
bun dev          # watch build into test-vault/.obsidian/plugins/...
bun run build    # production build into build/
bun run check    # type-check with svelte-check
bun test         # run the parser/data-layer tests
```

`bun dev` writes directly into the bundled `test-vault/`, so opening that vault in Obsidian gives you a live-reloading dev environment.

## License

[MIT](LICENSE).
