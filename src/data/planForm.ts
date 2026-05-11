import { formatPlanLine } from "./dailyNote";
import type { Definition } from "./types";

export interface PlanFormInput {
	date: string;
	startTime: string;
	endTime: string;
	label: string;
	/** When true, the emitted line wraps its label in an Obsidian wikilink
	 *  to the definition (target = `def.id`). */
	linkToDefinition?: boolean;
}

export interface PlanFormSuccess {
	ok: true;
	date: string;
	line: string;
}

export interface PlanFormFailure {
	ok: false;
	error: string;
}

export type PlanFormResult = PlanFormSuccess | PlanFormFailure;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function buildPlanLine(
	def: Definition,
	input: PlanFormInput,
): PlanFormResult {
	if (!DATE_RE.test(input.date)) {
		return { ok: false, error: "Date must be YYYY-MM-DD" };
	}
	if (!TIME_RE.test(input.startTime)) {
		return { ok: false, error: "Start time must be HH:MM" };
	}
	const end = input.endTime.trim();
	if (end !== "" && !TIME_RE.test(end)) {
		return { ok: false, error: "End time must be HH:MM (or blank)" };
	}
	if (end !== "" && end <= input.startTime) {
		return { ok: false, error: "End time must be after start time" };
	}

	const label = input.label.trim();
	if (label.includes("\n")) {
		return { ok: false, error: "Label cannot contain a newline" };
	}

	const line = formatPlanLine({
		kind: def.kind,
		displayName: def.displayName,
		label,
		startTime: input.startTime,
		endTime: end || undefined,
		tags: def.tags,
		linkTarget: input.linkToDefinition ? def.id : undefined,
	});

	return { ok: true, date: input.date, line };
}
