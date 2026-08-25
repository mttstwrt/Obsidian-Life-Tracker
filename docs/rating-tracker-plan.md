# Plan: Rating tracker (`kind: rating`)

**Status:** Proposed · **Date:** 2026-08-25

Adds a sixth definition kind for things you *score* rather than *complete* — energy 0–10,
sleep quality, how work went, how clean the apartment is.

## 1. The question, answered

> Should this be an entirely new kind, or should normal habits get a score display?

**A new kind — and separately, a shared scale primitive that upgrades numeric fields on
every existing kind.** Two different things hide behind the word "rating":

| | Rating as **subject** | Rating as **attribute** |
| --- | --- | --- |
| Answers | "How was my energy today?" | "How did that run feel?" |
| Exists without an activity? | Yes — the measurement *is* the event | No — it annotates an event that already happened |
| Missing a day means | a gap in a series | nothing (there was no run) |
| Model | **new `kind: "rating"`** | **`fieldSchema` numeric field with `range`** — already works |

The attribute case is already built: `FieldDef {type: "number", range: [1,5]}` →
`numericFieldSeries` (`visualizations.ts:98`) → `FieldChart.svelte`. It doesn't need a new
kind. What it needs is the same scale *input widget* and *tone rendering* the rating kind
introduces — which is why §5 makes those a shared primitive rather than rating-only code.
That is the "should habits have a score display" half: **yes, and it comes free**, but as a
field-level feature, not by teaching `HabitDefinition` about scores.

## 2. Why a habit-with-a-value doesn't cover the subject case

You can model energy today as `kind: habit, valueType: custom, unit: "0-10", targetCadence: daily`.
Concretely, here is what breaks:

1. **Every existing kind keys off event *presence*; a rating keys off event *value*.**
   `HabitSummary` (`dashboard.ts:17`) carries `periodCount`, `periodTarget`, `dueToday`,
   `currentStreak`, and a `recentByDate` map of **counts**. There is no slot for mean,
   trend, or distribution, and no honest way to add one — those fields would be dead
   weight on every real habit.
2. **Missing ≠ failure.** `computeHabitStreak` (`dashboard.ts:196`) treats a period below
   target as a broken chain. Not rating your energy on Tuesday is not a failure; it's a
   hole in a series. Shipping ratings as habits makes the tracker nag about the wrong
   thing, permanently.
3. **The Overview grid is value-blind.** `eventsByDate` (`visualizations.ts:11`) returns
   counts, and `DashboardOverview.svelte` renders `cellCount`. A 2 and a 9 both render as
   "1". Ratings need a parallel `valuesByDate`.
4. **Scale metadata has nowhere to live.** min / max / step / polarity / anchor labels. On
   a habit you'd cram it into `unit: "0-10"` as a string nothing parses. Polarity in
   particular decides colour *direction* — "how anxious were you, 0–10" is a scale where
   low is good. `toneColor` (`visualizations.ts:297`) already exists and wants a
   `t ∈ [0,1]`; without declared polarity you cannot compute `t`.
5. **A value is optional everywhere today.** `buildLogEvent` (`logForm.ts:44`) leaves
   `value` undefined on blank input. A rating with no value is not a rating.

Against that: adding a kind is *cheap here*. There are ~12 `switch (def.kind)` sites, all
exhaustive over `DefinitionKind`, so `tsc` enumerates the work for you (§8). Overloading
habit semantics is not cheap — it's a data-format commitment you can't walk back.

## 3. Data model

```ts
export type ScalePolarity = "higher-better" | "lower-better" | "neutral";

export interface RatingScale {
	min: number;
	max: number;
	/** Granularity of the input. Default 1. */
	step?: number;
	polarity: ScalePolarity;
	/** Sparse anchors keyed by value-as-string: {"0": "empty", "10": "wired"}. */
	labels?: Record<string, string>;
}

export interface RatingDefinition extends BaseDefinition {
	kind: "rating";
	scale: RatingScale;
	/** How often you *intend* to rate. Drives a gentle Today-tab nudge — never a streak. */
	promptCadence?: "daily" | "weekly" | "none";   // default "daily"
	/** How several ratings on one day collapse into that day's value. */
	dayAggregate?: "last" | "mean" | "min" | "max"; // default "last"
}
```

`labels` as a sparse map (rather than a full array) covers both ends of the range with one
mechanism: `{"0": "empty", "10": "wired"}` for a 0–10 scale, or all five entries for a
1–5 scale. YAML may hand back numeric keys — normalize to strings at parse.

### File format

```markdown
---
id: energy
displayName: Energy
emoji: ⚡
kind: rating
status: active
tags: [wellbeing]
created: 2026-08-25T09:00:00.000Z
schemaVersion: 1
scale:
  min: 0
  max: 10
  polarity: higher-better
  labels:
    0: empty
    5: ok
    10: wired
promptCadence: daily
dayAggregate: last
fieldSchema:
  - key: caffeine
    type: boolean
    prompt: "Caffeine today?"
---

# Energy

## Events

- 2026-08-25T21:10 | 7 | good until 4pm |  id="01K3..."
- 2026-08-24T22:02 | 4 | bad sleep showing |  id="01K3..."
```

