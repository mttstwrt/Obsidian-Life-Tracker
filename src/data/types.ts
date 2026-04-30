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
	fields: Record<string, FieldValue>;
}

export type DefinitionKind =
	| "habit"
	| "maintenance"
	| "reverse-habit"
	| "project"
	| "counter";

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

export type Definition =
	| HabitDefinition
	| MaintenanceDefinition
	| ReverseHabitDefinition
	| ProjectDefinition
	| CounterDefinition;

export const CURRENT_SCHEMA_VERSION = 1;

export const FIELD_KEY_RE = /^[a-z_][a-z0-9_]*$/;

export const RESERVED_FIELD_KEY_ID = "id";
