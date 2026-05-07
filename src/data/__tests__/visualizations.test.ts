import { describe, expect, test } from "bun:test";
import {
	buildHeatmapBuckets,
	dateRange,
	eventsByDate,
	eventsByDayOfWeek,
	eventsByWeek,
	fieldCorrelations,
	fieldDistribution,
	maintenanceTimeline,
	milestoneTone,
	numericFieldSeries,
	numericStats,
	pearson,
	sparklinePath,
	toneColor,
} from "../visualizations";
import type { Event, FieldDef } from "../types";

function ev(timestamp: string, fields: Record<string, { raw: string; coerced?: number | string | boolean | Array<number | string | boolean>; coercionError?: string }> = {}): Event {
	return { id: timestamp, timestamp, fields };
}

describe("eventsByDate", () => {
	test("counts events per local date", () => {
		const events = [
			ev(new Date(2026, 4, 1, 8).toISOString()),
			ev(new Date(2026, 4, 1, 22).toISOString()),
			ev(new Date(2026, 4, 2, 9).toISOString()),
		];
		const counts = eventsByDate(events);
		expect(counts.get("2026-05-01")).toBe(2);
		expect(counts.get("2026-05-02")).toBe(1);
	});

	test("ignores invalid timestamps", () => {
		const events = [ev("not-a-date"), ev(new Date(2026, 4, 1).toISOString())];
		const counts = eventsByDate(events);
		expect(counts.size).toBe(1);
	});
});

describe("dateRange and heatmap", () => {
	test("dateRange returns N consecutive dates ending today", () => {
		const now = new Date(2026, 4, 5, 10);
		const r = dateRange(now, 3);
		expect(r).toEqual(["2026-05-03", "2026-05-04", "2026-05-05"]);
	});

	test("buildHeatmapBuckets fills zeros for empty days", () => {
		const now = new Date(2026, 4, 5, 10);
		const events = [ev(new Date(2026, 4, 4, 12).toISOString())];
		const buckets = buildHeatmapBuckets(events, now, 3);
		expect(buckets.length).toBe(3);
		expect(buckets.find((b) => b.date === "2026-05-04")?.count).toBe(1);
		expect(buckets.find((b) => b.date === "2026-05-03")?.count).toBe(0);
	});
});

describe("eventsByDayOfWeek", () => {
	test("buckets by getDay (0=Sun)", () => {
		// May 1 2026 is a Friday (5)
		const fri = new Date(2026, 4, 1, 12);
		const sat = new Date(2026, 4, 2, 12);
		const fri2 = new Date(2026, 4, 8, 12);
		const buckets = eventsByDayOfWeek([
			ev(fri.toISOString()),
			ev(sat.toISOString()),
			ev(fri2.toISOString()),
		]);
		expect(buckets[5]).toBe(2);
		expect(buckets[6]).toBe(1);
		expect(buckets[0]).toBe(0);
	});
});

describe("eventsByWeek", () => {
	test("groups into ISO-Monday weeks ending current week", () => {
		const now = new Date(2026, 4, 6, 10); // Wed May 6
		const thisWeek = new Date(2026, 4, 5, 9); // Tue
		const lastWeek = new Date(2026, 3, 28, 9); // Tue Apr 28
		const tooOld = new Date(2026, 0, 1, 9);
		const buckets = eventsByWeek(
			[ev(thisWeek.toISOString()), ev(lastWeek.toISOString()), ev(tooOld.toISOString())],
			now,
			4,
		);
		expect(buckets.length).toBe(4);
		expect(buckets[buckets.length - 1].count).toBe(1);
		expect(buckets[buckets.length - 2].count).toBe(1);
		const totalInWindow = buckets.reduce((s, b) => s + b.count, 0);
		expect(totalInWindow).toBe(2);
	});
});

describe("numericFieldSeries", () => {
	test("collects coerced numeric values, sorted by timestamp", () => {
		const events: Event[] = [
			ev("2026-05-02T10:00", {
				quality: { raw: "4", coerced: 4 },
			}),
			ev("2026-05-01T10:00", {
				quality: { raw: "3", coerced: 3 },
			}),
			ev("2026-05-03T10:00", {
				quality: { raw: "bad", coercionError: "not a number" },
			}),
		];
		const series = numericFieldSeries(events, "quality");
		expect(series.map((p) => p.value)).toEqual([3, 4]);
	});

	test("ignores missing fields and non-number coerced values", () => {
		const events: Event[] = [
			ev("2026-05-01T10:00", {
				note: { raw: "hi", coerced: "hi" },
			}),
			ev("2026-05-02T10:00", {}),
		];
		expect(numericFieldSeries(events, "quality")).toEqual([]);
	});
});

