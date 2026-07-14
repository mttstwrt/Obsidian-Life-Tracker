# Plan: Overview grid, code-block views, and the agent runtime API

**Status:** Approved · **Date:** 2026-07-13

Companion doc: `vault-assistant/docs/agent-workflows-plan.md` (the vault-assistant side).

## 1. Goals

1. **LT-1 — Overview grid**: replace the Today tab with a unified, habits-style day grid over *all* definition kinds, showing as much history as fits the viewport, with a definitions ⇄ tags toggle and click-through to the standard log/plan modal.
2. **LT-2 — Code-block views**: a `lifetracker` fenced code block that renders the existing Svelte charts from a small spec, so views can be embedded in any note — by hand or by an agent writing markdown.
3. **LT-3 — Runtime API**: a small versioned in-process API (`plugin.api`) exposing tool-shaped operations for the vault-assistant's agent (and any other co-installed plugin) to *safely write* events and query computed summaries.

## 2. Decisions already made

| Question | Decision |
| --- | --- |
| Keep the Today tab? | **No — Overview replaces it.** The user doesn't use Today. Its tiered due/overdue logic in `dashboard.ts` stays (summaries are reused); only the tab UI is replaced. |
| External MCP server? | **Out of scope.** No stdio server package. The integration surface is the in-process API + the existing file contract (`docs/integration.md`). |
| Agent-generated views as HTML/CSS? | **No.** Fragile and unsafe. Views are `lifetracker` code blocks rendered by our own components. |
| Why a runtime API when integration.md says "file format is the contract"? | The file contract stays canonical **for reads / decoupled consumers**. Writes go through the runtime because ULID generation, source-dedup, coercion, daily-note mirroring, and cache invalidation live in `DataLayer`/`planSync` — re-implementing them in an agent invites silent divergence. |

## 3. LT-1 — Overview grid (replaces Today)

### 3.1 Layout

Reuse the measure-to-fit day-grid mechanics from `DashboardHabits.svelte` (measured `nameTh` / `dayColWidth` → computed `dayCount`, min 7, no horizontal scrollbar). Extract into a shared component so Habits and Overview don't duplicate it.

- Rows: all **active** definitions, grouped by kind (habits, reverse habits, maintenance, projects, counters), respecting `definitionOrder`.
- Columns: dates, most recent on the right, as many as fit (`gridDates`).
- Cell semantics per kind (all driven by events-on-date):
  - **habit** — count for the day, tone-scaled (as in Habits today).
  - **reverse-habit** — event on the day = lapse (danger tone); otherwise empty.
  - **maintenance** — event on the day = done (ok tone); today's column tinted by current status (overdue/approaching).
  - **project** — activity marker, intensity from summed value if numeric.
  - **counter** — increments that day (count or summed value).
- Row leader: emoji + name + a compact status chip (streak / days-since / freshness / total) pulled from the existing `DashboardSummaries`.

### 3.2 Tag mode

Header toggle **Definitions ⇄ Tags** (persisted in settings as `overviewMode`). Tag mode: one row per tag (union of all definitions carrying it), cell = number of events across those definitions that day.

### 3.3 Drill-in

- Definition cell click → `plugin.openLogModal(defId, { initialDate })` (already supports plan mode via `onPlan`).
- Tag cell click → new lightweight chooser modal: the tag's definitions, with that day's logged events listed under each; picking a definition opens the standard log/plan modal for that date; picking an event opens `EventDetailModal`.

### 3.4 Wiring

`Dashboard.svelte`: `today` tab entry becomes `overview` (label "Overview", same default position). `DashboardToday.svelte` is deleted. Anything Today-only that is still wanted (the "logged today" list) can reappear later as a code-block view (LT-2).

## 4. LT-3 — Runtime API

*(Numbered before LT-2 here because vault-assistant's VA-4 depends on it; implementation order is LT-1 → LT-2 → LT-3 or LT-1 → LT-3 → LT-2, either works.)*

### 4.1 Shape

```ts
// main.ts
public api: LifeTrackerApi;

interface LifeTrackerApi {
  version: string;            // semver of the API contract, starts "1.0.0"
  toolDescriptors: ToolDescriptor[];   // name, description, JSON-schema parameters
  invoke(name: string, args: Record<string, unknown>): Promise<string>; // JSON string result
}
```

`ToolDescriptor` deliberately matches the MCP tool shape (`name`, `description`, `inputSchema`) so vault-assistant's `plugin` transport maps it 1:1.

### 4.2 Tools (v1)

| Tool | Effect |
| --- | --- |
| `list_definitions` | Active (optionally archived) definitions: id, name, kind, cadence/interval, tags, fieldSchema. |
| `query_events` | Events for a definition (or all), optional ISO date range, capped count. |
| `get_summaries` | The `summarizeAll` output, trimmed for model consumption: due/overdue, streaks, freshness, period progress. |
| `log_event` | Append an event via `DataLayer.appendEvent` (ULID, coercion, dedup, daily-note mirror all apply). |
| `edit_event` / `delete_event` | By definition id + event id. |
| `plan_item` | Write an unchecked plan line into a day's daily note under the plan heading (via the `dailyNoteService` path). |
| `create_definition` | New definition file; validates kind-specific fields. |

All results are JSON strings; all errors return `{"error": "..."}` rather than throwing — the consumer is a model.

### 4.3 Documentation

`docs/integration.md` gains a "Runtime API" section: file contract for reads/decoupled consumers, runtime API for writes and computed summaries; version-check guidance.

## 5. LT-2 — Code-block views

````markdown
```lifetracker
view: heatmap        # heatmap | sparkline | streak | events
definition: running   # or  tags: [exercise]
days: 90              # optional range
```
````

- `registerMarkdownCodeBlockProcessor("lifetracker", …)` parses the spec (`parseYaml` from the obsidian package — no new dep), resolves definitions/tags through `DataLayer`, and mounts the matching existing chart component (`CalendarHeatmap`, `Sparkline`, `StreakBar`, `EventTimeline`).
- Errors (unknown view, missing definition, bad YAML) render as a friendly inline box, never throw.
- Re-render on vault changes to the underlying definition files (existing watcher path).
- This is how the agent "creates data views live": it writes a note containing a block — already possible through vault-assistant's permission-gated `write_file`.

## 6. Order of work

| Step | Task | Depends on |
| --- | --- | --- |
| 1 | LT-1 Overview grid | — |
| 2 | LT-2 code-block views | — |
| 3 | LT-3 runtime API | — |
| 4 | (vault-assistant VA-4/VA-5: plugin transport, life coach) | LT-3 |
