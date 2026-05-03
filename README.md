Obsidian Life Tracker — Planning & Scope
A Obsidian plugin for tracking habits, maintenance tasks, reverse habits, projects, and counters. Built around the idea that all of these are queries over a single underlying event stream.

Motivation
I tried lots of ways of tracking/planning my daily life but none really matched. So I figured why not build my own? This plugin is primarily built for myself and the way I feel is most natural to use it.

Minimal friction when recording. Logging an event should take seconds on desktop and on mobile.
Easy analysis. A unified dashboard answers "what should I do today?" and "how have I been doing?" without leaving Obsidian.
Less daily decision fatigue. Surface clear signals, but never decide for the user.
Data lives in the vault. Plain markdown, greppable, sync-friendly, portable.
Cover tracking shapes that habit trackers ignore. Maintenance latency, reverse habits, project effort, open-ended counters.
Recordable data is extensible without migration pain. Adding, removing, or retiring fields on a definition should not require touching existing data.


Core concept: events and definitions
Everything tracked is an event — a thing that happened at a time, optionally with a value and a note, plus arbitrary key-value fields. Events attach to a definition that describes how to interpret events of that type.
tsinterface Event {
  id: string;                        // ULID for stable sort + dedupe
  timestamp: string;                 // ISO 8601, the moment the thing happened
  value?: number;                    // semantics from definition.valueType
  note?: string;
  fields: Record<string, FieldValue>; // extensible key-value pairs
}

interface FieldValue {
  raw: string;                       // always the original string from the file
  coerced?: number | string | boolean | string[];  // present if coercion succeeded
  coercionError?: string;            // present if coercion failed
  rangeWarning?: string;             // present if value coerced but violates range/options
}

interface Definition {
  id: string;
  displayName: string;
  emoji?: string;
  kind: "habit" | "maintenance" | "reverse-habit" | "project" | "counter";
  status: "active" | "dormant" | "archived";
  tags: string[];
  created: string;
  schemaVersion: number;
  fieldSchema?: FieldDef[];
}

interface FieldDef {
  key: string;                       // matches /^[a-z_][a-z0-9_]*$/
  type: "number" | "string" | "boolean" | "enum" | "list";
  range?: [number, number];          // for number
  options?: string[];                // for enum
  itemType?: "number" | "string" | "boolean";  // for list
  required?: boolean;
  prompt?: string;                   // shown in the logging modal
  retired?: boolean;                 // hide from logging UI but keep parsing/displaying old data
}
The FieldValue wrapper is deliberate: it makes silent data loss impossible. A field that fails to coerce keeps its raw string and surfaces a warning in the UI rather than disappearing.
The five kinds
KindGoal directionToday-view behaviorPrimary visualizationHabitHit cadence targetNag if behind todayStreak / gridMaintenanceStay within intervalNag when approaching/past dueFreshness bar (green → red)Reverse-habitMaximize gap since last eventCelebrate; quiet log optionTime-since + personal bestProjectTrack effort, no targetSurface if active and dormantEffort over timeCounterAccumulate, optionally toward a goalDon't nagProgress bar or raw count
Kind-specific definition fields
tsinterface HabitDefinition extends Definition {
  kind: "habit";
  valueType: "boolean" | "count" | "duration" | "custom";
  unit?: string;
  targetCadence: string;
}

interface MaintenanceDefinition extends Definition {
  kind: "maintenance";
  intervalDays: number;
  warningThresholdDays: number;
}

interface ReverseHabitDefinition extends Definition {
  kind: "reverse-habit";
  noteRequired?: boolean;
  milestones?: number[];
}

interface ProjectDefinition extends Definition {
  kind: "project";
  dormantAfterDays?: number;
}

interface CounterDefinition extends Definition {
  kind: "counter";
  unit?: string;
  goal?: number;
  resetCadence?: "yearly" | "monthly" | "never";
}

Storage
One markdown file per definition. Events live in the file as a list under an ## Events heading. Frontmatter holds the definition.
File layout
/LifeTracker/
  definitions/
    running.md
    wash-sheets.md
    obsidian-plugin.md
    days-without-doomscrolling.md
    books-2026.md
  config.json
  migrations/
    2026-04-29-v1-to-v2.log
