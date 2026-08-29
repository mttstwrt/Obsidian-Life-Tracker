# Plan: Score tracking (1–10 ratings)

**Status:** Proposed · **Date:** 2026-08-26

Tracking *how well* something went, rather than *whether* it happened: "How did I sleep?", "How was work today?", "How much energy do I have?", "How clean is the apartment?", "How good was my workout?"

## 1. The decision: new kind, thin implementation

**Add `score` to `DefinitionKind`.** Do *not* add it as a `valueType` on `habit`.

`kind` is this codebase's organizing axis — tabs, Overview groups, order keys, daily-note tags, the log-form widget, and the summary shape all switch on it. A score differs from a habit at exactly those switch points:

| | Habit | Score |
| --- | --- | --- |
| Question | did I do it, how often? | how did it go? |
| Summary | period count vs. target, streak | mean, trend, distribution, coverage |
| Grid cell | tinted by **count** | tinted by **value** |
| Missing day | a miss (breaks the streak) | just unrated (must not read as 0) |
| Target | cadence (`4/week`) | an optional level to stay above |

A `valueType: "score"` variant would put an inner `if` at every one of those sites — the same code volume with worse locality, and it would leave the Habits tab rendering "3/4 · streak 5" next to rows where those columns are meaningless.

The union approach also buys a safety net: `buildDefinition`, `definitionToYamlObject`, `buildDefinitionFromInput`, `summarizeAll`, and `TAG_BY_KIND` are all exhaustive over `Definition["kind"]`, so `bun run check` will enumerate every site that needs a decision. A `valueType` variant gets no such help and would silently render wrong in the Overview grid.

**"Thin" is the other half of the decision.** A score is not a new data model:

- the score lives in the existing `Event.value` — **no event-line format change**, so no parser, serializer, round-trip, edit, delete, or undo work;
- `numericFieldSeries` / `numericStats` / `Sparkline` / `BarChart` / `toneColor` already exist and are reused as-is;
- `MIGRATIONS` stays empty and `CURRENT_SCHEMA_VERSION` does not bump — existing definitions are untouched and parse identically.

### 1.1 Not every example is the same thing

The five motivating questions split in two, and only one half needs new code:

- **Standalone ratings** — sleep, work, energy, apartment cleanliness. Nothing else is being logged; the rating *is* the event. These need the new kind.
- **Qualifiers on an event that already exists** — "how good was my workout" belongs on the Running/Lifting habit, and **already works today**: a `fieldSchema` entry of `type: number` with `range: [1, 10]` renders as a slider in `LogEventForm.svelte`, coerces with a `rangeWarning` when out of range, and charts through `FieldChart.svelte`.

Keep the second half as fields. Making "workout quality" a separate score definition would split one event into two and break the correlation story ("hard workouts on bad sleep") before it starts.

Rule of thumb for the docs: **if the rating has an underlying event, it's a field; if the rating is the only event, it's a score.**

## 2. Data model

```ts
export interface ScoreDefinition extends BaseDefinition {
  kind: "score";
  /** Inclusive integer bounds. Default [1, 10]. */
  scale: [number, number];
  /** Endpoint captions shown under the slider, e.g. ["awful", "great"]. */
  scaleLabels?: [string, string];
  /** false for stress / pain / urge, where low is good. Default true. */
  higherIsBetter?: boolean;
  /** How several ratings on one day fold into a day value. Default "mean". */
  dayAggregate?: "mean" | "last" | "max" | "min";
  /** Optional level to stay above (or below, when !higherIsBetter). */
  target?: number;
  /** How often a rating is expected, e.g. "1/day". Drives coverage + freshness only. */
  expectedCadence?: string;
}
```

Frontmatter, and the file this produces:

```markdown
---
id: sleep
displayName: Sleep
emoji: 😴
kind: score
status: active
tags: [health]
created: 2026-08-26
schemaVersion: 1
scale: [1, 10]
scaleLabels: [awful, great]
higherIsBetter: true
dayAggregate: mean
target: 7
expectedCadence: 1/day
---

# Sleep

## Events

- 2026-08-26T07:10 | 8 | woke before the alarm |  id="01K3..."
- 2026-08-25T07:30 | 5 | up twice |  id="01K3..."
```

### 2.1 Decisions worth stating

