import { describe, expect, test } from "bun:test";
import { aggregateTagTimeline } from "../tagTimeline";
import type { Definition, Event } from "../types";

function habit(id: string, tags: string[]): Definition {
	return {
		id,
		kind: "habit",
		displayName: id,
		status: "active",
		tags,
		created: "2026-01-01T00:00:00",
		schemaVersion: 1,
		valueType: "boolean",
		targetCadence: "daily",
	};
}

function ev(timestamp: string, note?: string): Event {
	return { id: timestamp, timestamp, note, fields: {} };
}

const NOW = new Date(2026, 4, 20, 12, 0, 0); // 2026-05-20, local noon

describe("aggregateTagTimeline", () => {
	test("rolls events up by tag and bucket-by-day", () => {
		const defs = [habit("run", ["cardio", "outdoor"])];
		const events = new Map<string, Event[]>([
			[
				"run",
				[
					ev(new Date(2026, 4, 19, 7).toISOString()),
					ev(new Date(2026, 4, 19, 18).toISOString()),
					ev(new Date(2026, 4, 20, 7).toISOString()),
				],
			],
		]);

		const tracks = aggregateTagTimeline(defs, events, NOW, 30);
		expect(tracks.map((t) => t.tag).sort()).toEqual(["cardio", "outdoor"]);

		const cardio = tracks.find((t) => t.tag === "cardio");
		expect(cardio).toBeDefined();
		if (!cardio) throw new Error("unreachable");
		expect(cardio.total).toBe(3);
		expect(cardio.definitionCount).toBe(1);
		expect(cardio.maxDayCount).toBe(2);
		expect(cardio.lastActive).toBe("2026-05-20");
		expect(cardio.days.map((d) => ({ date: d.date, count: d.count }))).toEqual([
			{ date: "2026-05-19", count: 2 },
			{ date: "2026-05-20", count: 1 },
		]);
	});

	test("day buckets carry the contributing events, sorted by time", () => {
		const run = habit("run", ["cardio"]);
		run.displayName = "Running";
		run.emoji = "🏃";
		const bike = habit("bike", ["cardio"]);
		bike.displayName = "Cycling";
		const events = new Map<string, Event[]>([
			["run", [ev(new Date(2026, 4, 19, 18).toISOString(), "evening jog")]],
			["bike", [ev(new Date(2026, 4, 19, 7).toISOString())]],
		]);

		const [cardio] = aggregateTagTimeline([run, bike], events, NOW, 30);
		const day = cardio.days.find((d) => d.date === "2026-05-19");
		expect(day).toBeDefined();
		if (!day) throw new Error("unreachable");
		expect(day.events).toHaveLength(2);
		// Earlier timestamp first.
		expect(day.events[0]).toMatchObject({
			definitionName: "Cycling",
			time: "07:00",
		});
		expect(day.events[1]).toMatchObject({
			definitionName: "Running",
			emoji: "🏃",
			note: "evening jog",
			time: "18:00",
		});
	});

	test("merges multiple definitions sharing a tag and counts them", () => {
		const defs = [habit("run", ["cardio"]), habit("bike", ["cardio"])];
		const events = new Map<string, Event[]>([
			["run", [ev(new Date(2026, 4, 18, 7).toISOString())]],
			["bike", [ev(new Date(2026, 4, 18, 9).toISOString())]],
		]);

		const tracks = aggregateTagTimeline(defs, events, NOW, 30);
		expect(tracks).toHaveLength(1);
		expect(tracks[0].tag).toBe("cardio");
		expect(tracks[0].total).toBe(2);
		expect(tracks[0].definitionCount).toBe(2);
		expect(tracks[0].days[0]).toMatchObject({ date: "2026-05-18", count: 2 });
	});

	test("excludes events outside the trailing window", () => {
		const defs = [habit("run", ["cardio"])];
		const events = new Map<string, Event[]>([
			[
				"run",
				[
					ev(new Date(2026, 4, 1, 7).toISOString()), // 19 days ago — inside 30, outside 7
					ev(new Date(2026, 4, 20, 7).toISOString()), // today
					ev(new Date(2026, 4, 25, 7).toISOString()), // future — excluded
				],
			],
		]);

		const window7 = aggregateTagTimeline(defs, events, NOW, 7);
		expect(window7[0].total).toBe(1);
		expect(window7[0].lastActive).toBe("2026-05-20");

		const window30 = aggregateTagTimeline(defs, events, NOW, 30);
		expect(window30[0].total).toBe(2);
	});

	test("ignores definitions without tags or without events", () => {
		const defs = [habit("untagged", []), habit("quiet", ["cardio"])];
		const events = new Map<string, Event[]>([
			["untagged", [ev(new Date(2026, 4, 20, 7).toISOString())]],
		]);
		const tracks = aggregateTagTimeline(defs, events, NOW, 30);
		expect(tracks).toHaveLength(0);
	});

	test("ignores invalid timestamps", () => {
		const defs = [habit("run", ["cardio"])];
		const events = new Map<string, Event[]>([
			["run", [ev("not-a-date"), ev(new Date(2026, 4, 20, 7).toISOString())]],
		]);
		const tracks = aggregateTagTimeline(defs, events, NOW, 30);
		expect(tracks[0].total).toBe(1);
	});

	test("sorts tracks by total desc then tag asc", () => {
		const defs = [habit("a", ["alpha"]), habit("b", ["beta"]), habit("c", ["zeta"])];
		const today = new Date(2026, 4, 20, 7).toISOString();
		const events = new Map<string, Event[]>([
			["a", [ev(today)]],
			["b", [ev(today), ev(today)]],
			["c", [ev(today), ev(today)]],
		]);
		const tracks = aggregateTagTimeline(defs, events, NOW, 30);
		// beta and zeta tie at 2 -> alphabetical; alpha last at 1.
		expect(tracks.map((t) => t.tag)).toEqual(["beta", "zeta", "alpha"]);
	});

	test("x positions increase with date and stay within the window", () => {
		const defs = [habit("run", ["cardio"])];
		const events = new Map<string, Event[]>([
			[
				"run",
				[
					ev(new Date(2026, 4, 14, 7).toISOString()),
					ev(new Date(2026, 4, 20, 7).toISOString()),
				],
			],
		]);
		const tracks = aggregateTagTimeline(defs, events, NOW, 7);
		const xs = tracks[0].days.map((d) => d.x);
		expect(xs[0]).toBeCloseTo(0, 5); // 7 days ago == window start
		expect(xs[1]).toBeGreaterThan(xs[0]);
		expect(xs[1]).toBeLessThan(100);
	});
});
