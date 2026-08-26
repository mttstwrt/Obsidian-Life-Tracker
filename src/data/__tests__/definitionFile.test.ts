import { describe, expect, test } from "bun:test";
import {
	parseDefinitionFile,
	serializeDefinitionFrontmatter,
} from "../definitionFile";
import type { ScoreDefinition } from "../types";

function fileWith(frontmatter: string, events = ""): string {
	return `---\n${frontmatter}\n---\n\n# Thing\n\n## Events\n\n${events}`;
}

const FULL_SCORE = [
	"id: sleep",
	"displayName: Sleep quality",
	"kind: score",
	"status: active",
	"created: 2026-07-28",
	"schemaVersion: 1",
	"scale: [1, 5]",
	"scaleLabels: [awful, great]",
	"higherIsBetter: false",
	"dayAggregate: max",
	"target: 3",
	"expectedCadence: 2/day",
].join("\n");

function parseScoreDefinition(frontmatter: string): ScoreDefinition {
	const parsed = parseDefinitionFile(fileWith(frontmatter));
	if (!parsed.ok) throw new Error(parsed.error);
	if (parsed.definition.kind !== "score") throw new Error("expected a score");
	return parsed.definition;
}

describe("parseDefinitionFile — score", () => {
	test("reads the full option set", () => {
		const def = parseScoreDefinition(FULL_SCORE);
		expect(def.scale).toEqual([1, 5]);
		expect(def.scaleLabels).toEqual(["awful", "great"]);
		expect(def.higherIsBetter).toBe(false);
		expect(def.dayAggregate).toBe("max");
		expect(def.target).toBe(3);
		expect(def.expectedCadence).toBe("2/day");
	});

	test("a bare score gets the default scale and no other opinions", () => {
		const def = parseScoreDefinition(
			"id: mood\ndisplayName: Mood\nkind: score\ncreated: 2026-08-01",
		);
		expect(def.scale).toEqual([1, 10]);
		expect(def.scaleLabels).toBeUndefined();
		expect(def.higherIsBetter).toBeUndefined();
		expect(def.dayAggregate).toBeUndefined();
		expect(def.target).toBeUndefined();
	});

	// A bad bound must never take the definition — and its whole event history —
	// out of the vault. Every malformed scale degrades to the default instead.
	test.each([
		["missing", ""],
		["wrong length", "scale: [3]"],
		["non-numeric", "scale: [low, high]"],
		["inverted", "scale: [10, 1]"],
		["degenerate", "scale: [5, 5]"],
		["not a list", "scale: 10"],
	])("scale falls back to the default when %s", (_label, scaleLine) => {
		const def = parseScoreDefinition(
			`id: mood\ndisplayName: Mood\nkind: score\ncreated: 2026-08-01\n${scaleLine}`,
		);
		expect(def.scale).toEqual([1, 10]);
	});

	test("an unrecognized dayAggregate is dropped, not fatal", () => {
		const def = parseScoreDefinition(
			"id: mood\ndisplayName: Mood\nkind: score\ncreated: 2026-08-01\ndayAggregate: median",
		);
		expect(def.dayAggregate).toBeUndefined();
	});

	test.each([
		["wrong length", "scaleLabels: [only-one]"],
		["non-string", "scaleLabels: [1, 2]"],
		["both blank", 'scaleLabels: ["", ""]'],
	])("scaleLabels is dropped when %s", (_label, labelLine) => {
		const def = parseScoreDefinition(
			`id: mood\ndisplayName: Mood\nkind: score\ncreated: 2026-08-01\n${labelLine}`,
		);
		expect(def.scaleLabels).toBeUndefined();
	});

	test("the rating rides in value, not a field", () => {
		const parsed = parseDefinitionFile(
			fileWith(
				FULL_SCORE,
				'- 2026-08-01T07:10 | 4 | rough night |  id="01K3"\n',
			),
		);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.events).toHaveLength(1);
		expect(parsed.events[0].value).toBe(4);
		expect(parsed.events[0].note).toBe("rough night");
		expect(parsed.events[0].fields).toEqual({});
	});

	test("frontmatter is stable across a parse/serialize round trip", () => {
		const def = parseScoreDefinition(FULL_SCORE);
		const reparsed = parseDefinitionFile(
			`${serializeDefinitionFrontmatter(def)}\n# Thing\n\n## Events\n\n`,
		);
		if (!reparsed.ok) throw new Error(reparsed.error);
		expect(reparsed.definition).toEqual(def);
		expect(serializeDefinitionFrontmatter(reparsed.definition)).toBe(
			serializeDefinitionFrontmatter(def),
		);
	});
});

describe("parseDefinitionFile — unknown kinds", () => {
	// The flip side of adding a kind: an older build meeting a newer vault must
	// refuse the file cleanly so the data layer can warn and skip it, never
	// rewrite it.
	test("an unrecognized kind is rejected, not coerced", () => {
		const parsed = parseDefinitionFile(
			fileWith("id: x\ndisplayName: X\nkind: telepathy\ncreated: 2026-08-01"),
		);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) throw new Error("expected failure");
		expect(parsed.error).toContain("telepathy");
	});
});
