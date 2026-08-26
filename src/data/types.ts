export type FieldType = "number" | "string" | "boolean" | "enum" | "list";

export type FieldItemType = "number" | "string" | "boolean";

export interface FieldDef {
	key: string;
	type: FieldType;
	range?: [number, number];
	options?: string[];
	itemType?: FieldItemType;
	required?: boolean;
	prompt?: string;
	retired?: boolean;
}

export type FieldCoerced =
	| number
	| string
	| boolean
	| Array<number | string | boolean>;

export interface FieldValue {
	raw: string;
	coerced?: FieldCoerced;
	coercionError?: string;
	rangeWarning?: string;
}

export interface Event {
	id: string;
	timestamp: string;
	value?: number;
	note?: string;
	/**
	 * Provenance / dedup key. Set by writers that can fire repeatedly for the
	 * same logical event — currently the daily-note auto-log path, which sets
	 * `daily:{YYYY-MM-DD}T{HH:MM}` so two devices checking the same plan line
	 * produce the same source value. `appendEvent` refuses to write a second
	 * event with a source already present in the file.
	 */
	source?: string;
	fields: Record<string, FieldValue>;
}

export type DefinitionKind =
	| "habit"
	| "maintenance"
	| "reverse-habit"
	| "project"
	| "counter"
	| "score";

export type DefinitionStatus = "active" | "dormant" | "archived";

interface BaseDefinition {
	id: string;
	displayName: string;
	emoji?: string;
	status: DefinitionStatus;
	tags: string[];
	created: string;
	schemaVersion: number;
	fieldSchema?: FieldDef[];
	/** Default planned-block length in minutes; used by the Plan tab to prefill end time. */
	defaultDuration?: number;
}

export interface HabitDefinition extends BaseDefinition {
	kind: "habit";
	valueType: "boolean" | "count" | "duration" | "custom";
	unit?: string;
	targetCadence: string;
}

export interface MaintenanceDefinition extends BaseDefinition {
	kind: "maintenance";
	intervalDays: number;
	warningThresholdDays: number;
}

export interface ReverseHabitDefinition extends BaseDefinition {
	kind: "reverse-habit";
	noteRequired?: boolean;
	milestones?: number[];
}

export interface ProjectDefinition extends BaseDefinition {
	kind: "project";
	dormantAfterDays?: number;
}

export interface CounterDefinition extends BaseDefinition {
	kind: "counter";
	unit?: string;
	goal?: number;
	resetCadence?: "yearly" | "monthly" | "never";
}

/** How several ratings logged on the same day fold into that day's value. */
export type ScoreDayAggregate = "mean" | "last" | "max" | "min";

export const SCORE_DAY_AGGREGATES: ScoreDayAggregate[] = [
	"mean",
	"last",
	"max",
	"min",
];

export const DEFAULT_SCORE_SCALE: [number, number] = [1, 10];
export const DEFAULT_SCORE_DAY_AGGREGATE: ScoreDayAggregate = "mean";

/**
 * A rating rather than an occurrence — "how did I sleep", "how was work".
 *
 * The rating itself lives in `Event.value`, so score events use the same line
 * format as every other kind and need no parser changes. A score event without
 * a value is meaningless, so unlike other kinds the value is *required* at
 * write time (see `buildLogEvent`).
 *
 * Note the asymmetry with `fieldSchema`: a rating that qualifies an event you
 * are already logging ("how good was that workout") belongs on that definition
 * as a `number` field with a `range`, not here. This kind is for ratings that
 * *are* the event.
 */
export interface ScoreDefinition extends BaseDefinition {
	kind: "score";
	/** Inclusive integer bounds, low end first. */
	scale: [number, number];
	/** Endpoint captions for the slider, e.g. ["awful", "great"]. */
	scaleLabels?: [string, string];
	/** False for stress / pain / urge, where a low rating is the good one. */
	higherIsBetter?: boolean;
	dayAggregate?: ScoreDayAggregate;
	/** Optional level to stay above (or below, when `higherIsBetter` is false). */
	target?: number;
	/** How often a rating is expected, e.g. "1/day". Drives coverage and freshness only — scores have no streaks. */
	expectedCadence?: string;
}

export type Definition =
	| HabitDefinition
	| MaintenanceDefinition
	| ReverseHabitDefinition
	| ProjectDefinition
	| CounterDefinition
	| ScoreDefinition;

export const CURRENT_SCHEMA_VERSION = 1;

export const FIELD_KEY_RE = /^[a-z_][a-z0-9_]*$/;

export const RESERVED_FIELD_KEY_ID = "id";
export const RESERVED_FIELD_KEY_SOURCE = "source";
