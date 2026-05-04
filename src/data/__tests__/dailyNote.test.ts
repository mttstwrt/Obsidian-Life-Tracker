import { describe, expect, test } from "bun:test";
import {
	dailyNotePath,
	extractPlanLabel,
	findOpenSlot,
	formatPlanLine,
	insertUnderHeading,
	markPlanLineCheckedForLabel,
	parseCheckedPlanLines,
	parseDailyNotePath,
	parsePlannedBlocks,
} from "../dailyNote";

describe("formatPlanLine", () => {
	test("habit with end time", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Pull-ups",
				startTime: "13:30",
				endTime: "14:00",
			}),
		).toBe("- [ ] 13:30 - 14:00 Pull-ups #habit");
	});

	test("habit without end time", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Pull-ups",
				startTime: "13:30",
			}),
		).toBe("- [ ] 13:30 Pull-ups #habit");
	});

	test("reverse-habit reuses #habit tag", () => {
		expect(
			formatPlanLine({
				kind: "reverse-habit",
				displayName: "Days w/o doomscrolling",
				startTime: "10:00",
				endTime: "10:30",
			}),
		).toBe("- [ ] 10:00 - 10:30 Days w/o doomscrolling #habit");
	});

	test("maintenance is a checkbox with single time", () => {
		expect(
			formatPlanLine({
				kind: "maintenance",
				displayName: "Wash sheets",
				startTime: "09:00",
				endTime: "10:00",
			}),
		).toBe("- [ ] 09:00 Wash sheets #maint");
	});

	test("project gets Project: prefix and #work tag", () => {
		expect(
			formatPlanLine({
				kind: "project",
				displayName: "Obsidian Plugin",
				label: "wire plan tab",
				startTime: "19:00",
				endTime: "20:30",
			}),
		).toBe("- [ ] 19:00 - 20:30 Project: wire plan tab #work");
	});

	test("custom label overrides displayName", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Lunch",
				label: "Soup dumplings for lunch",
				startTime: "12:30",
				endTime: "13:00",
			}),
		).toBe("- [ ] 12:30 - 13:00 Soup dumplings for lunch #habit");
	});

	test("blank label falls back to displayName", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Run",
				label: "   ",
				startTime: "07:00",
			}),
		).toBe("- [ ] 07:00 Run #habit");
	});

	test("definition tags are appended after the kind tag", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Running",
				startTime: "07:00",
				endTime: "07:30",
				tags: ["exercise", "cardio"],
			}),
		).toBe("- [ ] 07:00 - 07:30 Running #habit #exercise #cardio");
	});

	test("tags work for maintenance single-time format", () => {
		expect(
			formatPlanLine({
				kind: "maintenance",
				displayName: "Wash sheets",
				startTime: "09:00",
				tags: ["chore"],
			}),
		).toBe("- [ ] 09:00 Wash sheets #maint #chore");
	});

	test("tags are sanitized: lowercased, spaces→hyphens, leading # stripped, junk removed", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Run",
				startTime: "07:00",
				tags: ["#Cardio", "Outdoor Running", "high!intensity", "  "],
			}),
		).toBe(
			"- [ ] 07:00 Run #habit #cardio #outdoor-running #highintensity",
		);
	});

	test("a tag matching the kind tag is not duplicated", () => {
		expect(
			formatPlanLine({
				kind: "habit",
				displayName: "Run",
				startTime: "07:00",
				tags: ["habit", "cardio"],
			}),
		).toBe("- [ ] 07:00 Run #habit #cardio");
	});
});

