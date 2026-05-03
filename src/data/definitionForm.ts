import {
	CURRENT_SCHEMA_VERSION,
	type Definition,
	type DefinitionKind,
	type FieldDef,
	type FieldItemType,
	type FieldType,
	FIELD_KEY_RE,
	RESERVED_FIELD_KEY_ID,
} from "./types";

export interface FieldSchemaRowInput {
	key: string;
	type: FieldType;
	rangeMin?: string;
	rangeMax?: string;
	optionsCsv?: string;
	itemType?: FieldItemType | "";
	required?: boolean;
	prompt?: string;
	retired?: boolean;
}

export interface DefinitionFormInput {
	kind: DefinitionKind;
	displayName: string;
	emoji?: string;
	tagsCsv?: string;
	valueType?: "boolean" | "count" | "duration" | "custom";
	unit?: string;
	targetCadence?: string;
	intervalDays?: string;
	warningThresholdDays?: string;
	noteRequired?: boolean;
	milestonesCsv?: string;
	dormantAfterDays?: string;
	goal?: string;
	resetCadence?: "yearly" | "monthly" | "never" | "";
	fieldSchema: FieldSchemaRowInput[];
}

export interface BuildDefinitionOptions {
	existingIds: Set<string>;
	existing?: Definition;
	now?: () => Date;
}

export interface BuildDefinitionSuccess {
	ok: true;
	definition: Definition;
	warnings: string[];
}

export interface BuildDefinitionFailure {
	ok: false;
	error: string;
	field?: string;
}

export type BuildDefinitionResult =
	| BuildDefinitionSuccess
	| BuildDefinitionFailure;

const TARGET_CADENCE_RE = /^(\d+)\s*\/\s*(day|week|month)$/i;

export function parseTargetCadence(
	s: string,
): { count: number; period: "day" | "week" | "month" } | null {
	const m = s.trim().match(TARGET_CADENCE_RE);
	if (!m) return null;
	const count = Number(m[1]);
	if (!Number.isFinite(count) || count <= 0) return null;
	return {
		count,
		period: m[2].toLowerCase() as "day" | "week" | "month",
	};
}

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function uniqueSlug(base: string, existingIds: Set<string>): string {
	const seed = base === "" ? "definition" : base;
	if (!existingIds.has(seed)) return seed;
	let i = 2;
	while (existingIds.has(`${seed}-${i}`)) i++;
	return `${seed}-${i}`;
}

function parseNumberOrNull(s: string | undefined): number | null {
	if (s === undefined) return null;
	const trimmed = s.trim();
	if (trimmed === "") return null;
	const n = Number(trimmed);
	if (!Number.isFinite(n)) return null;
	return n;
}