| Question | Decision | Why |
| --- | --- | --- |
| Where does the score live? | **`Event.value`** | It is the event's numeric payload. Already parsed, serialized, edited, charted. A `score="8"` field would need a new reserved key and duplicate machinery. |
| Fixed 1–10? | **No — `scale`, default `[1, 10]`** | 1–5 is just as common, and mixing scales across definitions is normal. Integers only, `min < max`; validate at form-build time. |
| Multiple ratings per day? | **Allowed; stored individually; folded by `dayAggregate`** | Energy gets rated three times a day, sleep once. Never collapse stored events — that is the event-stream model. The fold applies only to the grid cell and the rolling means. |
| Low-is-good scores? | **`higherIsBetter`, default `true`** | Stress and pain are scores too. One boolean flips the color ramp; without it the grid actively misleads. |
| Missing day = 0? | **Never.** Empty cell, excluded from means and coverage | A day with no rating is unknown, not terrible. Getting this wrong corrupts every average on the page. |
| Streaks? | **No streak. `coverage` instead** | A streak of *having rated* your sleep is a journaling streak, not a sleep achievement. Coverage (days rated / days in window) says the useful part without the false framing. |
| Value optional? | **Required for `score` events** | A score event with no score is meaningless. `buildLogEvent` rejects it — see §4.3 for the daily-note consequence. |
| Schema bump? | **No** | Existing definitions parse unchanged; new score files are born at version 1. |

### 2.2 Forward-compatibility note

`kind` is written into vault markdown. A vault containing score definitions, opened by an **older** plugin build, fails the `VALID_KINDS` check in `definitionFile.ts` — `parseDefinitionFile` returns `{ ok: false, error: 'invalid kind: "score"' }`, and `DataLayer.loadDefinitions` (`dataLayer.ts:77`) pushes a `failed to parse …` warning and skips the file. **Score definitions go invisible on old builds; they are not modified or lost.** Acceptable, and worth one line in `docs/integration.md` for any consumer reading the file contract directly.

## 3. Summary shape

```ts
export interface ScoreSummary {
  definition: ScoreDefinition;
  latest?: { value: number; timestamp: string };
  todayValue?: number;          // folded by dayAggregate
  mean7?: number;
  mean30?: number;
  meanAll?: number;
  trend?: number;               // mean7 - mean30; undefined until both windows have data
  min?: number;
  max?: number;
  count: number;
  coverage7: number;            // days rated / 7
  coverage30: number;
  daysSinceLast: number | null;
  status: FreshnessStatus;      // from expectedCadence; "never" when count === 0
  byDate: Map<string, number>;  // folded day values — feeds the grid and the sparkline
  distribution: { value: number; count: number }[];
  /** Normalized 0..1 for toneColor, flipped when higherIsBetter === false. */
  tone?: number;
}
```

`summarizeScore(def, events, now)` lands in `dashboard.ts` beside the other five, and `summarizeAll` gains a `scores` array. Every mean skips events with no numeric `value`, and every window counts only days that have at least one rating.

## 4. Implementation surface

Ordered by phase. Each phase ends green on `bun test` and `bun run check`.

### S0 — Data model (no UI) — **done**

| File | Change |
| --- | --- |
| `src/data/types.ts` | `ScoreDefinition`; `"score"` in `DefinitionKind` and the `Definition` union; `SCORE_DAY_AGGREGATES`, `DEFAULT_SCORE_SCALE`, `DEFAULT_SCORE_DAY_AGGREGATE` |
| `src/data/definitionFile.ts` | `VALID_KINDS`; `buildDefinition` case with lenient `parseScale` / `parseScaleLabels`; `definitionToYamlObject` case |
| `src/data/definitionForm.ts` | `DefinitionFormInput` fields; `buildDefinitionFromInput` case; `buildScale` validation; `emptyFormInput`; `definitionToFormInput` |
| `test-vault/LifeTracker/definitions/sleep.md` | 30 days of daily ratings, 1–10, with a `target` and two custom fields |
| `test-vault/LifeTracker/definitions/stress.md` | The awkward case: 1–5 scale, `higherIsBetter: false`, `dayAggregate: max`, several ratings per day |
| `src/data/__tests__/definitionFile.test.ts` | New file — score frontmatter parsing, every lenient fallback, and the unknown-kind rejection behind §2.2 |
| `src/data/__tests__/definitionForm.test.ts` | Validation and round-trip cases |
| `src/data/__tests__/exampleData.test.ts` | `"score"` in the expected kinds list |

Validation covered: `scale` must be two whole numbers with `min < max` (both blank means the default); `target`, when set, must fall inside `scale`; `expectedCadence`, when set, must satisfy `parseTargetCadence`.

**Lenient/strict split.** The form rejects a bad scale; the *parser* degrades to `[1, 10]` instead, because a hand-edited bound must never make a definition and its whole event history vanish from the vault. Same for an unrecognized `dayAggregate` (dropped, so consumers apply the default) and malformed `scaleLabels`. Whole-number bounds are enforced only in the form.

**Defaults stay out of frontmatter.** `higherIsBetter: true` and `dayAggregate: "mean"` are stored as `undefined` rather than written out, so a plain score file has three lines of score config rather than seven. Both round-trip stably (tested).

