import { describe, expect, test } from "bun:test";
import { buildPlanLine } from "../planForm";
import type {
	HabitDefinition,
	MaintenanceDefinition,
	ProjectDefinition,
} from "../types";

const RUN: HabitDefinition = {
	id: "running",
	displayName: "Running",
	kind: "habit",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	valueType: "duration",
	unit: "minutes",
	targetCadence: "4/week",
};

const WASH: MaintenanceDefinition = {
	id: "wash",
	displayName: "Wash sheets",
	kind: "maintenance",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	intervalDays: 14,
	warningThresholdDays: 10,
};

const PLUGIN: ProjectDefinition = {
	id: "plugin",
	displayName: "Obsidian Plugin",
	kind: "project",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
};

describe("buildPlanLine — happy paths", () => {
	test("habit with end time", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "13:30",
			endTime: "14:00",
			label: "",
		});
		if (!r.ok) throw new Error(r.error);
		expect(r.line).toBe("- [ ] 13:30 - 14:00 Running #habit");
		expect(r.date).toBe("2026-05-03");
	});

	test("habit without end time", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "13:30",
			endTime: "",
			label: "",
		});
		if (!r.ok) throw new Error(r.error);
		expect(r.line).toBe("- [ ] 13:30 Running #habit");
	});

	test("custom label", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "12:30",
			endTime: "13:00",
			label: "Soup dumplings for lunch",
		});
		if (!r.ok) throw new Error(r.error);
		expect(r.line).toBe("- [ ] 12:30 - 13:00 Soup dumplings for lunch #habit");
	});

	test("maintenance is single-time checkbox", () => {
		const r = buildPlanLine(WASH, {
			date: "2026-05-03",
			startTime: "09:00",
			endTime: "",
			label: "",
		});
		if (!r.ok) throw new Error(r.error);
		expect(r.line).toBe("- [ ] 09:00 Wash sheets #maint");
	});

	test("project gets Project: prefix and #work", () => {
		const r = buildPlanLine(PLUGIN, {
			date: "2026-05-03",
			startTime: "19:00",
			endTime: "20:30",
			label: "wire plan tab",
		});
		if (!r.ok) throw new Error(r.error);
		expect(r.line).toBe("- [ ] 19:00 - 20:30 Project: wire plan tab #work");
	});
});

describe("buildPlanLine — failures", () => {
	test("malformed date", () => {
		const r = buildPlanLine(RUN, {
			date: "May 3",
			startTime: "10:00",
			endTime: "",
			label: "",
		});
		expect(r.ok).toBe(false);
	});

	test("malformed start time", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "9:00",
			endTime: "",
			label: "",
		});
		expect(r.ok).toBe(false);
	});

	test("malformed end time", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "09:00",
			endTime: "9pm",
			label: "",
		});
		expect(r.ok).toBe(false);
	});

	test("end time not after start time", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "10:00",
			endTime: "09:00",
			label: "",
		});
		expect(r.ok).toBe(false);
	});

	test("end equal to start", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "10:00",
			endTime: "10:00",
			label: "",
		});
		expect(r.ok).toBe(false);
	});

	test("newline in label rejected", () => {
		const r = buildPlanLine(RUN, {
			date: "2026-05-03",
			startTime: "10:00",
			endTime: "",
			label: "a\nb",
		});
		expect(r.ok).toBe(false);
	});
});
