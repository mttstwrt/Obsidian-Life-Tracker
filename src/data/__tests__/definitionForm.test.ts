import { describe, expect, test } from "bun:test";
import {
	type DefinitionFormInput,
	buildDefinitionFromInput,
	definitionToFormInput,
	emptyFormInput,
	parseTargetCadence,
	slugify,
	uniqueSlug,
} from "../definitionForm";
import type { Definition, MaintenanceDefinition } from "../types";

const FIXED_NOW = new Date("2026-05-01T12:00:00Z");
const opts = (
	overrides: Partial<Parameters<typeof buildDefinitionFromInput>[1]> = {},
) => ({
	existingIds: new Set<string>(),
	now: () => FIXED_NOW,
	...overrides,
});

function habit(
	overrides: Partial<DefinitionFormInput> = {},
): DefinitionFormInput {
	return {
		...emptyFormInput("habit"),
		displayName: "Running",
		valueType: "duration",
		unit: "minutes",
		targetCadence: "4/week",
		...overrides,
	};
}

describe("slugify / uniqueSlug", () => {
	test("slugifies common names", () => {
		expect(slugify("Running")).toBe("running");
		expect(slugify("Wash sheets")).toBe("wash-sheets");
		expect(slugify("  Books — 2026!! ")).toBe("books-2026");
		expect(slugify("Days w/o doomscrolling")).toBe("days-w-o-doomscrolling");
	});
	test("falls back to 'definition' on empty", () => {
		expect(uniqueSlug(slugify("!!!"), new Set())).toBe("definition");
	});
	test("appends -2, -3 on collision", () => {
		const ids = new Set(["running", "running-2"]);
		expect(uniqueSlug("running", ids)).toBe("running-3");
	});
});

describe("parseTargetCadence", () => {
	test("parses simple forms", () => {
		expect(parseTargetCadence("4/week")).toEqual({ count: 4, period: "week" });
		expect(parseTargetCadence("1/day")).toEqual({ count: 1, period: "day" });
		expect(parseTargetCadence("2 / month")).toEqual({
			count: 2,
			period: "month",
		});
	});
	test("rejects garbage", () => {
		expect(parseTargetCadence("daily")).toBeNull();
		expect(parseTargetCadence("0/week")).toBeNull();
		expect(parseTargetCadence("4/year")).toBeNull();
		expect(parseTargetCadence("")).toBeNull();
	});
});

describe("buildDefinitionFromInput — happy paths per kind", () => {
	test("habit", () => {
		const r = buildDefinitionFromInput(habit(), opts());
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.id).toBe("running");
		expect(r.definition.kind).toBe("habit");
		expect(r.definition.created).toBe("2026-05-01");
		if (r.definition.kind !== "habit") throw new Error("kind");
		expect(r.definition.targetCadence).toBe("4/week");
		expect(r.definition.unit).toBe("minutes");
	});

	test("maintenance", () => {
		const r = buildDefinitionFromInput(
			{
				...emptyFormInput("maintenance"),
				displayName: "Wash sheets",
				intervalDays: "14",
				warningThresholdDays: "10",
			},
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "maintenance") throw new Error("kind");
		expect(r.definition.intervalDays).toBe(14);
		expect(r.definition.warningThresholdDays).toBe(10);
	});

	test("reverse-habit with milestones and required note", () => {
		const r = buildDefinitionFromInput(
			{
				...emptyFormInput("reverse-habit"),
				displayName: "Days w/o doomscrolling",
				noteRequired: true,
				milestonesCsv: "1, 7, 30",
			},
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "reverse-habit") throw new Error("kind");
		expect(r.definition.noteRequired).toBe(true);
		expect(r.definition.milestones).toEqual([1, 7, 30]);
	});

	test("project", () => {
		const r = buildDefinitionFromInput(
			{
				...emptyFormInput("project"),
				displayName: "Obsidian plugin",
				dormantAfterDays: "30",
			},
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "project") throw new Error("kind");
		expect(r.definition.dormantAfterDays).toBe(30);
	});

	test("counter", () => {
		const r = buildDefinitionFromInput(
			{
				...emptyFormInput("counter"),
				displayName: "Books 2026",
				unit: "books",
				goal: "24",
				resetCadence: "yearly",
			},
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "counter") throw new Error("kind");
		expect(r.definition.unit).toBe("books");
		expect(r.definition.goal).toBe(24);
		expect(r.definition.resetCadence).toBe("yearly");
	});
});

