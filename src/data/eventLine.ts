import { coerceField } from "./coerce";
import {
	type Event,
	type FieldDef,
	type FieldValue,
	FIELD_KEY_RE,
	RESERVED_FIELD_KEY_ID,
	RESERVED_FIELD_KEY_SOURCE,
} from "./types";

const PERMISSIVE_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const FIELD_PAIR_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)="([^"\n]*)"/;

export interface EventParseSuccess {
	ok: true;
	event: Event;
	warnings: string[];
}

export interface EventParseFailure {
	ok: false;
	error: string;
}

export type EventParseResult = EventParseSuccess | EventParseFailure;

export function parseEventLine(
	line: string,
	fieldSchema?: FieldDef[],
): EventParseResult {
	const stripped = line.match(/^-\s+(.*)$/);
	if (!stripped) {
		return { ok: false, error: "line does not start with '- '" };
	}
	const body = stripped[1];

	const split = splitFour(body);
	if (!split) {
		return { ok: false, error: "expected 4 pipe-separated segments" };
	}
	const [tsRaw, valueRaw, noteRaw, fieldBlock] = split;

	const warnings: string[] = [];
	const fields: Record<string, FieldValue> = {};
	const seenKeys = new Set<string>();
	let id = "";
	let source: string | undefined;

	const blockResult = parseFieldBlock(fieldBlock);
	if (!blockResult.ok) {
		return { ok: false, error: blockResult.error };
	}

	for (const [key, rawValue] of blockResult.pairs) {
		if (!PERMISSIVE_KEY_RE.test(key)) {
			return { ok: false, error: `invalid field key: "${key}"` };
		}
		if (!FIELD_KEY_RE.test(key)) {
			warnings.push(
				`field key "${key}" does not match canonical snake_case`,
			);
		}
		if (seenKeys.has(key)) {
			warnings.push(`duplicate field key "${key}" — last wins`);
		}
		seenKeys.add(key);

		if (key === RESERVED_FIELD_KEY_ID) {
			id = rawValue;
			continue;
		}
		if (key === RESERVED_FIELD_KEY_SOURCE) {
			source = rawValue;
			continue;
		}

		const def = fieldSchema?.find((f) => f.key === key);
		fields[key] = coerceField(rawValue, def);
	}

	let value: number | undefined;
	if (valueRaw !== "") {
		if (/^-?\d+(\.\d+)?$/.test(valueRaw)) {
			value = Number(valueRaw);
		} else {
			warnings.push(`value "${valueRaw}" is not a number — dropped`);
		}
	}

	const event: Event = {
		id,
		timestamp: tsRaw,
		value,
		note: noteRaw === "" ? undefined : noteRaw,
		source,
		fields,
	};

	return { ok: true, event, warnings };
}

function splitFour(body: string): [string, string, string, string] | null {
	const parts: string[] = [];
	let rest = body;
	for (let i = 0; i < 3; i++) {
		const idx = rest.indexOf(" | ");
		if (idx < 0) {
			if (i === 2 && rest.endsWith(" |")) {
				parts.push(rest.slice(0, -2));
				parts.push("");
				return parts as [string, string, string, string];
			}
			if (i === 2 && rest === "") {
				return null;
			}
			return null;
		}
		parts.push(rest.slice(0, idx));
		rest = rest.slice(idx + 3);
	}
	parts.push(rest);
	return parts as [string, string, string, string];
}

interface FieldBlockOk {
	ok: true;
	pairs: Array<[string, string]>;
}
interface FieldBlockErr {
	ok: false;
	error: string;
}

function parseFieldBlock(block: string): FieldBlockOk | FieldBlockErr {
	const trimmed = block.trim();
	if (trimmed === "") return { ok: true, pairs: [] };

	const pairs: Array<[string, string]> = [];
	let rest = trimmed;
	while (rest.length > 0) {
		const m = rest.match(FIELD_PAIR_RE);
		if (!m) {
			return {
				ok: false,
				error: `unparseable field block fragment: "${rest}"`,
			};
		}
		pairs.push([m[1], m[2]]);
		rest = rest.slice(m[0].length);
		if (rest.length === 0) break;
		if (!rest.startsWith(" ")) {
			return {
				ok: false,
				error: `expected space between fields, got: "${rest}"`,
			};
		}
		rest = rest.replace(/^ +/, "");
	}
	return { ok: true, pairs };
}

export function serializeEventLine(
	event: Event,
	fieldSchema?: FieldDef[],
): string {
	if (event.timestamp.includes("|") || event.timestamp.includes("\n")) {
		throw new Error("timestamp cannot contain '|' or newline");
	}
	const note = event.note ?? "";
	if (note.includes("|") || note.includes("\n")) {
		throw new Error("note cannot contain '|' or newline");
	}
	const valueStr = event.value === undefined ? "" : String(event.value);

	const entries: Array<[string, string]> = [];
	if (event.id) entries.push([RESERVED_FIELD_KEY_ID, event.id]);
	if (event.source) entries.push([RESERVED_FIELD_KEY_SOURCE, event.source]);

	const schemaKeys = (fieldSchema ?? []).map((f) => f.key);
	for (const key of schemaKeys) {
		if (key === RESERVED_FIELD_KEY_ID) continue;
		if (key === RESERVED_FIELD_KEY_SOURCE) continue;
		if (Object.prototype.hasOwnProperty.call(event.fields, key)) {
			entries.push([key, event.fields[key].raw]);
		}
	}
	const knownSet = new Set([
		RESERVED_FIELD_KEY_ID,
		RESERVED_FIELD_KEY_SOURCE,
		...schemaKeys,
	]);
	const extraKeys = Object.keys(event.fields)
		.filter((k) => !knownSet.has(k))
		.sort();
	for (const key of extraKeys) {
		entries.push([key, event.fields[key].raw]);
	}

	for (const [k, v] of entries) {
		if (!PERMISSIVE_KEY_RE.test(k)) {
			throw new Error(`invalid field key: "${k}"`);
		}
		if (v.includes('"') || v.includes("\n")) {
			throw new Error(
				`field "${k}" value contains forbidden character (" or newline)`,
			);
		}
	}

	const fieldBlock = entries.map(([k, v]) => `${k}="${v}"`).join(" ");
	const tail = fieldBlock ? ` ${fieldBlock}` : "";
	return `- ${event.timestamp} | ${valueStr} | ${note} |${tail}`;
}