function dateStringFrom(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function buildDefinitionFromInput(
	input: DefinitionFormInput,
	opts: BuildDefinitionOptions,
): BuildDefinitionResult {
	const displayName = input.displayName.trim();
	if (displayName === "") {
		return {
			ok: false,
			error: "Display name is required",
			field: "displayName",
		};
	}

	const fieldSchemaResult = buildFieldSchema(input.fieldSchema);
	if (!fieldSchemaResult.ok) return fieldSchemaResult;
	const fieldSchema = fieldSchemaResult.fieldSchema;

	const tags = (input.tagsCsv ?? "")
		.split(",")
		.map((t) => t.trim())
		.filter((t) => t.length > 0);

	const editing = opts.existing !== undefined;
	const id = editing
		? opts.existing!.id
		: uniqueSlug(slugify(displayName), opts.existingIds);
	const created = editing
		? opts.existing!.created
		: dateStringFrom((opts.now ?? (() => new Date()))());
	const schemaVersion = editing
		? opts.existing!.schemaVersion
		: CURRENT_SCHEMA_VERSION;
	const status = editing ? opts.existing!.status : "active";
	const emoji = input.emoji?.trim() === "" ? undefined : input.emoji?.trim();

	const base = {
		id,
		displayName,
		emoji,
		status,
		tags,
		created,
		schemaVersion,
		fieldSchema: fieldSchema.length > 0 ? fieldSchema : undefined,
	};

	let definition: Definition;
	switch (input.kind) {
		case "habit": {
			const targetCadence = (input.targetCadence ?? "").trim();
			if (!parseTargetCadence(targetCadence)) {
				return {
					ok: false,
					error:
						'Target cadence must look like "4/week" (count followed by /day, /week, or /month)',
					field: "targetCadence",
				};
			}
			definition = {
				...base,
				kind: "habit",
				valueType: input.valueType ?? "count",
				unit: input.unit?.trim() === "" ? undefined : input.unit?.trim(),
				targetCadence,
			};
			break;
		}
		case "maintenance": {
			const intervalDays = parseNumberOrNull(input.intervalDays);
			if (intervalDays === null || intervalDays <= 0) {
				return {
					ok: false,
					error: "Interval days must be a positive number",
					field: "intervalDays",
				};
			}
			const warning = parseNumberOrNull(input.warningThresholdDays);
			if (warning !== null && warning < 0) {
				return {
					ok: false,
					error: "Warning threshold cannot be negative",
					field: "warningThresholdDays",
				};
			}
			definition = {
				...base,
				kind: "maintenance",
				intervalDays,
				warningThresholdDays: warning ?? 0,
			};
			break;
		}
		case "reverse-habit": {
			const milestones = (input.milestonesCsv ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0)
				.map((s) => Number(s));
			if (milestones.some((n) => !Number.isFinite(n) || n <= 0)) {
				return {
					ok: false,
					error:
						"Milestones must be a comma-separated list of positive numbers",
					field: "milestonesCsv",
				};
			}
			definition = {
				...base,
				kind: "reverse-habit",
				noteRequired: input.noteRequired === true ? true : undefined,
				milestones: milestones.length > 0 ? milestones : undefined,
			};
			break;
		}
		case "project": {
			const dormant = parseNumberOrNull(input.dormantAfterDays);
			if (dormant !== null && dormant < 0) {
				return {
					ok: false,
					error: "Dormant-after days cannot be negative",
					field: "dormantAfterDays",
				};
			}
			definition = {
				...base,
				kind: "project",
				dormantAfterDays: dormant ?? undefined,
			};
			break;
		}
		case "counter": {
			const goal = parseNumberOrNull(input.goal);
			const reset = input.resetCadence === "" ? undefined : input.resetCadence;
			definition = {
				...base,
				kind: "counter",
				unit: input.unit?.trim() === "" ? undefined : input.unit?.trim(),
				goal: goal ?? undefined,
				resetCadence: reset,
			};
			break;
		}
	}

	const warnings: string[] = [];
	if (editing) {
		const existing = opts.existing!;
		if (existing.kind !== input.kind) {
			return {
				ok: false,
				error: `Cannot change kind of an existing definition (was "${existing.kind}", got "${input.kind}")`,
				field: "kind",
			};
		}
		const oldKeys = new Set((existing.fieldSchema ?? []).map((f) => f.key));
		const newKeys = new Set((definition.fieldSchema ?? []).map((f) => f.key));
		for (const k of oldKeys) {
			if (!newKeys.has(k)) {
				warnings.push(
					`Field "${k}" was removed (not retired). Old events still contain this field; they'll display as raw strings without prompts.`,
				);
			}
		}
	}

	return { ok: true, definition, warnings };
}

interface FieldSchemaOk {
	ok: true;
	fieldSchema: FieldDef[];
}

function buildFieldSchema(
	rows: FieldSchemaRowInput[],
): FieldSchemaOk | BuildDefinitionFailure {
	const seen = new Set<string>();
	const out: FieldDef[] = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const key = row.key.trim();
		if (key === "") {
			return {
				ok: false,
				error: `Field row ${i + 1}: key is required`,
				field: `fieldSchema.${i}.key`,
			};
		}
		if (key === RESERVED_FIELD_KEY_ID) {
			return {
				ok: false,
				error: `Field key "${key}" is reserved for the event ID`,
				field: `fieldSchema.${i}.key`,
			};
		}
		if (!FIELD_KEY_RE.test(key)) {
			return {
				ok: false,
				error: `Field key "${key}" must be lowercase letters, digits, and underscores (no hyphens) and start with a letter or underscore`,
				field: `fieldSchema.${i}.key`,
			};
		}
		if (seen.has(key)) {
			return {
				ok: false,
				error: `Duplicate field key "${key}"`,
				field: `fieldSchema.${i}.key`,
			};
		}
		seen.add(key);

		const def: FieldDef = { key, type: row.type };
		switch (row.type) {
			case "number": {
				const lo = (row.rangeMin ?? "").trim();
				const hi = (row.rangeMax ?? "").trim();
				if (lo !== "" || hi !== "") {
					if (lo === "" || hi === "") {
						return {
							ok: false,
							error: `Field "${key}": range requires both min and max`,
							field: `fieldSchema.${i}.range`,
						};
					}
					const lon = Number(lo);
					const hin = Number(hi);
					if (!Number.isFinite(lon) || !Number.isFinite(hin)) {
						return {
							ok: false,
							error: `Field "${key}": range values must be numbers`,
							field: `fieldSchema.${i}.range`,
						};
					}
					if (lon > hin) {
						return {
							ok: false,
							error: `Field "${key}": range min (${lon}) must be ≤ max (${hin})`,
							field: `fieldSchema.${i}.range`,
						};
					}
					def.range = [lon, hin];
				}
				break;
			}
			case "enum": {
				const opts = (row.optionsCsv ?? "")
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0);
				if (opts.length === 0) {
					return {
						ok: false,
						error: `Field "${key}": enum requires at least one option`,
						field: `fieldSchema.${i}.options`,
					};
				}
				def.options = opts;
				break;
			}
			case "list": {
				if (
					row.itemType !== "number" &&
					row.itemType !== "string" &&
					row.itemType !== "boolean"
				) {
					return {
						ok: false,
						error: `Field "${key}": list requires itemType (number, string, or boolean)`,
						field: `fieldSchema.${i}.itemType`,
					};
				}
				def.itemType = row.itemType;
				break;
			}
			case "string":
			case "boolean":
				break;
		}
		if (row.required === true) def.required = true;
		const prompt = (row.prompt ?? "").trim();
		if (prompt !== "") def.prompt = prompt;
		if (row.retired === true) def.retired = true;
		out.push(def);
	}
	return { ok: true, fieldSchema: out };
}