Definition file format
markdown---
id: running
displayName: Running
emoji: 🏃
kind: habit
status: active
tags: [exercise, cardio]
created: 2026-04-29
schemaVersion: 1
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
  - key: hr_avg
    type: number
    prompt: "Avg heart rate"
---

# Running

Optional prose notes about this habit. The plugin ignores everything outside frontmatter and the `## Events` section.

## Events

- 2026-04-28T07:14 | 32 | morning loop, felt good | quality="4" route="park-loop" hr_avg="148"
- 2026-04-26T18:02 | 45 |  | quality="3" route="hill-route"
- 2026-04-24T07:30 | 28 | short |
Event line format
- {ISO timestamp} | {value or empty} | {note or empty} | {key="value" pairs, space-separated}
Fixed positional fields (always in this order, always present even if empty):

ISO 8601 timestamp
Numeric value (empty for boolean kinds)
Free-text note

Extensible field block (everything after the third pipe).
Field block syntax rules

Always quoted: every value is key="value". No exceptions, even for numbers and booleans.
No spaces around =. quality="4", never quality = "4". The writer enforces this; the parser rejects deviations.
Space-separated pairs. quality="4" mood="tired".
No quotes inside values. Forbidden at write time. At read time, a value containing " is treated as a coercion error and the field's raw is preserved with a warning.
No newlines inside values. Same handling as quotes.
Field keys match /^[a-z_][a-z0-9_]*$/. Lowercase, underscores, no hyphens. Validated at definition creation and on parse.
Empty values are meaningful. quality="" means "explicitly recorded as empty"; the field being absent means "never set." The parser preserves the distinction; analytics can filter on either.
Order is not significant but the writer emits fields in fieldSchema order followed by unknown keys alphabetically (deterministic output for clean diffs).
Duplicate keys: last-wins on read, but emit a warning. Indicates a writer bug or manual edit error.
Unknown keys (no fieldSchema entry) are preserved verbatim with coerced set to the raw string (treated as type string). Surfaced in detail views in an "extra fields" section.

Type coercion rules
The parser coerces raw strings to typed values per fieldSchema. Coercion is per-field; one bad field never prevents an event from loading.

number: must match /^-?\d+(\.\d+)?$/. Locale-independent (no comma decimals, no scientific notation). Anything else → coercionError.
boolean: must be exactly "true" or "false". Anything else → coercionError.
string: always coerces; coerced equals raw.
enum: must match one of options exactly. Otherwise → coercionError.
list: comma-separated. Each item is then coerced per itemType. Items with leading/trailing whitespace are trimmed. Empty list is [], not absent.
Range/option violations (e.g. quality="7" when range is [1,5]) are not coercion errors. The value coerces successfully; rangeWarning is set; analytics use the value with a soft warning surfaced in detail views.

Without a fieldSchema entry: the field is treated as string. The parser does not infer types from values — mood="3" stays a string unless schema says otherwise. Inference would create surprising "why did this break?" moments when types appear to change based on data.
Reserved field key conventions
The plugin uses some conventional keys but doesn't claim them — users can override:

enteredAt: ISO 8601 timestamp set automatically on retroactive entries. Type string (not datetime until that type lands).
id is not a field key — the event ID is encoded separately (see below).

Event ID storage
Event IDs need a home. Two options:

A field key: id="01HW..." lives in the field block.
A trailing comment: ... | quality="4"  <!-- id=01HW... -->

I recommend option 1 for simplicity — it's just another reserved key. The writer always emits it; the parser always reads it. If absent on an old line (manually-edited file), generate one and rewrite the line on next save.
Examples
- 2026-04-28T07:14 | 32 | morning loop | id="01HW..." quality="4" hr_avg="148"
- 2026-04-28T07:14 |  |  | id="01HW..." mood="tired"
- 2026-04-20T18:00 | 30 | forgot to log | id="01HW..." quality="3" enteredAt="2026-04-28T09:15"
- 2026-04-15T12:00 | 25 |  | id="01HW..." tags="cardio,outdoor,morning"
Why this format

