import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { parseDefinitionFile } from "../definitionFile";
import { serializeEventLine, parseEventLine } from "../eventLine";

const FIXTURES_DIR = join(
	import.meta.dir,
	"..",
	"..",
	"..",
	"test-vault",
	"LifeTracker",
	"definitions",
);

describe("seeded example data", () => {
	const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".md"));

	test("example definitions cover every kind", () => {
		const kinds = new Set<string>();
		for (const file of files) {
			const content = readFileSync(join(FIXTURES_DIR, file), "utf8");
			const parsed = parseDefinitionFile(content);
			if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
			kinds.add(parsed.definition.kind);
		}
		expect([...kinds].sort()).toEqual([
			"counter",
			"habit",
			"maintenance",
			"project",
			"reverse-habit",
		]);
	});

	for (const file of files) {
		test(`${file}: parses`, () => {
			const content = readFileSync(join(FIXTURES_DIR, file), "utf8");
			const parsed = parseDefinitionFile(content);
			if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);
			expect(parsed.definition.id).toBeTruthy();
			expect(parsed.events.length).toBeGreaterThan(0);
		});

		test(`${file}: every well-formed event line round-trips`, () => {
			const content = readFileSync(join(FIXTURES_DIR, file), "utf8");
			const parsed = parseDefinitionFile(content);
			if (!parsed.ok) throw new Error(`${file}: ${parsed.error}`);

			for (const event of parsed.events) {
				if (!event.id) continue; // manually-edited line lacking id is intentional
				const line = serializeEventLine(event, parsed.definition.fieldSchema);
				const reParsed = parseEventLine(line, parsed.definition.fieldSchema);
				if (!reParsed.ok) {
					throw new Error(`${file}: re-parse failed: ${reParsed.error}`);
				}
				const reLine = serializeEventLine(
					reParsed.event,
					parsed.definition.fieldSchema,
				);
				expect(reLine).toBe(line);
			}
		});
	}

	test("running.md surfaces a range warning on quality=9", () => {
		const content = readFileSync(join(FIXTURES_DIR, "running.md"), "utf8");
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		const offending = parsed.events.find(
			(e) => e.fields.quality?.coerced === 9,
		);
		expect(offending?.fields.quality.rangeWarning).toBeDefined();
	});

	test("running.md preserves unknown 'weather' field as raw string", () => {
		const content = readFileSync(join(FIXTURES_DIR, "running.md"), "utf8");
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		const event = parsed.events.find((e) => "weather" in e.fields);
		expect(event?.fields.weather.raw).toBe("rainy");
		expect(event?.fields.weather.coerced).toBe("rainy");
	});

	test("books-2026.md treats empty rating='' as present-but-empty", () => {
		const content = readFileSync(join(FIXTURES_DIR, "books-2026.md"), "utf8");
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		const aPatternLanguage = parsed.events.find((e) =>
			e.fields.title?.raw.includes("Pattern Language"),
		);
		expect(aPatternLanguage).toBeDefined();
		expect("rating" in aPatternLanguage!.fields).toBe(true);
		expect(aPatternLanguage!.fields.rating.raw).toBe("");
	});

	test("wash-sheets.md flags detergent='bleach' as not in enum options", () => {
		const content = readFileSync(
			join(FIXTURES_DIR, "wash-sheets.md"),
			"utf8",
		);
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		const event = parsed.events.find(
			(e) => e.fields.detergent?.raw === "bleach",
		);
		expect(event?.fields.detergent.rangeWarning).toBeDefined();
	});

	test("obsidian-plugin.md preserves retired 'tags' field on old events", () => {
		const content = readFileSync(
			join(FIXTURES_DIR, "obsidian-plugin.md"),
			"utf8",
		);
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		const tagsField = parsed.definition.fieldSchema?.find(
			(f) => f.key === "tags",
		);
		expect(tagsField?.retired).toBe(true);
		const eventsWithTags = parsed.events.filter((e) => "tags" in e.fields);
		expect(eventsWithTags.length).toBeGreaterThan(0);
		for (const e of eventsWithTags) {
			expect(Array.isArray(e.fields.tags.coerced)).toBe(true);
		}
	});
});