export function emptyFormInput(kind: DefinitionKind): DefinitionFormInput {
	const base: DefinitionFormInput = {
		kind,
		displayName: "",
		emoji: "",
		tagsCsv: "",
		fieldSchema: [],
	};
	switch (kind) {
		case "habit":
			return { ...base, valueType: "count", unit: "", targetCadence: "" };
		case "maintenance":
			return { ...base, intervalDays: "", warningThresholdDays: "" };
		case "reverse-habit":
			return { ...base, noteRequired: false, milestonesCsv: "" };
		case "project":
			return { ...base, dormantAfterDays: "" };
		case "counter":
			return { ...base, unit: "", goal: "", resetCadence: "" };
	}
}

export function definitionToFormInput(def: Definition): DefinitionFormInput {
	const fieldSchema: FieldSchemaRowInput[] = (def.fieldSchema ?? []).map(
		(f) => ({
			key: f.key,
			type: f.type,
			rangeMin: f.range ? String(f.range[0]) : "",
			rangeMax: f.range ? String(f.range[1]) : "",
			optionsCsv: f.options?.join(", ") ?? "",
			itemType: f.itemType ?? "",
			required: f.required === true,
			prompt: f.prompt ?? "",
			retired: f.retired === true,
		}),
	);
	const base: DefinitionFormInput = {
		kind: def.kind,
		displayName: def.displayName,
		emoji: def.emoji ?? "",
		tagsCsv: def.tags.join(", "),
		fieldSchema,
	};
	switch (def.kind) {
		case "habit":
			return {
				...base,
				valueType: def.valueType,
				unit: def.unit ?? "",
				targetCadence: def.targetCadence,
			};
		case "maintenance":
			return {
				...base,
				intervalDays: String(def.intervalDays),
				warningThresholdDays: String(def.warningThresholdDays),
			};
		case "reverse-habit":
			return {
				...base,
				noteRequired: def.noteRequired === true,
				milestonesCsv: (def.milestones ?? []).join(", "),
			};
		case "project":
			return {
				...base,
				dormantAfterDays:
					def.dormantAfterDays !== undefined
						? String(def.dormantAfterDays)
						: "",
			};
		case "counter":
			return {
				...base,
				unit: def.unit ?? "",
				goal: def.goal !== undefined ? String(def.goal) : "",
				resetCadence: def.resetCadence ?? "",
			};
	}
}