describe("buildDefinitionFromInput — id generation and collisions", () => {
	test("auto-slugs from displayName", () => {
		const r = buildDefinitionFromInput(
			habit({ displayName: "Wash sheets" }),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.id).toBe("wash-sheets");
	});

	test("appends collision suffix", () => {
		const r = buildDefinitionFromInput(
			habit({ displayName: "Running" }),
			opts({ existingIds: new Set(["running"]) }),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.id).toBe("running-2");
	});

	test("falls back to 'definition' for unsluggable name", () => {
		const r = buildDefinitionFromInput(
			habit({ displayName: "!!!" }),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.id).toBe("definition");
	});
});

describe("buildDefinitionFromInput — validation", () => {
	test("missing displayName fails", () => {
		const r = buildDefinitionFromInput(habit({ displayName: "  " }), opts());
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("displayName");
	});

	test("habit missing/garbage targetCadence fails", () => {
		expect(
			buildDefinitionFromInput(habit({ targetCadence: "" }), opts()).ok,
		).toBe(false);
		expect(
			buildDefinitionFromInput(habit({ targetCadence: "daily" }), opts()).ok,
		).toBe(false);
	});

	test("maintenance non-positive intervalDays fails", () => {
		const r = buildDefinitionFromInput(
			{
				...emptyFormInput("maintenance"),
				displayName: "x",
				intervalDays: "0",
			},
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("intervalDays");
	});

	test("field key must match snake_case regex", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [{ key: "Bad-Key", type: "string" }],
			}),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("fieldSchema.0.key");
	});

	test("reserved 'id' key rejected", () => {
		const r = buildDefinitionFromInput(
			habit({ fieldSchema: [{ key: "id", type: "string" }] }),
			opts(),
		);
		expect(r.ok).toBe(false);
	});

	test("duplicate field keys rejected", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [
					{ key: "route", type: "string" },
					{ key: "route", type: "string" },
				],
			}),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toMatch(/Duplicate/i);
	});

	test("enum requires non-empty options", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [{ key: "mood", type: "enum", optionsCsv: "" }],
			}),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("fieldSchema.0.options");
	});

	test("list requires itemType", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [{ key: "tags", type: "list", itemType: "" }],
			}),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("fieldSchema.0.itemType");
	});

	test("range min must be ≤ max", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [
					{
						key: "quality",
						type: "number",
						rangeMin: "5",
						rangeMax: "1",
					},
				],
			}),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.field).toBe("fieldSchema.0.range");
	});

	test("range requires both bounds when one is provided", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [
					{ key: "quality", type: "number", rangeMin: "1", rangeMax: "" },
				],
			}),
			opts(),
		);
		expect(r.ok).toBe(false);
	});
});

describe("buildDefinitionFromInput — fieldSchema happy paths", () => {
	test("number with range", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [
					{
						key: "quality",
						type: "number",
						rangeMin: "1",
						rangeMax: "5",
						prompt: "How did it feel?",
					},
				],
			}),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		const f = r.definition.fieldSchema?.[0];
		expect(f?.range).toEqual([1, 5]);
		expect(f?.prompt).toBe("How did it feel?");
	});

	test("enum and list", () => {
		const r = buildDefinitionFromInput(
			habit({
				fieldSchema: [
					{ key: "mood", type: "enum", optionsCsv: "good, ok, bad" },
					{ key: "tags", type: "list", itemType: "string" },
				],
			}),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.fieldSchema?.[0].options).toEqual([
			"good",
			"ok",
			"bad",
		]);
		expect(r.definition.fieldSchema?.[1].itemType).toBe("string");
	});
});

