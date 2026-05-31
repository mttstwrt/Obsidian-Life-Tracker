import type { CheckedPlanLine } from "./dailyNote";
import type { Definition, Event } from "./types";

function normalizeName(s: string): string {
	return s.trim().toLowerCase();
}

export function matchDefinitionByLabel(
	label: string,
	definitions: Definition[],
): Definition | null {
	const target = normalizeName(label);
	if (target === "") return null;
	for (const d of definitions) {
		if (d.status === "archived") continue;
		if (normalizeName(d.displayName) === target) return d;
	}
	for (const d of definitions) {
		if (d.status === "archived") continue;
		if (normalizeName(d.id) === target) return d;
	}
	return null;
}

/**
 * Build an ISO timestamp at the given local date + HH:mm. Local time is used
 * because daily notes are user-local: a "07:00" entry on 2026-05-03 means
 * 07:00 in the user's timezone, regardless of where the JS runtime serializes.
 */
export function buildPlannedTimestamp(
	date: string,
	startTime: string,
): string | null {
	const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
	const tm = /^(\d{2}):(\d{2})$/.exec(startTime);
	if (!dm || !tm) return null;
	const y = Number(dm[1]);
	const mo = Number(dm[2]);
	const d = Number(dm[3]);
	const h = Number(tm[1]);
	const mi = Number(tm[2]);
	if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
	return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

function durationMinutes(line: CheckedPlanLine): number | null {
	if (!line.endTime) return null;
	const sm = parseHm(line.startTime);
	const em = parseHm(line.endTime);
	if (sm === null || em === null || em <= sm) return null;
	return em - sm;
}

function parseHm(t: string): number | null {
	const m = /^(\d{2}):(\d{2})$/.exec(t);
	if (!m) return null;
	return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Compute the value to write for an auto-logged event based on the kind/valueType
 * and whether the plan line had a duration. Returns undefined when no value should
 * be emitted (the event line accepts an empty value segment).
 */
export function computeAutoValue(
	def: Definition,
	line: CheckedPlanLine,
): number | undefined {
	if (def.kind === "habit" && def.valueType === "duration") {
		return durationMinutes(line) ?? def.defaultDuration ?? undefined;
	}
	return 1;
}

export interface AutoEvent {
	timestamp: string;
	value?: number;
	/** Deterministic dedup key — see `Event.source`. */
	source: string;
}

/**
 * Build the dedup key for an auto-logged checkbox event. The format is keyed
 * on (date, startTime) — independent of device, daily-note path, and label —
 * so two devices auto-logging the same plan line produce the same value.
 */
export function buildAutoEventSource(
	date: string,
	startTime: string,
): string {
	return `daily:${date}T${startTime}`;
}

/**
 * Returns null if the planned timestamp can't be computed or the definition has
 * required fields (which we can't safely fill from a checkbox alone).
 */
export function buildAutoEvent(
	def: Definition,
	line: CheckedPlanLine,
	date: string,
): AutoEvent | null {
	const timestamp = buildPlannedTimestamp(date, line.startTime);
	if (!timestamp) return null;
	const required = (def.fieldSchema ?? []).filter(
		(f) => f.required && !f.retired,
	);
	if (required.length > 0) return null;
	return {
		timestamp,
		value: computeAutoValue(def, line),
		source: buildAutoEventSource(date, line.startTime),
	};
}

export function autoEventToEventInput(auto: AutoEvent): Event {
	return {
		id: "",
		timestamp: auto.timestamp,
		value: auto.value,
		source: auto.source,
		fields: {},
	};
}
