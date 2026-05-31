import { describe, expect, test } from "bun:test";
import { parseEventLine, serializeEventLine } from "../eventLine";
import type { Event, FieldDef } from "../types";

const SCHEMA: FieldDef[] = [
	{ key: "quality", type: "number", range: [1, 5] },
	{ key: "route", type: "string" },
	{ key: "hr_avg", type: "number" },
];

describe("parseEventLine", () => {
	test("parses a minimal line with empty value, note, and fields", () => {
		const r = parseEventLine("- 2026-04-24T07:30 |  |  |");
		if (!r.ok) throw new Error(r.error);
		expect(r.event.timestamp).toBe("2026-04-24T07:30");
		expect(r.event.value).toBeUndefined();
		expect(r.event.note).toBeUndefined();
		expect(r.event.fields).toEqual({});
	});

	test("parses a populated line", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:14 | 32 | morning loop, felt good | id="01HW000" quality="4" route="park-loop" hr_avg="148"',
			SCHEMA,
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.timestamp).toBe("2026-04-28T07:14");
		expect(r.event.value).toBe(32);
		expect(r.event.note).toBe("morning loop, felt good");
		expect(r.event.id).toBe("01HW000");
		expect(r.event.fields.quality.coerced).toBe(4);
		expect(r.event.fields.route.coerced).toBe("park-loop");
		expect(r.event.fields.hr_avg.coerced).toBe(148);
	});

	test("extracts source as a top-level field, not a generic field", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:00:00.000Z |  |  | id="x" source="daily:2026-04-28T07:00"',
			SCHEMA,
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.source).toBe("daily:2026-04-28T07:00");
		expect(r.event.fields.source).toBeUndefined();
	});

	test("preserves unknown keys verbatim as strings", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:14 |  |  | id="x" weather="rainy"',
			SCHEMA,
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.fields.weather).toEqual({
			raw: "rainy",
			coerced: "rainy",
		});
	});

	test("duplicate keys: last-wins, emits warning", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:14 |  |  | id="x" quality="3" quality="5"',
			SCHEMA,
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.fields.quality.coerced).toBe(5);
		expect(
			r.warnings.some((w) => w.includes("duplicate")),
		).toBe(true);
	});

	test("empty value (key=\"\") is meaningful and kept distinct from absent", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:14 |  |  | id="x" quality=""',
			SCHEMA,
		);
		if (!r.ok) throw new Error(r.error);
		expect("quality" in r.event.fields).toBe(true);
		expect(r.event.fields.quality.raw).toBe("");
		const r2 = parseEventLine(
			'- 2026-04-28T07:14 |  |  | id="x"',
			SCHEMA,
		);
		if (!r2.ok) throw new Error(r2.error);
		expect("quality" in r2.event.fields).toBe(false);
	});

	test("rejects lines without four pipe-segments", () => {
		const r = parseEventLine("- 2026-04-28T07:14 | 32 | only-three");
		expect(r.ok).toBe(false);
	});

	test("rejects unquoted field values", () => {
		const r = parseEventLine(
			"- 2026-04-28T07:14 |  |  | quality=4",
			SCHEMA,
		);
		expect(r.ok).toBe(false);
	});

	test("rejects spaces around =", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:14 |  |  | quality = "4"',
			SCHEMA,
		);
		expect(r.ok).toBe(false);
	});

	test("range violation surfaces rangeWarning, value coerces", () => {
		const r = parseEventLine(
			'- 2026-04-28T07:14 |  |  | id="x" quality="9"',
			SCHEMA,
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.event.fields.quality.coerced).toBe(9);
		expect(r.event.fields.quality.rangeWarning).toBeDefined();
	});
});

describe("serializeEventLine", () => {
	test("emits fields in fieldSchema order then unknowns alphabetically", () => {
		const event: Event = {
			id: "01HW",
			timestamp: "2026-04-28T07:14",
			value: 32,
			note: "loop",
			fields: {
				weather: { raw: "rainy", coerced: "rainy" },
				route: { raw: "park-loop", coerced: "park-loop" },
				quality: { raw: "4", coerced: 4 },
				abc: { raw: "1", coerced: "1" },
			},
		};
		const line = serializeEventLine(event, SCHEMA);
		expect(line).toBe(
			'- 2026-04-28T07:14 | 32 | loop | id="01HW" quality="4" route="park-loop" abc="1" weather="rainy"',
		);
	});

	test("emits source after id, before schema fields", () => {
		const event: Event = {
			id: "01HW",
			timestamp: "2026-04-28T07:14",
			source: "daily:2026-04-28T07:14",
			fields: {
				quality: { raw: "4", coerced: 4 },
			},
		};
		const line = serializeEventLine(event, SCHEMA);
		expect(line).toBe(
			'- 2026-04-28T07:14 |  |  | id="01HW" source="daily:2026-04-28T07:14" quality="4"',
		);
	});

	test("empty field block leaves no trailing space", () => {
		const event: Event = {
			id: "",
			timestamp: "2026-04-24T07:30",
			value: 28,
			note: "short",
			fields: {},
		};
		expect(serializeEventLine(event)).toBe(
			"- 2026-04-24T07:30 | 28 | short |",
		);
	});

	test("rejects forbidden characters in values", () => {
		const event: Event = {
			id: "01HW",
			timestamp: "2026-04-28T07:14",
			fields: { x: { raw: 'he said "hi"' } },
		};
		expect(() => serializeEventLine(event)).toThrow();
	});

	test("rejects pipe in note", () => {
		const event: Event = {
			id: "01HW",
			timestamp: "2026-04-28T07:14",
			note: "a|b",
			fields: {},
		};
		expect(() => serializeEventLine(event)).toThrow();
	});
});

describe("round-trip determinism", () => {
	const cases: { line: string; schema?: FieldDef[] }[] = [
		{
			line:
				'- 2026-04-28T07:14 | 32 | morning loop | id="01HW000" quality="4" route="park-loop" hr_avg="148"',
			schema: SCHEMA,
		},
		{
			line: '- 2026-04-28T07:14 |  |  | id="01HW001" mood="tired"',
		},
		{
			line:
				'- 2026-04-15T12:00 | 25 |  | id="01HW002" tags="cardio,outdoor,morning"',
		},
		{
			line: "- 2026-04-24T07:30 | 28 | short |",
		},
		{
			line:
				'- 2026-04-28T07:00:00.000Z | 1 |  | id="01HW003" source="daily:2026-04-28T07:00"',
		},
	];

	for (const { line, schema } of cases) {
		test(`stable: ${line.slice(0, 60)}…`, () => {
			const r1 = parseEventLine(line, schema);
			if (!r1.ok) throw new Error(r1.error);
			const reSerialized = serializeEventLine(r1.event, schema);
			expect(reSerialized).toBe(line);

			const r2 = parseEventLine(reSerialized, schema);
			if (!r2.ok) throw new Error(r2.error);
			const reReSerialized = serializeEventLine(r2.event, schema);
			expect(reReSerialized).toBe(reSerialized);
		});
	}

	test("schema reordering produces canonical form on rewrite", () => {
		// Source has unknowns first; canonical order is schema then unknowns alpha.
		const messy =
			'- 2026-04-28T07:14 |  |  | weather="rainy" id="x" quality="4"';
		const r = parseEventLine(messy, SCHEMA);
		if (!r.ok) throw new Error(r.error);
		const line = serializeEventLine(r.event, SCHEMA);
		expect(line).toBe(
			'- 2026-04-28T07:14 |  |  | id="x" quality="4" weather="rainy"',
		);
	});
});