describe("insertUnderHeading", () => {
	test("creates the heading section if missing", () => {
		const out = insertUnderHeading(
			"# Daily note\n\nfoo bar\n",
			"Schedule",
			"- [ ] 12:30 - 13:00 Lunch #habit",
		);
		expect(out).toContain("## Schedule\n\n- [ ] 12:30 - 13:00 Lunch #habit\n");
		expect(out.startsWith("# Daily note\n\nfoo bar\n")).toBe(true);
	});

	test("appends under existing empty heading", () => {
		const input = "# Day\n\n## Schedule\n\n";
		const out = insertUnderHeading(input, "Schedule", "- [ ] 07:00 Run #habit");
		expect(out).toBe("# Day\n\n## Schedule\n\n- [ ] 07:00 Run #habit\n");
	});

	test("appends below existing entries in heading section", () => {
		const input =
			"# Day\n\n## Schedule\n\n- [ ] 07:00 Run #habit\n\n## Notes\n\nfoo\n";
		const out = insertUnderHeading(input, "Schedule", "- [ ] 12:30 - 13:00 Lunch #habit");
		expect(out).toBe(
			"# Day\n\n## Schedule\n\n- [ ] 07:00 Run #habit\n\n- [ ] 12:30 - 13:00 Lunch #habit\n\n## Notes\n\nfoo\n",
		);
	});

	test("appends section to empty file", () => {
		const out = insertUnderHeading("", "Schedule", "- [ ] 07:00 Run #habit");
		expect(out).toBe("## Schedule\n\n- [ ] 07:00 Run #habit\n");
	});

	test("only matches the configured heading level", () => {
		const input = "# Schedule\n\nstuff\n";
		const out = insertUnderHeading(input, "Schedule", "- [ ] 07:00 Run #habit");
		expect(out).toContain("# Schedule\n\nstuff");
		expect(out).toContain("## Schedule\n\n- [ ] 07:00 Run #habit\n");
	});
});

describe("dailyNotePath", () => {
	const ymd = (date: string, _format: string) => date;

	test("with folder", () => {
		expect(
			dailyNotePath(
				"2026-05-03",
				{ folder: "Daily", format: "YYYY-MM-DD" },
				ymd,
			),
		).toBe("Daily/2026-05-03.md");
	});

	test("without folder", () => {
		expect(
			dailyNotePath(
				"2026-05-03",
				{ folder: "", format: "YYYY-MM-DD" },
				ymd,
			),
		).toBe("2026-05-03.md");
	});

	test("strips slashes around folder", () => {
		expect(
			dailyNotePath(
				"2026-05-03",
				{ folder: "/Daily/", format: "YYYY-MM-DD" },
				ymd,
			),
		).toBe("Daily/2026-05-03.md");
	});

	test("delegates filename to formatter", () => {
		const fmt = (_date: string, format: string) =>
			format === "YYYY/MM/DD" ? "2026/05/03" : "x";
		expect(
			dailyNotePath(
				"2026-05-03",
				{ folder: "Daily", format: "YYYY/MM/DD" },
				fmt,
			),
		).toBe("Daily/2026/05/03.md");
	});
});

describe("parsePlannedBlocks", () => {
	test("returns [] when heading is missing", () => {
		const out = parsePlannedBlocks("# Day\n\nfoo\n", "Schedule");
		expect(out).toEqual([]);
	});

	test("parses checkbox lines with start-end", () => {
		const content = [
			"## Schedule",
			"",
			"- [ ] 09:00 - 10:00 Run #habit",
			"- [x] 12:30 - 13:00 Lunch #habit",
			"",
			"## Notes",
			"- [ ] 14:00 - 15:00 should be ignored",
		].join("\n");
		const out = parsePlannedBlocks(content, "Schedule");
		expect(out).toEqual([
			{ startMin: 9 * 60, endMin: 10 * 60 },
			{ startMin: 12 * 60 + 30, endMin: 13 * 60 },
		]);
	});

	test("parses single-time and bare lines (no checkbox)", () => {
		const content = [
			"## Timeline",
			"",
			"- [ ] 09:00 Wash sheets #maint",
			"19:30 - 21:00 Sketch",
			"22:00 something",
		].join("\n");
		const out = parsePlannedBlocks(content, "Timeline");
		expect(out).toEqual([
			{ startMin: 9 * 60, endMin: 9 * 60 },
			{ startMin: 19 * 60 + 30, endMin: 21 * 60 },
			{ startMin: 22 * 60, endMin: 22 * 60 },
		]);
	});

	test("sorts by start time", () => {
		const content = [
			"## Schedule",
			"",
			"- [ ] 14:00 - 15:00 b",
			"- [ ] 09:00 - 10:00 a",
		].join("\n");
		const out = parsePlannedBlocks(content, "Schedule");
		expect(out.map((b) => b.startMin)).toEqual([9 * 60, 14 * 60]);
	});

	test("skips lines whose end is before start", () => {
		const content = [
			"## Schedule",
			"",
			"- [ ] 14:00 - 13:00 garbage",
			"- [ ] 09:00 - 10:00 ok",
		].join("\n");
		const out = parsePlannedBlocks(content, "Schedule");
		expect(out).toEqual([{ startMin: 9 * 60, endMin: 10 * 60 }]);
	});

	test("stops at next heading", () => {
		const content = [
			"## Schedule",
			"- [ ] 09:00 - 10:00 a",
			"## Notes",
			"- [ ] 14:00 - 15:00 not counted",
		].join("\n");
		const out = parsePlannedBlocks(content, "Schedule");
		expect(out).toEqual([{ startMin: 9 * 60, endMin: 10 * 60 }]);
	});
});

