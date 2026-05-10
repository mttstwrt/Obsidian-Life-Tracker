# Life Tracker

A unified habit, maintenance, reverse-habit, project, and counter tracker for [Obsidian](https://obsidian.md). One plugin for the things a habit tracker can't quite express — recurring chores, streaks you want to *grow* instead of break, long-running projects, open-ended counters — built on a single event-stream model so every kind shares the same logging, history, and analytics.

All data lives in plain markdown inside your vault. No database, no sidecar files, nothing proprietary — just one file per thing you track.

## What you can track

| Kind | What it's for | Example |
| --- | --- | --- |
| **Habit** | Things you want to do on a cadence | Run 4×/week, meditate daily |
| **Maintenance** | Things that need redoing every so often | Wash sheets, replace water filter, call parents |
| **Reverse habit** | Gaps you want to grow | Days without doomscrolling, days since a setback |
| **Project** | Effort over time, no fixed cadence | Writing a book, learning a language |
| **Counter** | Things you accumulate, optionally toward a goal | Books read this year, push-ups total |

Every entry is an *event* — a thing that happened at a moment in time, optionally with a value, a note, and any custom fields you've defined (e.g. mood, route, pages read). The same event stream powers every view.

## Features

- **Dashboard view** with tabs for Today, Habits, Maintenance, Projects, Counters, and Analytics. The Today tab surfaces what's due, what's overdue, and what you've already logged.
- **Sidebar panel** for at-a-glance status without leaving your current note.
- **Daily-note sync** — tick a checkbox under your timeline heading and the matching event is logged automatically; un-tick it to remove the event. Compatible with the Tasks plugin's metadata.
- **Quick-log commands** for any definition, bindable to your own hotkeys.
- **Custom fields per definition** — number, string, boolean, enum, list. Add or retire fields without migrating old data.
- **Undo** on every log, with an inline notice.
- **Charts**: calendar heatmaps, sparklines, streak bars, freshness timelines, milestone timelines, and per-field charts.
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
4. **Open the dashboard** from the activity ribbon icon (or the **Open dashboard** command). The Today tab shows what's due now; the kind-specific tabs show streaks, freshness, effort, and totals.
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
