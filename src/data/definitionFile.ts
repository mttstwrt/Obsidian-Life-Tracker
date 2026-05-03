import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parseEventLine, serializeEventLine } from "./eventLine";
import {
	CURRENT_SCHEMA_VERSION,
	type Definition,
	type DefinitionKind,
	type DefinitionStatus,
	type Event,
	type FieldDef,
} from "./types";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const EVENTS_HEADING_RE = /^##\s+Events\s*$/m;
const VALID_KINDS = new Set<DefinitionKind>([
	"habit",
	"maintenance",
	"reverse-habit",
	"project",
	"counter",
]);
const VALID_STATUSES = new Set<DefinitionStatus>([
	"active",
	"dormant",
	"archived",
]);

export interface ParsedDefinitionFile {
	definition: Definition;
	body: string;
	events: Event[];
	warnings: string[];
}

export interface ParseDefinitionFailure {
	ok: false;
	error: string;
}

export type ParseDefinitionResult =
	| ({ ok: true } & ParsedDefinitionFile)
	| ParseDefinitionFailure;

export function parseDefinitionFile(content: string): ParseDefinitionResult {
	const fmMatch = content.match(FRONTMATTER_RE);
	if (!fmMatch) {
		return { ok: false, error: "missing frontmatter" };
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(fmMatch[1]);
	} catch (e) {
		return {
			ok: false,
			error: `frontmatter YAML parse error: ${(e as Error).message}`,
		};
	}
	if (!parsed || typeof parsed !== "object") {
		return { ok: false, error: "frontmatter is not a mapping" };
	}

	const defResult = buildDefinition(parsed as Record<string, unknown>);
	if (!defResult.ok) return defResult;

	const remainder = content.slice(fmMatch[0].length);
	const eventsIdx = remainder.search(EVENTS_HEADING_RE);

	let body: string;
	let eventsSection: string;
	if (eventsIdx < 0) {
		body = remainder;
		eventsSection = "";
	} else {
		body = remainder.slice(0, eventsIdx);
		const afterHeading = remainder
			.slice(eventsIdx)
			.replace(EVENTS_HEADING_RE, "");
		eventsSection = afterHeading.replace(/^\r?\n/, "");
	}

	const warnings: string[] = [];
	const events: Event[] = [];
	if (eventsSection) {
		for (const rawLine of eventsSection.split("\n")) {
			const line = rawLine.replace(/\r$/, "");
			if (line.trim() === "") continue;
			if (!line.startsWith("- ")) continue;
			const result = parseEventLine(line, defResult.definition.fieldSchema);
			if (!result.ok) {
				warnings.push(`skipped malformed event line: ${result.error}`);
				continue;
			}
			for (const w of result.warnings) {
				warnings.push(`event ${result.event.timestamp}: ${w}`);
			}
			events.push(result.event);
		}
	}

	return {
		ok: true,
		definition: defResult.definition,
		body,
		events,
		warnings,
	};
}