The rating goes in the **existing `value` slot**. Nothing about the event line changes —
which means `query_events`, `EventDetailModal`, edit, delete, undo, and the `source` dedup
key all work untouched. `definitionToYamlObject` (`definitionFile.ts`) emits `scale` keys
in fixed order (`min, max, step, polarity, labels`) so round-trip determinism holds.

### Storage decisions

| Question | Decision |
| --- | --- |
| Where does the score live? | **`event.value`.** Not a field — a field would make it invisible to every existing value-aware path. |
| Two ratings in one day? | **Keep both.** No rewrite-on-relog: `appendEvent`'s targeted-append is the sync-conflict mitigation and stays. `dayAggregate` (default `last`) decides what the grid shows. The log modal offers "you rated Energy 7 today — update instead?" which routes to the existing edit path. |
| Out-of-range value (12 on a 0–10)? | **Accept and warn.** Consistent with the coercion rule: never throw, never drop. Store 12, render clamped at the top of the ramp, show a warning in the log form and event detail. |
| Required? | **Yes** — `buildLogEvent` rejects a blank value for `kind: "rating"`. New helper `valueRequired(def)` beside `valueExpected` (`logForm.ts:34`). |

## 4. `RatingSummary`

```ts
export interface RatingSummary {
	definition: RatingDefinition;
	latest?: { timestamp: string; value: number };
	/** date → aggregated value for that day, per `dayAggregate`. */
	dayValues: Map<string, number>;
	mean7: number | null;
	mean30: number | null;
	/** mean7 minus the preceding 7-day mean; null until there are two windows. */
	trend: number | null;
	observedMin: number | null;
	observedMax: number | null;
	/** Rated days ÷ 30. The honest "am I actually tracking this" number. */
	coverage30: number;
	ratedToday: boolean;
	distribution: { value: number; count: number }[];
}
```

`coverage30` is deliberately what replaces the streak. It reports without moralizing: a
rating you skipped for a week shows 23/30, not a broken chain.

`DashboardSummaries` gains `ratings: RatingSummary[]`; `summarizeAll` (`dashboard.ts:147`)
gains a sixth `case`.

## 5. The shared scale primitive (the "score display" half)

New module `src/data/scale.ts`, used by **both** the rating kind and any numeric
`FieldDef` that declares a `range`:

```ts
export interface ScaleSpec {
	min: number; max: number; step: number;
	polarity: ScalePolarity;
	labels: Record<string, string>;
}

export function scaleOfRating(def: RatingDefinition): ScaleSpec;
/** null when the field isn't numeric or has no range — i.e. not scale-shaped. */
export function scaleOfField(f: FieldDef): ScaleSpec | null;
/** Position in [0,1], ignoring valence. */
export function scaleNorm(value: number, s: ScaleSpec): number;
/** Valence in [0,1] for `toneColor`; null for "neutral" — caller uses a single-hue ramp. */
export function scaleTone(value: number, s: ScaleSpec): number | null;
/** Discrete chip values, or [] when the scale is too wide to render as chips. */
export function scalePoints(s: ScaleSpec, maxChips?: number): number[];
```

`FieldDef` gains two optional keys — `polarity?: ScalePolarity` and
`labels?: Record<string, string>` — alongside the `range` and a new `step` it already
almost has. That is the whole change needed to give *every* kind a score display: a run's
`quality` field with `range: [1,5]` starts rendering as tappable chips in the log form and
as a coloured strip in event detail, with no rating definition in sight.

Two components, both driven by `ScaleSpec`:

- `ScaleInput.svelte` — chips when `scalePoints` returns ≤ 11 values (0–10 and 1–5 both
  qualify), slider + number box beyond that. Anchor labels under the ends. Sized for
  thumbs; the mobile-keyboard work already in `LogEventForm.svelte` is the reason a chip
  row beats a number input here.
- `ScaleStrip.svelte` — a value rendered as a filled bar / tinted cell via `toneColor`.

## 6. UI surfaces

1. **New "Ratings" dashboard tab** (`DashboardRatings.svelte`), consistent with every other
   kind having one. Per rating: current value large, 30/90-day sparkline, mean + trend
   arrow, distribution bar (`BarChart.svelte`), coverage.
2. **Overview grid** — a `Ratings` group, `kindClass: "rating"`. Cell = the day's value,
   background `toneColor(scaleTone(...))`. Crucially, **unrated renders differently from a
   habit's missed day** — a faint dot, not an empty cell, because it isn't a failure.
   Needs `valuesByDate(events, aggregate)` in `visualizations.ts`.
3. **Today tab** — `promptCadence: "daily"` ratings not yet logged show as "Rate: Energy".
   One row, no urgency tone.
4. **Log form** — `ScaleInput`, plus the "already rated today" affordance from §3.
5. **Sidebar** — current value + trend arrow.
6. **Code-block view** — add `view: rating` (value line over time) to `CodeBlockView.svelte`,
   and let `view: sparkline` plot values rather than counts when pointed at a rating.