Two files listed under S1/S3 moved into S0 because they are *compile-forced* by the union — leaving them out would not build: `TAG_BY_KIND` in `dailyNote.ts` (an exhaustive `Record`) and the `create_definition` switch in `api.ts`. Since the API case had to exist, `"score"` also went into `KINDS` and the `create_definition` descriptor gained `scale_min` / `scale_max` / `higher_is_better` / `target` — otherwise the handler would have been unreachable dead code. The rest of S3's API work (`list_definitions` output, `get_summaries`) still waits on `summarizeScore`.

### S1 — Capture — **done**

| File | Change |
| --- | --- |
| `src/components/DefinitionForm.svelte` | Kind option + score field group (scale bounds, endpoint labels, higherIsBetter, dayAggregate, target, expectedCadence) |
| `src/components/LogEventForm.svelte` | The rating widget — see below |
| `src/data/logForm.ts` | `valueExpected` → `"score"`; `buildLogEvent` requires a value inside `scale` |
| `src/data/planSync.ts` | `autoLogBlockedReason` + the `buildAutoEvent` guard — see §4.3 |
| `src/main.ts` | Surfaces the block reason, and a Notice for scores |
| `src/data/__tests__/logForm.test.ts`, `planSync.test.ts` | Required-value, scale bounds, and auto-log-block cases |

(`TAG_BY_KIND` in `dailyNote.ts` landed in S0 — the exhaustive `Record` would not compile without it.)

**Buttons, not a slider.** The plan said slider; buttons shipped. A range input reports its midpoint before it is touched, so an untouched slider submits a rating the user never chose — fatal for the one field whose whole value is that the number is deliberate. Discrete buttons have no default state, and are one tap on mobile. Scales too wide to show as buttons (more than 11 steps) fall back to a number input with `min`/`max`; nothing defaults to a value there either.

**Out-of-range ratings are rejected, not warned.** Unlike `coerceField`'s `rangeWarning` for custom fields, `buildLogEvent` refuses a rating outside `scale`. Forms are strict. The one cost: narrowing a definition's scale later makes old out-of-range events un-editable until the scale widens again or the rating changes. Judged acceptable — nothing is lost, the file keeps the original value, and the error names the range.

### S2 — Display — **done**

| File | Change |
| --- | --- |
| `src/data/dashboard.ts` | `ScoreSummary`, `summarizeScore`, `scoreDayValues`, `scoreTone`, wired into `summarizeAll` |
| `src/components/DashboardScores.svelte` | New tab, modelled on `DashboardCounters.svelte` |
| `src/components/Dashboard.svelte` | `TabKey` + `tabs` entry (📈, after Counters) |
| `src/components/DashboardOverview.svelte` | `kindClass: "score"`, a Scores group, and **value-tinted cells** (§4.2) |
| `src/components/DashboardAnalytics.svelte` | `formatEventValue` renders a rating as `8/10` — the scale matters |
| `src/data/definitionOrder.ts` | `OrderTabKey` += `"scores"`; `ORDER_TAB_KEYS`; `emptyDefinitionOrder` |
| `src/main.ts` | `tabOrderBaseline` `tabKinds` map |
| `src/data/__tests__/dashboard.test.ts` | 24 `summarizeScore` cases |

`normalizeDefinitionOrder` already drops missing and unrecognized tab keys, so an existing `data.json` picks up the new `scores` key with no migration.

**Every mean runs over folded day values, never raw events.** A day rated three times must not outweigh a day rated once — otherwise a busy Tuesday quietly dominates the week. `dayAggregate` is the user's stated rule for collapsing a day, so it is applied *before* averaging and there is exactly one answer to "what was Tuesday". Unrated days are skipped rather than counted as zero.

**`trend` stays undefined below a data floor** (3 rated days in the 7-day window, 10 in the 30-day). Comparing a single rating against a month's average is noise, and showing it weakly invites reading a trend that is not there.

**The Overview left border tracks staleness, not the rating.** The value is already in the status chip and in every cell; "you stopped rating this" has nowhere else to show. So score rows use the 4-state `freshness` like maintenance, rather than reverse-habit's continuous `freshnessColor`.

**Sparkline gaps are labelled, not interpolated.** `Sparkline` takes a plain `number[]` with no gap support, so the tab plots only rated days and labels the axis "last N rated days" — accurate, rather than drawing an unbroken daily line over days that were never rated. A `target` reference line would need a new `Sparkline` prop; the target shows as a stat instead.

### S3 — Integration — **done**

| File | Change |
| --- | --- |
| `src/api.ts` | Score fields in `list_definitions`; a `scores` block in `get_summaries`; **the write guard below**; updated tool descriptions |
| `src/components/CodeBlockView.svelte` | `view: score` |
| `src/data/__tests__/api.test.ts` | New file — the write guard and the score read shapes |
| `docs/integration.md` | Score section in the file contract, the forward-compat note from §2.2, and the write rule |
| `README.md`, `public/manifest.json` | Score row and description |