describe("edit mode", () => {
	const existing: MaintenanceDefinition = {
		id: "wash",
		displayName: "Wash sheets",
		kind: "maintenance",
		status: "archived",
		tags: [],
		created: "2026-01-01",
		schemaVersion: 1,
		intervalDays: 14,
		warningThresholdDays: 10,
		fieldSchema: [
			{ key: "quality", type: "number", range: [1, 5] },
			{ key: "old_field", type: "string" },
		],
	};

	test("preserves id, created, schemaVersion, status", () => {
		const r = buildDefinitionFromInput(
			{
				...definitionToFormInput(existing),
				displayName: "Wash bedding",
			},
			opts({ existing }),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.id).toBe("wash");
		expect(r.definition.created).toBe("2026-01-01");
		expect(r.definition.status).toBe("archived");
	});

	test("retiring keeps the field; warning is empty", () => {
		const formIn = definitionToFormInput(existing);
		formIn.fieldSchema[1].retired = true;
		const r = buildDefinitionFromInput(formIn, opts({ existing }));
		if (!r.ok) throw new Error(r.error);
		expect(r.warnings).toEqual([]);
		expect(r.definition.fieldSchema?.[1].retired).toBe(true);
	});

	test("removing a field surfaces a warning", () => {
		const formIn = definitionToFormInput(existing);
		formIn.fieldSchema = formIn.fieldSchema.filter(
			(f) => f.key !== "old_field",
		);
		const r = buildDefinitionFromInput(formIn, opts({ existing }));
		if (!r.ok) throw new Error(r.error);
		expect(r.warnings.length).toBe(1);
		expect(r.warnings[0]).toMatch(/old_field/);
	});

	test("changing kind rejected", () => {
		const formIn: DefinitionFormInput = {
			...definitionToFormInput(existing),
			kind: "habit",
			valueType: "count",
			targetCadence: "4/week",
		};
		const r = buildDefinitionFromInput(formIn, opts({ existing }));
		expect(r.ok).toBe(false);
	});
});

describe("definitionToFormInput round-trips", () => {
	test("habit fields preserved", () => {
		const def: Definition = {
			id: "running",
			displayName: "Running",
			emoji: "🏃",
			kind: "habit",
			status: "active",
			tags: ["exercise"],
			created: "2026-01-01",
			schemaVersion: 1,
			valueType: "duration",
			unit: "minutes",
			targetCadence: "4/week",
			fieldSchema: [{ key: "quality", type: "number", range: [1, 5] }],
		};
		const input = definitionToFormInput(def);
		const r = buildDefinitionFromInput(input, opts({ existing: def }));
		if (!r.ok) throw new Error(r.error);
		expect(r.definition).toEqual(def);
	});

	test("defaultDuration round-trips", () => {
		const def: Definition = {
			id: "japanese",
			displayName: "Japanese",
			kind: "habit",
			status: "active",
			tags: [],
			created: "2026-01-01",
			schemaVersion: 1,
			valueType: "duration",
			unit: "minutes",
			targetCadence: "1/day",
			defaultDuration: 30,
		};
		const input = definitionToFormInput(def);
		expect(input.defaultDurationMinutes).toBe("30");
		const r = buildDefinitionFromInput(input, opts({ existing: def }));
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.defaultDuration).toBe(30);
	});
});

describe("buildDefinitionFromInput — defaultDuration validation", () => {
	test("blank → undefined", () => {
		const r = buildDefinitionFromInput(habit(), opts());
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.defaultDuration).toBeUndefined();
	});

	test("positive integer accepted", () => {
		const r = buildDefinitionFromInput(
			habit({ defaultDurationMinutes: "90" }),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		expect(r.definition.defaultDuration).toBe(90);
	});

	test("zero rejected", () => {
		const r = buildDefinitionFromInput(
			habit({ defaultDurationMinutes: "0" }),
			opts(),
		);
		expect(r.ok).toBe(false);
	});

	test("negative rejected", () => {
		const r = buildDefinitionFromInput(
			habit({ defaultDurationMinutes: "-15" }),
			opts(),
		);
		expect(r.ok).toBe(false);
	});

	test("non-integer rejected", () => {
		const r = buildDefinitionFromInput(
			habit({ defaultDurationMinutes: "30.5" }),
			opts(),
		);
		expect(r.ok).toBe(false);
	});

	test("garbage rejected", () => {
		const r = buildDefinitionFromInput(
			habit({ defaultDurationMinutes: "thirty" }),
			opts(),
		);
		expect(r.ok).toBe(false);
	});
});

function score(
	overrides: Partial<DefinitionFormInput> = {},
): DefinitionFormInput {
	return {
		...emptyFormInput("score"),
		displayName: "Sleep quality",
		...overrides,
	};
}