interface BuildOk {
	ok: true;
	definition: Definition;
}
function buildDefinition(
	raw: Record<string, unknown>,
): BuildOk | ParseDefinitionFailure {
	const id = stringField(raw, "id");
	const displayName = stringField(raw, "displayName");
	const kindRaw = stringField(raw, "kind");
	if (!id) return { ok: false, error: "missing id" };
	if (!displayName) return { ok: false, error: "missing displayName" };
	if (!kindRaw) return { ok: false, error: "missing kind" };
	if (!VALID_KINDS.has(kindRaw as DefinitionKind)) {
		return { ok: false, error: `invalid kind: "${kindRaw}"` };
	}
	const kind = kindRaw as DefinitionKind;

	const status = (stringField(raw, "status") ?? "active") as DefinitionStatus;
	if (!VALID_STATUSES.has(status)) {
		return { ok: false, error: `invalid status: "${status}"` };
	}

	const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
	const created = stringField(raw, "created") ?? "";
	const schemaVersion =
		typeof raw.schemaVersion === "number"
			? raw.schemaVersion
			: CURRENT_SCHEMA_VERSION;
	const emoji = stringField(raw, "emoji");
	const fieldSchema = parseFieldSchema(raw.fieldSchema);
	const defaultDuration = numberField(raw, "defaultDuration");

	const base = {
		id,
		displayName,
		emoji,
		status,
		tags,
		created,
		schemaVersion,
		fieldSchema,
		defaultDuration:
			defaultDuration !== undefined && defaultDuration > 0
				? defaultDuration
				: undefined,
	};

	switch (kind) {
		case "habit": {
			const valueType = (stringField(raw, "valueType") ??
				"count") as "boolean" | "count" | "duration" | "custom";
			const targetCadence = stringField(raw, "targetCadence") ?? "";
			return {
				ok: true,
				definition: {
					...base,
					kind: "habit",
					valueType,
					unit: stringField(raw, "unit"),
					targetCadence,
				},
			};
		}
		case "maintenance": {
			const intervalDays = numberField(raw, "intervalDays") ?? 0;
			const warningThresholdDays =
				numberField(raw, "warningThresholdDays") ?? 0;
			return {
				ok: true,
				definition: {
					...base,
					kind: "maintenance",
					intervalDays,
					warningThresholdDays,
				},
			};
		}
		case "reverse-habit": {
			const milestones = Array.isArray(raw.milestones)
				? raw.milestones.filter(
						(n): n is number => typeof n === "number",
					)
				: undefined;
			return {
				ok: true,
				definition: {
					...base,
					kind: "reverse-habit",
					noteRequired:
						typeof raw.noteRequired === "boolean"
							? raw.noteRequired
							: undefined,
					milestones,
				},
			};
		}
		case "project": {
			return {
				ok: true,
				definition: {
					...base,
					kind: "project",
					dormantAfterDays: numberField(raw, "dormantAfterDays"),
				},
			};
		}
		case "counter": {
			const resetCadence = stringField(raw, "resetCadence");
			return {
				ok: true,
				definition: {
					...base,
					kind: "counter",
					unit: stringField(raw, "unit"),
					goal: numberField(raw, "goal"),
					resetCadence:
						resetCadence === "yearly" ||
						resetCadence === "monthly" ||
						resetCadence === "never"
							? resetCadence
							: undefined,
				},
			};
		}
	}
}

function stringField(
	raw: Record<string, unknown>,
	key: string,
): string | undefined {
	const v = raw[key];
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return undefined;
}

function numberField(
	raw: Record<string, unknown>,
	key: string,
): number | undefined {
	const v = raw[key];
	if (typeof v === "number" && Number.isFinite(v)) return v;
	return undefined;
}

function parseFieldSchema(raw: unknown): FieldDef[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const out: FieldDef[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const e = entry as Record<string, unknown>;
		const key = typeof e.key === "string" ? e.key : undefined;
		const type = typeof e.type === "string" ? e.type : undefined;
		if (!key || !type) continue;
		if (
			type !== "number" &&
			type !== "string" &&
			type !== "boolean" &&
			type !== "enum" &&
			type !== "list"
		) {
			continue;
		}
		const def: FieldDef = { key, type };
		if (Array.isArray(e.range) && e.range.length === 2) {
			const [a, b] = e.range;
			if (typeof a === "number" && typeof b === "number") {
				def.range = [a, b];
			}
		}
		if (Array.isArray(e.options)) {
			def.options = e.options.map(String);
		}
		if (
			e.itemType === "number" ||
			e.itemType === "string" ||
			e.itemType === "boolean"
		) {
			def.itemType = e.itemType;
		}
		if (typeof e.required === "boolean") def.required = e.required;
		if (typeof e.prompt === "string") def.prompt = e.prompt;
		if (typeof e.retired === "boolean") def.retired = e.retired;
		out.push(def);
	}
	return out;
}

export function serializeDefinitionFrontmatter(def: Definition): string {
	const obj = definitionToYamlObject(def);
	const yaml = stringifyYaml(obj, { lineWidth: 0 });
	return `---\n${yaml}---\n`;
}

