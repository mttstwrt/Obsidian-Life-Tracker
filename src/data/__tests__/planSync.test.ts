import { describe, expect, test } from "bun:test";
import type { CheckedPlanLine } from "../dailyNote";
import {
	buildAutoEvent,
	buildPlannedTimestamp,
	computeAutoValue,
	matchDefinitionByLabel,
} from "../planSync";
import type { Definition } from "../types";

function habit(
	overrides: Partial<Extract<Definition, { kind: "habit" }>> = {},
): Definition {
	return {
		id: "run",
		displayName: "Run",
		kind: "habit",
		valueType: "boolean",
		targetCadence: "daily",
		status: "active",
		tags: [],
		created: "2026-05-01",
		schemaVersion: 1,
		...overrides,
	} as Definition;
}

function project(
	overrides: Partial<Extract<Definition, { kind: "project" }>> = {},
): Definition {
	return {
		id: "plugin",
		displayName: "Plugin",
		kind: "project",
		status: "active",
		tags: [],
		created: "2026-05-01",
		schemaVersion: 1,
		...overrides,
	} as Definition;
}

function maintenance(
	overrides: Partial<Extract<Definition, { kind: "maintenance" }>> = {},
): Definition {
	return {
		id: "wash",
		displayName: "Wash sheets",
		kind: "maintenance",
		intervalDays: 14,
		warningThresholdDays: 3,
		status: "active",
		tags: [],
		created: "2026-05-01",
		schemaVersion: 1,
		...overrides,
	} as Definition;
}

const checked = (
	startTime: string,
	endTime?: string,
	label = "x",
): CheckedPlanLine => ({
	startTime,
	endTime,
	label,
	raw: "",
});

describe("matchDefinitionByLabel", () => {
	test("exact case-insensitive displayName match", () => {
		const defs = [habit({ displayName: "Run" }), maintenance()];
		expect(matchDefinitionByLabel("run", defs)?.id).toBe("run");
		expect(matchDefinitionByLabel("RUN", defs)?.id).toBe("run");
		expect(matchDefinitionByLabel("Run", defs)?.id).toBe("run");
	});

	test("falls back to id match when displayName differs", () => {
		const defs = [habit({ id: "morning_run", displayName: "Morning Run" })];
		expect(matchDefinitionByLabel("morning_run", defs)?.id).toBe(
			"morning_run",
		);
	});

	test("ignores archived definitions", () => {
		const defs = [habit({ status: "archived", displayName: "Run" })];
		expect(matchDefinitionByLabel("Run", defs)).toBeNull();
	});

	test("returns null when no match", () => {
		expect(matchDefinitionByLabel("Bike", [habit()])).toBeNull();
	});

	test("returns null on empty label", () => {
		expect(matchDefinitionByLabel("   ", [habit()])).toBeNull();
	});
});

describe("buildPlannedTimestamp", () => {
	test("produces an ISO timestamp matching the local clock", () => {
		const ts = buildPlannedTimestamp("2026-05-03", "07:00");
		expect(ts).not.toBeNull();
		const d = new Date(ts!);
		expect(d.getFullYear()).toBe(2026);
		expect(d.getMonth()).toBe(4);
		expect(d.getDate()).toBe(3);
		expect(d.getHours()).toBe(7);
		expect(d.getMinutes()).toBe(0);
	});

	test("rejects malformed inputs", () => {
		expect(buildPlannedTimestamp("2026/05/03", "07:00")).toBeNull();
		expect(buildPlannedTimestamp("2026-05-03", "7:00")).toBeNull();
		expect(buildPlannedTimestamp("2026-13-01", "07:00")).toBeNull();
	});
});

describe("computeAutoValue", () => {
	test("boolean habit → 1", () => {
		expect(computeAutoValue(habit(), checked("07:00", "07:30"))).toBe(1);
	});

	test("duration habit derives minutes from end - start", () => {
		const def = habit({ valueType: "duration" });
		expect(computeAutoValue(def, checked("07:00", "07:45"))).toBe(45);
	});

	test("duration habit falls back to defaultDuration when no end time", () => {
		const def = habit({ valueType: "duration", defaultDuration: 30 });
		expect(computeAutoValue(def, checked("07:00"))).toBe(30);
	});

	test("duration habit yields undefined when no end and no default", () => {
		const def = habit({ valueType: "duration" });
		expect(computeAutoValue(def, checked("07:00"))).toBeUndefined();
	});

	test("maintenance → 1", () => {
		expect(computeAutoValue(maintenance(), checked("09:00"))).toBe(1);
	});

	test("project → 1", () => {
		expect(computeAutoValue(project(), checked("19:00", "20:00"))).toBe(1);
	});
});

describe("buildAutoEvent", () => {
	test("returns timestamp + value for a simple habit", () => {
		const out = buildAutoEvent(habit(), checked("07:00", "07:30"), "2026-05-03");
		expect(out).not.toBeNull();
		expect(new Date(out!.timestamp).getHours()).toBe(7);
		expect(out!.value).toBe(1);
	});

	test("returns null when definition has unfilled required fields", () => {
		const def = habit({
			fieldSchema: [{ key: "mood", type: "string", required: true }],
		});
		expect(buildAutoEvent(def, checked("07:00"), "2026-05-03")).toBeNull();
	});

	test("ignores retired required fields", () => {
		const def = habit({
			fieldSchema: [
				{ key: "mood", type: "string", required: true, retired: true },
			],
		});
		expect(buildAutoEvent(def, checked("07:00"), "2026-05-03")).not.toBeNull();
	});

	test("returns null on invalid date", () => {
		expect(buildAutoEvent(habit(), checked("07:00"), "garbage")).toBeNull();
	});
});