Adding a field is free. Start writing quality="4" on new entries. Old entries don't have it. No migration.
Removing a field is free. Mark retired: true in fieldSchema. Old data keeps its values harmlessly.
Renaming is find-replace across markdown files when not actively syncing.
Per-definition fields cost nothing globally. Each definition's events carry only what's relevant.
Coercion failures never lose data. The raw string is always preserved.
Forward compatibility. A future plugin version or a manual edit can add weather="rainy" without breaking older parsers.
Greppable. grep 'quality="5"' -r works directly.

What still costs something

Changing a field's type after data exists. Old values may not coerce. They'll surface as warnings. Either run a one-shot script to clean them, or version the field name (quality_v2).
Renaming a field during active sync. Concurrent edits can conflict. Do renames during quiet periods.
Promoting an extensible field to a core positional field. Real migration, schemaVersion bump. Do sparingly — only if 90%+ of definitions use the field.
Changing canonical serialization (e.g. switching boolean from "true"/"false" to "1"/"0"). Don't.

Why not other formats

Inline fields in daily notes: Not portable across kinds. Pollutes daily notes. No clean home for extensible per-event fields.
YAML array of events in frontmatter: Slow to parse at scale. Frontmatter editor chokes on long arrays.
JSON sidecar: Stops being "your notes." Loses greppability. Worse for sync conflicts.
Single events database file: Sync-conflict prone.
Pure positional fields (no key-value): Brittle for extension, ambiguous when fields are missing, no per-definition customization.
Unquoted key-value (quality=4): Two parsing rules instead of one. Ambiguous when values contain spaces.

The chosen format trades some read performance for sync-friendliness, greppability, per-definition isolation, and effortless field extension.

Tech stack

Language: TypeScript
UI framework: Svelte 5 (runes mode)
Bundler: esbuild
Charting: Chart.js for v1
Modals: Obsidian's native Modal class with Svelte mounted inside
Date handling: date-fns
ID generation: ULID (sortable, dedupe-friendly)


Open questions / future considerations

Reminders / notifications. Obsidian's notification API is weak, especially on mobile. Consider for v0.4+.
Templating from existing daily notes. Importer for users with existing inline-field tracking. Not required for v1.
Sharing definitions. Users sharing "good habit definition packs" — punt to a future packaging effort.
Goals. Most goals decompose into queries the existing kinds already support. Resist building a separate Goals abstraction.
Field history / versioning. If a user changes a field's range after data exists, old data may be out of range. Surface as rangeWarning. Don't build versioning until pain is real.
Date/time field types. Deferred to v0.3. ISO 8601 only when added.
Escape syntax for quotes / newlines in values. Currently forbidden. Revisit if real use cases emerge.
Computed fields. A field whose value is derived from other fields (e.g. pace = duration / distance). Out of scope for v1; user can compute in queries.


Risks and mitigations
RiskMitigationSchema changes break existing dataExtensible field format means most changes don't break anything. schemaVersion for the rare core-field change.Field type changes orphan old valuesFieldValue.raw always preserved; coercion failures surface as warnings, never silent loss.Forbidden characters in user inputSanitize at write time with clear error messages; refuse the write rather than corrupting the format.Mobile UX is unusableTest on phone weekly from Phase 2 onward.Per-file reads slow at scalemtime-based cache; only re-parse changed files.Sync conflicts corrupt definitionsAppend-only writes for events; clear last-write-wins rules for definitions.Feature creep before v0.1 shipsStick to the incremental release path.User adds many definitions then loses motivationArchive (not delete) preserves data; dormant projects don't nag.Field block grows unwieldy in long linesDisplay compact summary in list views; full breakdown in detail panel. Consider line-wrapping conventions if it becomes a real readability problem.Event ID collisions / missing IDs in manually-edited filesGenerate ULID on load if missing; rewrite line on next save.

Glossary