describe("findOpenSlot", () => {
	test("empty schedule returns dayStart", () => {
		expect(findOpenSlot({ blocks: [], durationMin: 30 })).toBe("08:00");
	});

	test("custom dayStart honored", () => {
		expect(
			findOpenSlot({ blocks: [], durationMin: 30, dayStartMin: 6 * 60 }),
		).toBe("06:00");
	});

	test("dayStart rounded up to granularity", () => {
		expect(
			findOpenSlot({
				blocks: [],
				durationMin: 30,
				dayStartMin: 8 * 60 + 7,
				granularityMin: 15,
			}),
		).toBe("08:15");
	});

	test("returns first gap after a block", () => {
		const blocks = [{ startMin: 8 * 60, endMin: 9 * 60 }];
		expect(findOpenSlot({ blocks, durationMin: 30 })).toBe("09:00");
	});

	test("rounds the next slot up to granularity", () => {
		const blocks = [{ startMin: 8 * 60, endMin: 9 * 60 + 5 }];
		expect(findOpenSlot({ blocks, durationMin: 30, granularityMin: 15 })).toBe(
			"09:15",
		);
	});

	test("skips a tight gap that doesn't fit duration", () => {
		const blocks = [
			{ startMin: 8 * 60, endMin: 9 * 60 },
			{ startMin: 9 * 60 + 30, endMin: 11 * 60 },
		];
		// 09:00–09:30 is the gap (30 min) — needs 60, so skip to after 11:00
		expect(findOpenSlot({ blocks, durationMin: 60 })).toBe("11:00");
	});

	test("returns null if no slot fits before dayEnd", () => {
		const blocks = [{ startMin: 8 * 60, endMin: 22 * 60 }];
		expect(findOpenSlot({ blocks, durationMin: 30 })).toBeNull();
	});

	test("point events do not block", () => {
		const blocks = [{ startMin: 9 * 60, endMin: 9 * 60 }];
		expect(findOpenSlot({ blocks, durationMin: 60 })).toBe("08:00");
	});

	test("zero duration is rejected", () => {
		expect(findOpenSlot({ blocks: [], durationMin: 0 })).toBeNull();
	});

	test("notBeforeMin pushes the candidate past the floor", () => {
		expect(
			findOpenSlot({
				blocks: [],
				durationMin: 30,
				notBeforeMin: 14 * 60 + 23,
			}),
		).toBe("14:30");
	});

	test("notBeforeMin earlier than dayStart has no effect", () => {
		expect(
			findOpenSlot({
				blocks: [],
				durationMin: 30,
				notBeforeMin: 6 * 60,
			}),
		).toBe("08:00");
	});

	test("notBeforeMin still respects existing blocks", () => {
		const blocks = [{ startMin: 14 * 60, endMin: 15 * 60 }];
		expect(
			findOpenSlot({
				blocks,
				durationMin: 30,
				notBeforeMin: 14 * 60 + 5,
			}),
		).toBe("15:00");
	});

	test("notBeforeMin past dayEnd returns null", () => {
		expect(
			findOpenSlot({
				blocks: [],
				durationMin: 30,
				notBeforeMin: 23 * 60,
			}),
		).toBeNull();
	});
});