**The write guard was a live corruption path, not a nicety.** `log_event` treated an absent `value` as `1` — correct for every other kind ("it happened once"), but on a score `1` is not "unspecified", it is the worst possible rating. An agent logging sleep without asking for a number would have quietly recorded the worst night on record. `log_event` now rejects a score without an explicit in-range rating, `edit_event` range-checks a patched one, and the tool description tells the model to ask rather than guess.

**Derived statistics are rounded to two decimals** in the API output. A `mean_7d` of `7.428571428571429` invites a language model to quote every digit as if it carried meaning, well past the precision of a 1-10 rating.

**`get_summaries` reports nulls, never omissions**, so a consumer can distinguish "not rated recently" from "this key does not exist". A thin history reports `trend_7d_vs_30d: null` rather than a flat zero.

**`view: score` requires exactly one score definition.** The other code-block views merge events across definitions; averaging ratings from a 1-5 and a 1-10 scale would be meaningless, so it errors instead.

### Still open — cross-definition correlation

The reason scores are worth building at all, and deliberately not built yet. `fieldCorrelations` (`visualizations.ts`) already does Pearson across numeric fields *within* one definition. Generalizing it to align daily score series against each other, and against habit occurrence, answers "do I sleep better on days I run?" and "does bad sleep predict a bad day at work?".

It needs its own design pass before any code: how to align series with gaps, whether to support lag (does today's run show up in tonight's sleep or tomorrow's?), a minimum *n* below which nothing is shown, and how to present *r* to a user who will read correlation as cause. Doing it badly is worse than not doing it — a spurious "your sleep causes your workouts" is a confident lie built from twelve data points.

### 4.1 Sizing

Roughly 350–450 new lines plus a ~220-line tab component. The only genuinely *new* logic is `summarizeScore` and the tinted grid cell; everything else is a branch alongside five existing ones.

### 4.2 The one novel rendering rule

Every other Overview row tints its cell by event **count** (`cellCount`, `DashboardOverview.svelte:284`). A score tints by **value**:

```ts
const [lo, hi] = def.scale;
const raw = (dayValue - lo) / (hi - lo);          // 0..1
const t = def.higherIsBetter === false ? 1 - raw : raw;
// toneColor(t): 0 → red, 0.5 → amber, 1 → green, in Obsidian theme vars
```

`toneColor` (`visualizations.ts:297`) is already exactly this ramp and is already used for reverse-habit tone, so this is a reuse, not a new palette. A day with no rating renders empty — not `t = 0`.

### 4.3 Daily-note sync: scores are skipped, deliberately

Ticking a checkbox conveys "it happened"; it cannot convey "it was a 7". Since a score event requires a value, `planSync`'s auto-log path has nothing valid to write.

**Decision: skip score plan lines with a console hint,** exactly as the README already documents for lines whose required fields are unfilled — *"Lines requiring fields you haven't filled in are skipped (with a console hint) instead of being logged with blanks."* The user completes the rating in the log modal.

Rejected: popping the log modal from the sync path. That path is file-watch-driven, so another device's sync would open a modal on this one.

**Skipping is silent no longer.** Ticking a box is a deliberate act, so a skipped score also raises a Notice naming the definition, rather than only a `console.info`. `autoLogBlockedReason` carries the reason so the message is accurate, which also fixed a pre-existing bug: every `buildAutoEvent` failure previously reported "required fields", including timestamps that simply failed to parse.

**Score plan lines are kept** — a reversal of this section's earlier "ship S1 without them". Planning "07:00 Sleep quality" is a useful reminder, and the direction that matters already works: logging the rating through the modal ticks the matching checkbox via `syncEventToDailyNote`, which is kind-agnostic and pre-registers the plan key so the watcher does not re-process its own tick. Only the checkbox → event direction is blocked, and now it says so.

## 5. Order of work

**S0 → S1 → S2 → S3 — all four shipped.** Scores can be defined, logged, read from markdown, seen on the dashboard and Overview grid, embedded in a note, and driven by an agent. The only item left from this plan is cross-definition correlation, which needs its own design pass (see S3).

## 6. Resolved questions

1. **Default scale — 1–10**, adjustable per definition via a prominent field in the definition form.
2. **`target` has no default.** It stays absent unless the user sets one, and when set it draws a reference line on the sparkline — nothing louder.
3. **Keep the `entered_at` stamp on retroactive score logs.** Rating last night's sleep this morning will put the field on most score events; that is accepted, since it keeps one rule for every kind and preserves "when was this actually entered" for later analysis.
