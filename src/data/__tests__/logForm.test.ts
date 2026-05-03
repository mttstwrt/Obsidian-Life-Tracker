import { describe, expect, test } from "bun:test";
import { buildLogEvent, valueExpected } from "../logForm";
import type {
	CounterDefinition,
	Definition,
	HabitDefinition,
	MaintenanceDefinition,
	ReverseHabitDefinition,
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
	fieldSchema: [
		{ key: "quality", type: "number", range: [1, 5], prompt: "Quality" },
		{ key: "route", type: "string", required: true, prompt: "Route" },
		{ key: "old", type: "string", retired: true },
	],
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

const DOOM: ReverseHabitDefinition = {
	id: "doom",
	displayName: "Days w/o doomscrolling",
	kind: "reverse-habit",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	noteRequired: true,
};

const COUNTER: CounterDefinition = {
	id: "books",
	displayName: "Books",
	kind: "counter",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
};

function baseInput(overrides: Partial<Parameters<typeof buildLogEvent>[1]> = {}) {
	return {
		date: "2026-04-30",
		time: "08:00",
		initialDate: "2026-04-30",
		initialTime: "08:00",
		valueRaw: "30",
		note: "",
		fieldRaws: { route: "park" },
		...overrides,
	};
}

describe("valueExpected", () => {
	test("habit/duration expects a number", () => {
		expect(valueExpected(RUN)).toBe("number");
	});
	test("habit/boolean expects a boolean", () => {
		const def: Definition = { ...RUN, valueType: "boolean" };
		expect(valueExpected(def)).toBe("boolean");
	});
	test("maintenance and reverse-habit expect boolean", () => {
		expect(valueExpected(WASH)).toBe("boolean");
		expect(valueExpected(DOOM)).toBe("boolean");
	});
	test("counter expects a number", () => {
		expect(valueExpected(COUNTER)).toBe("number");
	});
});

describe("buildLogEvent — happy paths", () => {
	test("habit numeric event with required field passes", () => {
		const r = buildLogEvent(RUN, baseInput());
		if (!r.ok) throw new Error(r.error);
		expect(r.event.value).toBe(30);
		expect(r.event.timestamp).toBe("2026-04-30T08:00");
		expect(r.event.fields.route.coerced).toBe("park");
		expect(r.retroactive).toBe(false);
	});

	test("maintenance event treats value as boolean=1", () => {
		const r = buildLogEvent(
			WASH,
			baseInput({ valueRaw: "", fieldRaws: {} }),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.value).toBe(1);
	});

	test("retroactive entry writes entered_at", () => {
		const fixedNow = new Date("2026-04-30T10:00:00Z");
		const r = buildLogEvent(
			RUN,
			baseInput({
				date: "2026-04-29",
				time: "07:00",
				now: () => fixedNow,
			}),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.retroactive).toBe(true);
		expect(r.event.fields.entered_at.coerced).toBe(fixedNow.toISOString());
	});

	test("retired field is ignored even if value provided", () => {
		const r = buildLogEvent(
			RUN,
			baseInput({ fieldRaws: { route: "park", old: "should-not-write" } }),
		);
		if (!r.ok) throw new Error(r.error);
		expect("old" in r.event.fields).toBe(false);
	});
});

describe("buildLogEvent — failures", () => {
	test("missing required field rejects", () => {
		const r = buildLogEvent(RUN, baseInput({ fieldRaws: {} }));
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("route");
	});

	test("non-numeric value rejects", () => {
		const r = buildLogEvent(RUN, baseInput({ valueRaw: "abc" }));
		expect(r.ok).toBe(false);
	});

	test("empty value is accepted and yields undefined", () => {
		const r = buildLogEvent(RUN, baseInput({ valueRaw: "" }));
		if (!r.ok) throw new Error(r.error);
		expect(r.event.value).toBeUndefined();
	});

	test("forbidden chars in note rejected", () => {
		expect(buildLogEvent(RUN, baseInput({ note: 'he said "hi"' })).ok).toBe(
			false,
		);
		expect(buildLogEvent(RUN, baseInput({ note: "a|b" })).ok).toBe(false);
		expect(buildLogEvent(RUN, baseInput({ note: "line\nbreak" })).ok).toBe(
			false,
		);
	});

	test("forbidden chars in field value rejected", () => {
		const r = buildLogEvent(
			RUN,
			baseInput({ fieldRaws: { route: 'a"b' } }),
		);
		expect(r.ok).toBe(false);
	});

	test("reverse-habit with noteRequired and empty note rejected", () => {
		const r = buildLogEvent(
			DOOM,
			baseInput({ valueRaw: "", note: "", fieldRaws: {} }),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toMatch(/Note is required/i);
	});

	test("malformed date or time rejected", () => {
		expect(buildLogEvent(RUN, baseInput({ date: "2026/04/30" })).ok).toBe(
			false,
		);
		expect(buildLogEvent(RUN, baseInput({ time: "8:00" })).ok).toBe(false);
	});
});

describe("buildLogEvent — out-of-range and unknown coercion", () => {
	test("number outside range still passes (rangeWarning surfaced on FieldValue)", () => {
		const r = buildLogEvent(
			RUN,
			baseInput({ fieldRaws: { route: "park", quality: "9" } }),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.fields.quality.coerced).toBe(9);
		expect(r.event.fields.quality.rangeWarning).toBeDefined();
	});
});