describe("numericStats", () => {
	test("returns null on empty", () => {
		expect(numericStats([])).toBeNull();
	});
	test("computes mean/min/max", () => {
		const stats = numericStats([
			{ timestamp: "2026-05-01", value: 1 },
			{ timestamp: "2026-05-02", value: 3 },
			{ timestamp: "2026-05-03", value: 5 },
		]);
		expect(stats).not.toBeNull();
		expect(stats?.count).toBe(3);
		expect(stats?.mean).toBe(3);
		expect(stats?.min).toBe(1);
		expect(stats?.max).toBe(5);
	});
});

describe("fieldDistribution", () => {
	test("counts occurrences of enum values", () => {
		const f: FieldDef = {
			key: "mood",
			type: "enum",
			options: ["good", "bad", "ok"],
		};
		const events: Event[] = [
			ev("2026-05-01T10:00", { mood: { raw: "good", coerced: "good" } }),
			ev("2026-05-02T10:00", { mood: { raw: "good", coerced: "good" } }),
			ev("2026-05-03T10:00", { mood: { raw: "bad", coerced: "bad" } }),
			ev("2026-05-04T10:00", { mood: { raw: "x", coercionError: "bad" } }),
		];
		const dist = fieldDistribution(events, f);
		expect(dist[0]).toEqual({ label: "good", count: 2 });
		expect(dist.find((d) => d.label === "bad")?.count).toBe(1);
	});

	test("expands list values into per-item counts", () => {
		const f: FieldDef = { key: "tags", type: "list", itemType: "string" };
		const events: Event[] = [
			ev("2026-05-01T10:00", {
				tags: { raw: "a,b", coerced: ["a", "b"] },
			}),
			ev("2026-05-02T10:00", {
				tags: { raw: "b", coerced: ["b"] },
			}),
		];
		const dist = fieldDistribution(events, f);
		expect(dist.find((d) => d.label === "b")?.count).toBe(2);
		expect(dist.find((d) => d.label === "a")?.count).toBe(1);
	});
});