7. **Analytics** — the payoff. `pearson` and `fieldCorrelations` (`visualizations.ts:167`,
   `:192`) already do the maths within one definition's fields. With ratings as first-class
   daily numeric series, the *cross-definition* version becomes natural: energy vs. sleep,
   energy vs. days you ran. Scoped to Phase 3 below, but this is the reason the kind earns
   its keep.

## 7. Daily-note sync

A checkbox can't carry a 0–10. Options were: skip mirroring, or extend the plan line with
Tasks-plugin-style inline metadata (`- [x] 22:00 Energy [rating:: 7] #rating`).

**Decision: ratings do not mirror to daily notes in v1.** `TAG_BY_KIND`
(`dailyNote.ts:27`) gets a `rating: "#rating"` entry to stay exhaustive, and the
plan/auto-log paths skip the kind. The inline-metadata round trip is a real feature with a
real parser cost; it should be its own plan, not a rider on this one.

## 8. Touch list

`DefinitionKind` is a closed union consumed by exhaustive switches, so `bun run check`
enumerates most of this. Adding `"rating"` to `src/data/types.ts:45` and then fixing every
error is the actual work order.

**Compiler-forced:**
`types.ts` (union + `RatingDefinition`) · `definitionFile.ts:42` (`VALID_KINDS`, parse arm,
serialize arm) · `dashboard.ts:147` (`summarizeAll` arm, `summarizeRating`) ·
`definitionForm.ts` (`emptyFormInput`, build, labels) · `api.ts:44` (`KINDS`,
`create_definition` arm) · `dailyNote.ts:27` (`TAG_BY_KIND`) · `main.ts:162` (`tabKinds`).

**Not compiler-forced — easy to miss:**
`definitionOrder.ts:14` (`OrderTabKey` + `ORDER_TAB_KEYS` + `emptyDefinitionOrder`;
`normalizeDefinitionOrder` already tolerates a missing tab, so no `data.json` migration) ·
`Dashboard.svelte:26` (`TabKey` + `tabs`) · `DashboardOverview.svelte:102` (`kindClass`
union + group) · `DashboardAnalytics.svelte:73` (status glyph) · `logForm.ts:34`
(`valueExpected` / new `valueRequired`) · `LogEventForm.svelte:225` (`unitLabel`) ·
`planSync.ts` / `main.ts:445` (`quickLog` — ratings always open the modal).

**New files:** `src/data/scale.ts`, `src/components/ScaleInput.svelte`,
`src/components/ScaleStrip.svelte`, `src/components/DashboardRatings.svelte`,
`src/data/__tests__/scale.test.ts`, `src/data/__tests__/rating.test.ts`.

## 9. API

- `list_definitions` — rating entries include `scale: {min, max, polarity}`.
- `get_summaries` — `RatingSummary` shape, with `mean7`/`mean30`/`trend`/`coverage30`.
- `create_definition` — `kind: "rating"` requires `scale_min` and `scale_max`; `polarity`
  defaults to `higher-better`.
- `log_event` — value required for ratings; out-of-range comes back as a warning, not an
  error, matching §3.

No new tools in v1. `get_correlations` is a Phase 3 candidate.

## 10. Compatibility

`schemaVersion` stays **1** — adding a kind doesn't invalidate any existing file, and
`MIGRATIONS` stays empty.

One-way hazard worth stating: a **older build of the plugin** reading a `kind: rating` file
hits the `VALID_KINDS` check and drops the definition with a parse warning. The file is not
damaged and reappears on upgrade, but a user syncing a stale install across devices will
see the rating vanish there. Acceptable, and the same would be true of any new kind.

## 11. Phases

| Phase | Scope |
| --- | --- |
| **R0** | `types.ts`, `scale.ts` + tests, parse/serialize round-trip + tests. No UI. |
| **R1** | `summarizeRating` + `valuesByDate` + tests; `ScaleInput`/`ScaleStrip`; log form; definition form. Loggable end to end. |
| **R2** | Ratings tab, Overview group, Today nudge, sidebar, `data.json` order key. |
| **R3** | Code-block `view: rating`; API surface; cross-definition correlations in Analytics. |
| **R4** | *(separate plan)* daily-note inline-metadata round trip; unbounded measures (§12). |

R0–R1 is the honest MVP: a rating you can define, log, and read back byte-identically.

## 12. Open decisions

1. **Ratings only, or ratings + unbounded measures?** Weight, resting HR, and hours slept
   are the same machinery (value-per-day, mean, trend, no streaks) minus the bounded scale.
   Two ways: make `scale` optional on `RatingDefinition` (unbounded → `unit` + optional
   target band instead of chips), or add `kind: "measure"` later sharing the summary code.
   This plan assumes **`scale` required**, because it decides the `kind:` string you commit
   to today. Worth settling before R0 lands.
2. **`dayAggregate` default.** `last` is proposed — no data loss, "how are you *now*"
   semantics. `mean` is defensible if you rate the same thing morning and night.
3. **Subject-date offset for sleep.** "How did you sleep" logged at 9am describes *last*
   night. The retroactive date picker already covers it manually; a `dayOffset: -1` on the
   definition would make it automatic. Deferred — flag if it bites in practice.