describe("extractPlanLabel", () => {
	test("strips trailing tags", () => {
		expect(extractPlanLabel("Run #habit #cardio")).toBe("Run");
	});

	test("strips Project: prefix", () => {
		expect(extractPlanLabel("Project: Wire UI #work")).toBe("Wire UI");
	});

	test("preserves embedded #-like text that is not a trailing tag run", () => {
		expect(extractPlanLabel("Read C# book #habit")).toBe("Read C# book");
	});

	test("returns empty when nothing remains", () => {
		expect(extractPlanLabel("   ")).toBe("");
	});
});

describe("parseDailyNotePath", () => {
	const yyyymmdd = (basename: string, format: string) =>
		format === "YYYY-MM-DD" && /^\d{4}-\d{2}-\d{2}$/.test(basename)
			? basename
			: null;

	test("matches root-level daily note when no folder configured", () => {
		expect(
			parseDailyNotePath(
				"2026-05-03.md",
				{ folder: "", format: "YYYY-MM-DD" },
				yyyymmdd,
			),
		).toBe("2026-05-03");
	});

	test("matches files inside the configured folder", () => {
		expect(
			parseDailyNotePath(
				"Daily/2026-05-03.md",
				{ folder: "Daily", format: "YYYY-MM-DD" },
				yyyymmdd,
			),
		).toBe("2026-05-03");
	});

	test("rejects files outside the folder", () => {
		expect(
			parseDailyNotePath(
				"Notes/2026-05-03.md",
				{ folder: "Daily", format: "YYYY-MM-DD" },
				yyyymmdd,
			),
		).toBeNull();
	});

	test("rejects non-md files", () => {
		expect(
			parseDailyNotePath(
				"Daily/2026-05-03.txt",
				{ folder: "Daily", format: "YYYY-MM-DD" },
				yyyymmdd,
			),
		).toBeNull();
	});

	test("returns null when basename does not match format", () => {
		expect(
			parseDailyNotePath(
				"Daily/notes.md",
				{ folder: "Daily", format: "YYYY-MM-DD" },
				yyyymmdd,
			),
		).toBeNull();
	});

	test("strips slashes around the configured folder", () => {
		expect(
			parseDailyNotePath(
				"Daily/2026-05-03.md",
				{ folder: "/Daily/", format: "YYYY-MM-DD" },
				yyyymmdd,
			),
		).toBe("2026-05-03");
	});
});

describe("parseCheckedPlanLines", () => {
	test("returns [] when heading missing", () => {
		expect(parseCheckedPlanLines("# Day\n", "Timeline")).toEqual([]);
	});

	test("only returns checked lines under the configured heading", () => {
		const content = [
			"## Timeline",
			"",
			"- [ ] 09:00 - 10:00 Run #habit",
			"- [x] 12:30 - 13:00 Lunch #habit",
			"- [X] 14:00 Wash sheets #maint",
			"",
			"## Notes",
			"- [x] 15:00 - 16:00 not counted",
		].join("\n");
		expect(parseCheckedPlanLines(content, "Timeline")).toEqual([
			{
				startTime: "12:30",
				endTime: "13:00",
				label: "Lunch",
				raw: "- [x] 12:30 - 13:00 Lunch #habit",
			},
			{
				startTime: "14:00",
				endTime: undefined,
				label: "Wash sheets",
				raw: "- [X] 14:00 Wash sheets #maint",
			},
		]);
	});

	test("strips Project: prefix and trailing tags from label", () => {
		const content = [
			"## Timeline",
			"",
			"- [x] 19:00 - 20:30 Project: Plan tab #work #lifecore",
		].join("\n");
		expect(parseCheckedPlanLines(content, "Timeline")).toEqual([
			{
				startTime: "19:00",
				endTime: "20:30",
				label: "Plan tab",
				raw: "- [x] 19:00 - 20:30 Project: Plan tab #work #lifecore",
			},
		]);
	});

	test("stops at next heading", () => {
		const content = [
			"## Timeline",
			"- [x] 09:00 - 10:00 a",
			"## Other",
			"- [x] 11:00 b",
		].join("\n");
		const out = parseCheckedPlanLines(content, "Timeline");
		expect(out).toHaveLength(1);
		expect(out[0].label).toBe("a");
	});

	test("skips lines with empty labels", () => {
		const content = ["## Timeline", "- [x] 09:00   "].join("\n");
		expect(parseCheckedPlanLines(content, "Timeline")).toEqual([]);
	});
});