describe("buildDefinitionFromInput — score", () => {
	test("defaults to a 1-10 scale with nothing else set", () => {
		const r = buildDefinitionFromInput(score(), opts());
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "score") throw new Error("kind");
		expect(r.definition.scale).toEqual([1, 10]);
		// The quiet defaults stay out of frontmatter entirely.
		expect(r.definition.higherIsBetter).toBeUndefined();
		expect(r.definition.dayAggregate).toBeUndefined();
		expect(r.definition.target).toBeUndefined();
		expect(r.definition.scaleLabels).toBeUndefined();
		expect(r.definition.expectedCadence).toBeUndefined();
	});

	test("blank bounds fall back to the default scale", () => {
		const r = buildDefinitionFromInput(
			score({ scaleMin: "", scaleMax: "" }),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "score") throw new Error("kind");
		expect(r.definition.scale).toEqual([1, 10]);
	});

	test("accepts an adjusted scale", () => {
		const r = buildDefinitionFromInput(
			score({ scaleMin: "1", scaleMax: "5" }),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "score") throw new Error("kind");
		expect(r.definition.scale).toEqual([1, 5]);
	});

	test("carries the full option set through", () => {
		const r = buildDefinitionFromInput(
			score({
				displayName: "Stress level",
				scaleMin: "1",
				scaleMax: "5",
				scaleLabelLow: "calm",
				scaleLabelHigh: "frazzled",
				higherIsBetter: false,
				dayAggregate: "max",
				target: "3",
				expectedCadence: "2/day",
			}),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "score") throw new Error("kind");
		expect(r.definition.scale).toEqual([1, 5]);
		expect(r.definition.scaleLabels).toEqual(["calm", "frazzled"]);
		expect(r.definition.higherIsBetter).toBe(false);
		expect(r.definition.dayAggregate).toBe("max");
		expect(r.definition.target).toBe(3);
		expect(r.definition.expectedCadence).toBe("2/day");
	});

	test("only one label still persists the pair", () => {
		const r = buildDefinitionFromInput(
			score({ scaleLabelLow: "awful", scaleLabelHigh: "" }),
			opts(),
		);
		if (!r.ok) throw new Error(r.error);
		if (r.definition.kind !== "score") throw new Error("kind");
		expect(r.definition.scaleLabels).toEqual(["awful", ""]);
	});

	test("rejects a half-specified scale", () => {
		expect(buildDefinitionFromInput(score({ scaleMax: "" }), opts()).ok).toBe(
			false,
		);
		expect(buildDefinitionFromInput(score({ scaleMin: "" }), opts()).ok).toBe(
			false,
		);
	});

	test("rejects non-integer bounds", () => {
		const r = buildDefinitionFromInput(
			score({ scaleMin: "1", scaleMax: "7.5" }),
			opts(),
		);
		expect(r.ok).toBe(false);
	});

	test("rejects an inverted or degenerate scale", () => {
		expect(
			buildDefinitionFromInput(score({ scaleMin: "10", scaleMax: "1" }), opts())
				.ok,
		).toBe(false);
		expect(
			buildDefinitionFromInput(score({ scaleMin: "5", scaleMax: "5" }), opts())
				.ok,
		).toBe(false);
	});

	test("rejects a target outside the scale", () => {
		const r = buildDefinitionFromInput(
			score({ scaleMin: "1", scaleMax: "5", target: "9" }),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) throw new Error("expected failure");
		expect(r.field).toBe("target");
	});

	test("rejects a malformed expected cadence", () => {
		const r = buildDefinitionFromInput(
			score({ expectedCadence: "every morning" }),
			opts(),
		);
		expect(r.ok).toBe(false);
		if (r.ok) throw new Error("expected failure");
		expect(r.field).toBe("expectedCadence");
	});

	test("round-trips through definitionToFormInput", () => {
		const built = buildDefinitionFromInput(
			score({
				scaleMin: "0",
				scaleMax: "4",
				scaleLabelLow: "none",
				scaleLabelHigh: "severe",
				higherIsBetter: false,
				dayAggregate: "last",
				target: "1",
				expectedCadence: "1/day",
			}),
			opts(),
		);
		if (!built.ok) throw new Error(built.error);

		const back = buildDefinitionFromInput(
			definitionToFormInput(built.definition),
			opts({ existing: built.definition }),
		);
		if (!back.ok) throw new Error(back.error);
		expect(back.definition).toEqual(built.definition);
	});

	test("a default-everything score round-trips too", () => {
		const built = buildDefinitionFromInput(score(), opts());
		if (!built.ok) throw new Error(built.error);
		const back = buildDefinitionFromInput(
			definitionToFormInput(built.definition),
			opts({ existing: built.definition }),
		);
		if (!back.ok) throw new Error(back.error);
		expect(back.definition).toEqual(built.definition);
	});
});