describe("pearson and fieldCorrelations", () => {
	test("perfect positive correlation -> r = 1", () => {
		expect(pearson([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 5);
	});
	test("perfect negative correlation -> r = -1", () => {
		expect(pearson([1, 2, 3], [9, 6, 3])).toBeCloseTo(-1, 5);
	});
	test("returns null for short arrays", () => {
		expect(pearson([1], [2])).toBeNull();
	});
	test("returns null when constant series", () => {
		expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
	});
	test("fieldCorrelations returns hints above threshold", () => {
		const events: Event[] = [
			ev("2026-05-01", {
				a: { raw: "1", coerced: 1 },
				b: { raw: "2", coerced: 2 },
			}),
			ev("2026-05-02", {
				a: { raw: "2", coerced: 2 },
				b: { raw: "4", coerced: 4 },
			}),
			ev("2026-05-03", {
				a: { raw: "3", coerced: 3 },
				b: { raw: "6", coerced: 6 },
			}),
		];
		const hints = fieldCorrelations(events, ["a", "b"], 0.5);
		expect(hints.length).toBe(1);
		expect(hints[0].r).toBeCloseTo(1, 5);
		expect(hints[0].n).toBe(3);
	});
	test("fieldCorrelations skips events with missing/error fields", () => {
		const events: Event[] = [
			ev("2026-05-01", {
				a: { raw: "1", coerced: 1 },
				b: { raw: "2", coerced: 2 },
			}),
			ev("2026-05-02", {
				a: { raw: "2", coerced: 2 },
			}),
			ev("2026-05-03", {
				a: { raw: "x", coercionError: "x" },
				b: { raw: "6", coerced: 6 },
			}),
		];
		const hints = fieldCorrelations(events, ["a", "b"], 0);
		expect(hints).toHaveLength(0);
	});
});

describe("sparklinePath", () => {
	test("returns null on empty input", () => {
		expect(sparklinePath([])).toBeNull();
	});
	test("emits valid M..L path", () => {
		const sp = sparklinePath([1, 2, 3], 60, 20);
		expect(sp).not.toBeNull();
		expect(sp?.d.startsWith("M")).toBe(true);
		expect(sp?.d).toMatch(/L/);
		expect(sp?.min).toBe(1);
		expect(sp?.max).toBe(3);
	});
	test("single-value series still draws a line", () => {
		const sp = sparklinePath([5], 60, 20);
		expect(sp).not.toBeNull();
		expect(sp?.min).toBe(5);
		expect(sp?.max).toBe(5);
	});
});

describe("milestoneTone", () => {
	test("returns 0 for null or non-positive daysSince", () => {
		expect(milestoneTone(null, [7, 14])).toBe(0);
		expect(milestoneTone(0, [7, 14])).toBe(0);
		expect(milestoneTone(-3, [7, 14])).toBe(0);
	});

	test("clamps to 1 at or past the last milestone", () => {
		expect(milestoneTone(90, [7, 14, 30, 60, 90])).toBe(1);
		expect(milestoneTone(120, [7, 14, 30, 60, 90])).toBe(1);
	});

	test("evenly distributes anchors across the gradient", () => {
		// anchors: [0, 7, 14, 30, 60, 90] → t = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
		const ms = [7, 14, 30, 60, 90];
		expect(milestoneTone(7, ms)).toBeCloseTo(0.2, 5);
		expect(milestoneTone(14, ms)).toBeCloseTo(0.4, 5);
		expect(milestoneTone(30, ms)).toBeCloseTo(0.6, 5);
		expect(milestoneTone(60, ms)).toBeCloseTo(0.8, 5);
	});

	test("interpolates linearly between anchors", () => {
		// anchors: [0, 7, 14] → t = [0, 0.5, 1.0]
		// daysSince=3.5 sits halfway in [0,7] → t = 0.25
		expect(milestoneTone(3.5, [7, 14])).toBeCloseTo(0.25, 5);
		// daysSince=10.5 sits halfway in [7,14] → t = 0.75
		expect(milestoneTone(10.5, [7, 14])).toBeCloseTo(0.75, 5);
	});

	test("single milestone ramps red to green linearly", () => {
		// anchors: [0, 30] → t at midpoint = 0.5
		expect(milestoneTone(15, [30])).toBeCloseTo(0.5, 5);
		expect(milestoneTone(30, [30])).toBe(1);
	});

	test("falls back to fixed cooldown with no milestones", () => {
		expect(milestoneTone(1, [])).toBe(0);
		expect(milestoneTone(2, [])).toBeCloseTo(0.5, 5);
		expect(milestoneTone(3, [])).toBe(1);
		expect(milestoneTone(10, [])).toBe(1);
	});

	test("ignores invalid milestone entries", () => {
		// only 7 and 14 survive filtering → same shape as [7, 14]
		expect(milestoneTone(7, [-1, 0, Number.NaN, 7, 14])).toBeCloseTo(0.5, 5);
	});
});

describe("toneColor", () => {
	test("clamps and interpolates through warning at midpoint", () => {
		expect(toneColor(0)).toContain("text-error");
		expect(toneColor(1)).toContain("text-success");
		expect(toneColor(0.5)).toContain("text-warning");
		expect(toneColor(-1)).toContain("text-error");
		expect(toneColor(2)).toContain("text-success");
	});
});

describe("maintenanceTimeline", () => {
	test("places marks within the window with overdue flag when gap exceeds interval", () => {
		const now = new Date(2026, 4, 30, 12);
		const events: Event[] = [
			ev(new Date(2026, 4, 1, 9).toISOString()),
			ev(new Date(2026, 4, 20, 9).toISOString()),
		];
		const marks = maintenanceTimeline(events, now, 14, 30);
		expect(marks.length).toBe(2);
		expect(marks[0].overdue).toBe(false);
		expect(marks[1].overdue).toBe(true);
		for (const m of marks) {
			expect(m.x).toBeGreaterThanOrEqual(0);
			expect(m.x).toBeLessThanOrEqual(100);
		}
	});

	test("excludes events older than the window", () => {
		const now = new Date(2026, 4, 30, 12);
		const events: Event[] = [
			ev(new Date(2026, 0, 1, 9).toISOString()),
			ev(new Date(2026, 4, 25, 9).toISOString()),
		];
		const marks = maintenanceTimeline(events, now, 14, 30);
		expect(marks.length).toBe(1);
	});
});
