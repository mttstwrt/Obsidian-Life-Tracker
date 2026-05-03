import { coerceField } from "./coerce";
import type { Definition, Event, FieldDef, FieldValue } from "./types";

export interface LogFormInput {
	date: string;
	time: string;
	initialDate: string;
	initialTime: string;
	valueRaw: string;
	note: string;
	fieldRaws: Record<string, string>;
	now?: () => Date;
	mode?: "create" | "edit";
}

export interface LogFormSuccess {
	ok: true;
	event: Omit<Event, "id">;
	retroactive: boolean;
}

export interface LogFormFailure {
	ok: false;
	error: string;
	field?: string;
}

export type LogFormResult = LogFormSuccess | LogFormFailure;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function valueExpected(def: Definition): "boolean" | "number" | "none" {
	if (def.kind === "habit") {
		return def.valueType === "boolean" ? "boolean" : "number";
	}
	if (def.kind === "maintenance" || def.kind === "reverse-habit") {
		return "boolean";
	}
	return "number";
}

export function buildLogEvent(
	def: Definition,
	input: LogFormInput,
): LogFormResult {
	if (!DATE_RE.test(input.date)) {
		return { ok: false, error: "Date must be YYYY-MM-DD" };
	}
	if (!TIME_RE.test(input.time)) {
		return { ok: false, error: "Time must be HH:MM" };
	}
	const timestamp = `${input.date}T${input.time}`;

	if (input.note.includes("\n")) {
		return { ok: false, error: "Note cannot contain a newline" };
	}
	if (input.note.includes('"')) {
		return { ok: false, error: 'Note cannot contain a "' };
	}
	if (input.note.includes("|")) {
		return { ok: false, error: "Note cannot contain '|'" };
	}
	if (def.kind === "reverse-habit" && def.noteRequired && input.note.trim() === "") {
		return { ok: false, error: "Note is required for this reverse habit" };
	}

	let value: number | undefined;
	const expected = valueExpected(def);
	if (expected === "boolean") {
		value = 1;
	} else if (expected === "number") {
		const trimmed = input.valueRaw.trim();
		if (trimmed !== "") {
			if (!NUMBER_RE.test(trimmed)) {
				return { ok: false, error: `Value "${trimmed}" is not a number` };
			}
			value = Number(trimmed);
		}
	}

	const activeFields = (def.fieldSchema ?? []).filter((f) => !f.retired);
	const fields: Record<string, FieldValue> = {};

	for (const f of activeFields) {
		const raw = input.fieldRaws[f.key];
		const present = raw !== undefined && raw !== "";
		if (f.required && !present) {
			return {
				ok: false,
				error: `Field "${labelFor(f)}" is required`,
				field: f.key,
			};
		}
		if (raw === undefined) continue;
		if (raw.includes("\n")) {
			return {
				ok: false,
				error: `Field "${labelFor(f)}" cannot contain a newline`,
				field: f.key,
			};
		}
		if (raw.includes('"')) {
			return {
				ok: false,
				error: `Field "${labelFor(f)}" cannot contain a "`,
				field: f.key,
			};
		}
		fields[f.key] = coerceField(raw, f);
	}

	const retroactive =
		input.date !== input.initialDate || input.time !== input.initialTime;
	if (retroactive && input.mode !== "edit") {
		const now = (input.now ?? (() => new Date()))();
		fields.entered_at = coerceField(now.toISOString());
	}

	const event: Omit<Event, "id"> = {
		timestamp,
		value,
		note: input.note.trim() === "" ? undefined : input.note.trim(),
		fields,
	};

	return { ok: true, event, retroactive };
}

function labelFor(f: FieldDef): string {
	return f.prompt ?? f.key;
}

export function localDateString(d: Date = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function localTimeString(d: Date = new Date()): string {
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	return `${h}:${m}`;
}