describe("markPlanLineCheckedForLabel", () => {
	test("checks a single-time line whose label matches (case-insensitive)", () => {
		const content = ["## Timeline", "", "- [ ] 07:00 Run #habit", ""].join(
			"\n",
		);
		const result = markPlanLineCheckedForLabel(content, "Timeline", "run");
		expect(result.matched?.startTime).toBe("07:00");
		expect(result.matched?.label).toBe("Run");
		expect(result.updated).toContain("- [x] 07:00 Run #habit");
	});

	test("checks a line with a duration time block", () => {
		const content = [
			"## Timeline",
			"- [ ] 13:30 - 14:00 Pull-ups #habit",
		].join("\n");
		const result = markPlanLineCheckedForLabel(content, "Timeline", "Pull-ups");
		expect(result.matched?.startTime).toBe("13:30");
		expect(result.matched?.endTime).toBe("14:00");
		expect(result.updated).toContain("- [x] 13:30 - 14:00 Pull-ups #habit");
	});

	test("matches Project: prefix", () => {
		const content = [
			"## Timeline",
			"- [ ] 19:00 - 20:30 Project: Plan tab #work",
		].join("\n");
		const result = markPlanLineCheckedForLabel(
			content,
			"Timeline",
			"Plan tab",
		);
		expect(result.matched?.label).toBe("Plan tab");
		expect(result.updated).toContain(
			"- [x] 19:00 - 20:30 Project: Plan tab #work",
		);
	});

	test("prefers a line whose start time matches when multiple unchecked lines share a label", () => {
		const content = [
			"## Timeline",
			"- [ ] 07:00 Run #habit",
			"- [ ] 17:00 Run #habit",
		].join("\n");
		const result = markPlanLineCheckedForLabel(
			content,
			"Timeline",
			"Run",
			"17:00",
		);
		expect(result.matched?.startTime).toBe("17:00");
		expect(result.updated).toContain("- [ ] 07:00 Run #habit");
		expect(result.updated).toContain("- [x] 17:00 Run #habit");
	});

	test("falls back to first unchecked match when preferred time has none", () => {
		const content = [
			"## Timeline",
			"- [ ] 07:00 Run #habit",
			"- [ ] 17:00 Run #habit",
		].join("\n");
		const result = markPlanLineCheckedForLabel(
			content,
			"Timeline",
			"Run",
			"12:30",
		);
		expect(result.matched?.startTime).toBe("07:00");
		expect(result.updated).toContain("- [x] 07:00 Run #habit");
		expect(result.updated).toContain("- [ ] 17:00 Run #habit");
	});

	test("ignores already-checked lines", () => {
		const content = [
			"## Timeline",
			"- [x] 07:00 Run #habit",
			"- [ ] 17:00 Run #habit",
		].join("\n");
		const result = markPlanLineCheckedForLabel(content, "Timeline", "Run");
		expect(result.matched?.startTime).toBe("17:00");
	});

	test("returns null match when nothing fits", () => {
		const content = ["## Timeline", "- [ ] 07:00 Run #habit"].join("\n");
		const result = markPlanLineCheckedForLabel(
			content,
			"Timeline",
			"Lunch",
		);
		expect(result.matched).toBeNull();
		expect(result.updated).toBe(content);
	});

	test("doesn't cross into the next heading", () => {
		const content = [
			"## Timeline",
			"- [ ] 07:00 Run #habit",
			"## Notes",
			"- [ ] 08:00 Run #habit",
		].join("\n");
		const result = markPlanLineCheckedForLabel(
			content,
			"Timeline",
			"Run",
			"08:00",
		);
		// Falls back to the only candidate under Timeline (07:00); the 08:00 under
		// Notes must not be touched.
		expect(result.matched?.startTime).toBe("07:00");
		expect(result.updated).toContain("## Notes\n- [ ] 08:00 Run #habit");
	});
});