function definitionToYamlObject(def: Definition): Record<string, unknown> {
	const out: Record<string, unknown> = {
		id: def.id,
		displayName: def.displayName,
	};
	if (def.emoji !== undefined) out.emoji = def.emoji;
	out.kind = def.kind;
	out.status = def.status;
	out.tags = def.tags;
	out.created = def.created;
	out.schemaVersion = def.schemaVersion;

	switch (def.kind) {
		case "habit":
			out.valueType = def.valueType;
			if (def.unit !== undefined) out.unit = def.unit;
			out.targetCadence = def.targetCadence;
			break;
		case "maintenance":
			out.intervalDays = def.intervalDays;
			out.warningThresholdDays = def.warningThresholdDays;
			break;
		case "reverse-habit":
			if (def.noteRequired !== undefined)
				out.noteRequired = def.noteRequired;
			if (def.milestones !== undefined) out.milestones = def.milestones;
			break;
		case "project":
			if (def.dormantAfterDays !== undefined)
				out.dormantAfterDays = def.dormantAfterDays;
			break;
		case "counter":
			if (def.unit !== undefined) out.unit = def.unit;
			if (def.goal !== undefined) out.goal = def.goal;
			if (def.resetCadence !== undefined)
				out.resetCadence = def.resetCadence;
			break;
	}

	if (def.defaultDuration !== undefined) {
		out.defaultDuration = def.defaultDuration;
	}

	if (def.fieldSchema && def.fieldSchema.length > 0) {
		out.fieldSchema = def.fieldSchema.map(fieldDefToYaml);
	}

	return out;
}

function fieldDefToYaml(f: FieldDef): Record<string, unknown> {
	const out: Record<string, unknown> = { key: f.key, type: f.type };
	if (f.range) out.range = f.range;
	if (f.options) out.options = f.options;
	if (f.itemType) out.itemType = f.itemType;
	if (f.required !== undefined) out.required = f.required;
	if (f.prompt !== undefined) out.prompt = f.prompt;
	if (f.retired !== undefined) out.retired = f.retired;
	return out;
}

export function buildDefinitionFile(
	def: Definition,
	body = "",
	events: Event[] = [],
): string {
	const fm = serializeDefinitionFrontmatter(def);
	const trimmedBody = body.replace(/^\r?\n+/, "").replace(/\r?\n+$/, "");
	const eventLines = events.map((e) =>
		serializeEventLine(e, def.fieldSchema),
	);
	const eventsSection =
		eventLines.length > 0
			? `## Events\n\n${eventLines.join("\n")}\n`
			: "## Events\n\n";

	const parts = [fm];
	if (trimmedBody.length > 0) {
		parts.push(`\n${trimmedBody}\n`);
	}
	parts.push("\n");
	parts.push(eventsSection);
	return parts.join("");
}

export function replaceFrontmatter(content: string, def: Definition): string {
	const fmMatch = content.match(FRONTMATTER_RE);
	const newFm = serializeDefinitionFrontmatter(def);
	if (!fmMatch) {
		return `${newFm}\n${content}`;
	}
	return newFm + content.slice(fmMatch[0].length);
}

export function appendEventLineToContent(
	content: string,
	eventLine: string,
): string {
	const eventsIdx = content.search(EVENTS_HEADING_RE);
	if (eventsIdx < 0) {
		const trailingNl = content.endsWith("\n") ? "" : "\n";
		return `${content}${trailingNl}\n## Events\n\n${eventLine}\n`;
	}
	const trimmed = content.replace(/\s+$/, "");
	return `${trimmed}\n${eventLine}\n`;
}

export function replaceEventLineInContent(
	content: string,
	eventId: string,
	newLine: string,
): { ok: boolean; content: string } {
	const idMarker = `id="${eventId}"`;
	const lines = content.split("\n");
	let replaced = false;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith("- ") && lines[i].includes(idMarker)) {
			lines[i] = newLine;
			replaced = true;
			break;
		}
	}
	return { ok: replaced, content: lines.join("\n") };
}

export function removeEventLineFromContent(
	content: string,
	eventId: string,
): { ok: boolean; content: string } {
	const idMarker = `id="${eventId}"`;
	const lines = content.split("\n");
	const out: string[] = [];
	let removed = false;
	for (const line of lines) {
		if (
			!removed &&
			line.startsWith("- ") &&
			line.includes(idMarker)
		) {
			removed = true;
			continue;
		}
		out.push(line);
	}
	return { ok: removed, content: out.join("\n") };
}