Definition: A trackable thing — a habit, maintenance task, reverse habit, project, or counter.
Event: A single occurrence of a definition.
Kind: The category of a definition. Drives UI and logic, not storage.
Cadence: A target frequency, e.g. 4/week.
Freshness: How recent the most recent event is, relative to a definition's interval.
Latency budget: For maintenance kinds, the acceptable gap between events.
Reverse habit: A definition where longer gaps are better.
Perfect day: A day where every habit due that day was logged.
Field block: The space-separated key="value" portion of an event line, after the third pipe.
Field schema: The optional fieldSchema array on a definition, describing the shape of each custom field.
Retired field: A field marked retired: true — hidden from the logging UI but preserved in old events.
Coercion: Converting a raw field string into a typed value per fieldSchema. Failures don't drop data; they surface warnings.
Range warning: A field that coerced successfully but violates range or options. Not an error; surfaced as a soft warning.

# Built from Obsidian Plugin Template with Svelte and Tailwind CSS (UnoCSS)

This is built from a template repository for creating an Obsidian plugin using Svelte and
Tailwind CSS (UnoCSS). It provides a basic setup and structure to kickstart your
development process.

Obsidian is a powerful note-taking and knowledge management application. With
the help of this template, you can create a plugin that extends Obsidian's
functionality using Svelte, a popular JavaScript framework for building user
interfaces, along with Tailwind CSS (UnoCSS), a utility-first CSS framework.

## Features

- **Svelte integration**: Leverage the power of Svelte to build interactive and
  reactive user interfaces.
- **Tailwind CSS (UnoCSS)**: Utilize the comprehensive utility classes provided by
  Tailwind CSS (UnoCSS) to style your plugin.
- **Easy setup**: Get started quickly with a pre-configured project structure
  and build setup.
- **Hot-reloading**: Enjoy fast development cycles with automatic reloading
  during development.
- **Example plugin**: Includes a basic example plugin to help you understand the
  structure and usage.

## Prerequisites

Before you get started, ensure that you have the following software installed:

- [node.js](https://nodejs.org) (v14 or above)
- [bun.sh](https://bun.sh/) (way better than any other node package managers)

## Getting Started

1. Clone the repository to your local machine.
2. Open a terminal and navigate to the cloned repository.
3. Install the project dependencies by running the following command:

```bash
bun install
```

4. Start the development server with hot-reloading using the following command:

```bash
bun dev
```

5. In **Obsidian**, open **Settings**.
6. In the side menu, select **Community plugins**.
7. Select **Turn on community plugins**.
8. Under **Installed plugins**, enable the **Life Tracker** by
   selecting the toggle button next to it.

To build new changes use: 

```bash
bun run build
```

11. The bundled plugin file will be generated in the `build` directory.

## Project Structure

The project structure follows a typical Svelte application structure with a few
additional files specific to Obsidian plugin development. Here's an overview:

- `src/` - Contains the **source code** for your plugin.
  - **main.ts** - The **entry point** for your plugin, initializes the plugin in
    Obsidian.
  - **styles.css** - The global css **styles** for your plugin.
  - `components/` - Contains **Svelte Components**.
    - **Example.svelte** - An example **Svelte Component** for the example
      Obsidian View.
  - `views/` - Contains **Obsidian Views**.
    - **ExampleView.ts** - An example **Obsidian View** with Svelte.
- `build/` - The bundled output directory for the plugin generated by the build
  command.
- **manifest.json** - The plugin manifest file that describes your plugin's
  metadata.

## Source mapping
To get the source map to load in Obsidian, and thus allowing you to see your Typescript code when debugging, you might need to set the 
**sourcemapBaseUrl** parameter in **vite.config.ts**. To actual path can be found by adding the folder (test-vault) containing your .map file to the "Filesystem" 
tab in the debugger. Right-click the map file and select "Copy link address". Set **sourcemapBaseUrl** to the base address.

## Resources

Here are some resources to help you get started with building plugins for
Obsidian, Svelte, and Tailwind CSS (UnoCSS):

- [Obsidian Plugin API Documentation](https://github.com/obsidianmd/obsidian-api)
- [Svelte Documentation](https://svelte.dev/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [UnoCSS Documentation](https://unocss.dev/)

## Contributing

If you encounter any issues or have suggestions for improvements, feel free to
open an issue or submit a pull request. Contributions are welcome!

## License

This template is available under the [MIT License](LICENSE). Feel free to modify
and use it to create your own Obsidian plugins.
