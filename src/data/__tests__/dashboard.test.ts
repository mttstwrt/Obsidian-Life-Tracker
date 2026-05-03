import { describe, expect, test } from "bun:test";
import {
	dateString,
	gridDates,
	startOfMonth,
	startOfWeekMonday,
	startOfYear,
	summarizeAll,
	summarizeCounter,
	summarizeHabit,
	summarizeMaintenance,
	summarizeProject,
	summarizeReverseHabit,
} from "../dashboard";
import type {
	CounterDefinition,
	Event,
	HabitDefinition,
	MaintenanceDefinition,
	ProjectDefinition,
	ReverseHabitDefinition,
} from "../types";

function ev(timestamp: string, value?: number): Event {
	return { id: timestamp, timestamp, value, fields: {} };
}

const HABIT: HabitDefinition = {
	id: "running",
	displayName: "Running",
	kind: "habit",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	valueType: "duration",
	targetCadence: "4/week",
};

const HABIT_DAILY: HabitDefinition = {
	...HABIT,
	id: "meditate",
	displayName: "Meditate",
	targetCadence: "1/day",
};

const MAINT: MaintenanceDefinition = {
	id: "wash-sheets",
	displayName: "Wash sheets",
	kind: "maintenance",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	intervalDays: 14,
	warningThresholdDays: 3,
};

const PROJ: ProjectDefinition = {
	id: "blog",
	displayName: "Blog",
	kind: "project",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	dormantAfterDays: 7,
};

const COUNTER: CounterDefinition = {
	id: "books",
	displayName: "Books read",
	kind: "counter",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	resetCadence: "yearly",
	goal: 12,
};

const REVERSE: ReverseHabitDefinition = {
	id: "no-doomscroll",
	displayName: "Days without doomscrolling",
	kind: "reverse-habit",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	milestones: [7, 30, 90, 365],
};

describe("date helpers", () => {
	test("dateString formats local date", () => {
		// Construct a local date explicitly
		const d = new Date(2026, 0, 5, 12, 0, 0);
		expect(dateString(d)).toBe("2026-01-05");
	});

	test("startOfWeekMonday wraps Sunday back to previous Monday", () => {
		const sun = new Date(2026, 4, 3, 14, 0, 0); // Sunday May 3, 2026
		const mon = startOfWeekMonday(sun);
		expect(mon.getDay()).toBe(1);
		expect(mon.getDate()).toBe(27);
		expect(mon.getMonth()).toBe(3);
	});

	test("startOfMonth and startOfYear", () => {
		const d = new Date(2026, 4, 15, 9, 30);
		const m = startOfMonth(d);
		expect(m.getMonth()).toBe(4);
		expect(m.getDate()).toBe(1);
		const y = startOfYear(d);
		expect(y.getMonth()).toBe(0);
		expect(y.getDate()).toBe(1);
	});

	test("gridDates returns N days ending today", () => {
		const now = new Date(2026, 4, 1, 10);
		const dates = gridDates(now, 5);
		expect(dates.length).toBe(5);
		expect(dates[4]).toBe("2026-05-01");
		expect(dates[0]).toBe("2026-04-27");
	});
});

describe("summarizeHabit", () => {
	test("daily cadence due today when no event today", () => {
		const now = new Date(2026, 4, 1, 12); // Friday May 1
		const yesterday = new Date(2026, 3, 30, 8);
		const summary = summarizeHabit(
			HABIT_DAILY,
			[ev(yesterday.toISOString())],
			now,
		);
		expect(summary.dueToday).toBe(true);
		expect(summary.periodCount).toBe(0);
		expect(summary.periodLabel).toBe("today");
	});

	test("daily cadence not due once today's event exists", () => {
		const now = new Date(2026, 4, 1, 12);
		const today = new Date(2026, 4, 1, 7);
		const summary = summarizeHabit(
			HABIT_DAILY,
			[ev(today.toISOString())],
			now,
		);
		expect(summary.dueToday).toBe(false);
		expect(summary.periodCount).toBe(1);
		expect(summary.currentStreak).toBe(1);
	});

	test("weekly cadence counts events in current week", () => {
		const now = new Date(2026, 4, 1, 12); // Friday May 1, 2026
		const events = [
			ev(new Date(2026, 3, 27, 8).toISOString()), // Mon
			ev(new Date(2026, 3, 29, 8).toISOString()), // Wed
			ev(new Date(2026, 4, 1, 7).toISOString()), // Fri
			ev(new Date(2026, 3, 26, 8).toISOString()), // prev Sun
		];
		const summary = summarizeHabit(HABIT, events, now);
		expect(summary.periodLabel).toBe("this week");
		expect(summary.periodTarget).toBe(4);
		expect(summary.periodCount).toBe(3);
		expect(summary.dueToday).toBe(true);
	});

	test("recentByDate aggregates events per local day", () => {
		const now = new Date(2026, 4, 1, 23);
		const events = [
			ev(new Date(2026, 4, 1, 7).toISOString()),
			ev(new Date(2026, 4, 1, 19).toISOString()),
			ev(new Date(2026, 3, 30, 12).toISOString()),
		];
		const summary = summarizeHabit(HABIT, events, now);
		expect(summary.recentByDate.get("2026-05-01")).toBe(2);
		expect(summary.recentByDate.get("2026-04-30")).toBe(1);
	});

	test("streak counts consecutive days ending today", () => {
		const now = new Date(2026, 4, 5, 12);
		const events = [
			ev(new Date(2026, 4, 5, 7).toISOString()),
			ev(new Date(2026, 4, 4, 7).toISOString()),
			ev(new Date(2026, 4, 3, 7).toISOString()),
			ev(new Date(2026, 4, 1, 7).toISOString()),
		];
		const summary = summarizeHabit(HABIT_DAILY, events, now);
		expect(summary.currentStreak).toBe(3);
	});

	test("unparseable cadence yields target=0", () => {
		const def: HabitDefinition = { ...HABIT, targetCadence: "garbage" };
		const summary = summarizeHabit(def, [], new Date(2026, 4, 1, 12));
		expect(summary.periodTarget).toBe(0);
		expect(summary.dueToday).toBe(false);
		expect(summary.periodLabel).toBe("—");
	});
});

describe("summarizeMaintenance", () => {
	const now = new Date(2026, 4, 1, 12);

	test("never logged → status never, urgency Infinity", () => {
		const s = summarizeMaintenance(MAINT, [], now);
		expect(s.status).toBe("never");
		expect(s.daysSince).toBeNull();
		expect(s.urgency).toBe(Number.POSITIVE_INFINITY);
	});

	test("ok when fresh", () => {
		const recent = new Date(2026, 4, 1, 7);
		const s = summarizeMaintenance(MAINT, [ev(recent.toISOString())], now);
		expect(s.status).toBe("ok");
		expect(s.daysSince).toBe(0);
		expect(s.urgency).toBe(-14);
	});

	test("approaching when within warning window", () => {
		const t = new Date(2026, 3, 19, 12); // 12 days ago
		const s = summarizeMaintenance(MAINT, [ev(t.toISOString())], now);
		expect(s.daysSince).toBe(12);
		expect(s.status).toBe("approaching");
	});

	test("overdue when past interval", () => {
		const t = new Date(2026, 3, 10, 12);
		const s = summarizeMaintenance(MAINT, [ev(t.toISOString())], now);
		expect(s.status).toBe("overdue");
		expect(s.urgency).toBeGreaterThanOrEqual(0);
	});
});

describe("summarizeProject", () => {
	const now = new Date(2026, 4, 1, 12);

	test("dormant after configured threshold", () => {
		const t = new Date(2026, 3, 10, 12);
		const s = summarizeProject(PROJ, [ev(t.toISOString())], now);
		expect(s.daysSince).toBeGreaterThan(7);
		expect(s.isDormant).toBe(true);
	});

	test("active when recent", () => {
		const events = [
			ev(new Date(2026, 4, 1, 8).toISOString()),
			ev(new Date(2026, 3, 28, 8).toISOString()),
		];
		const s = summarizeProject(PROJ, events, now);
		expect(s.isDormant).toBe(false);
		expect(s.eventsLast30).toBe(2);
		expect(s.totalEvents).toBe(2);
	});

	test("never has daysSince null and not dormant", () => {
		const s = summarizeProject(PROJ, [], now);
		expect(s.daysSince).toBeNull();
		expect(s.isDormant).toBe(false);
	});
});

describe("summarizeCounter", () => {
	const now = new Date(2026, 4, 1, 12);

	test("yearly resetCadence sums events from start of year", () => {
		const events = [
			ev(new Date(2026, 0, 5).toISOString(), 1),
			ev(new Date(2026, 1, 5).toISOString(), 2),
			ev(new Date(2025, 11, 30).toISOString(), 5),
		];
		const s = summarizeCounter(COUNTER, events, now);
		expect(s.total).toBe(8);
		expect(s.periodTotal).toBe(3);
		expect(s.periodLabel).toBe("this year");
		expect(s.progress).toBeCloseTo(3 / 12);
	});

	test("monthly resetCadence", () => {
		const def: CounterDefinition = { ...COUNTER, resetCadence: "monthly" };
		const events = [
			ev(new Date(2026, 4, 1, 8).toISOString(), 1),
			ev(new Date(2026, 3, 30).toISOString(), 1),
		];
		const s = summarizeCounter(def, events, now);
		expect(s.periodTotal).toBe(1);
		expect(s.periodLabel).toBe("this month");
	});

	test("never resetCadence reports all-time", () => {
		const def: CounterDefinition = { ...COUNTER, resetCadence: "never" };
		const events = [
			ev(new Date(2024, 0, 1).toISOString(), 4),
			ev(new Date(2026, 4, 1).toISOString(), 1),
		];
		const s = summarizeCounter(def, events, now);
		expect(s.total).toBe(5);
		expect(s.periodTotal).toBe(5);
		expect(s.periodLabel).toBe("all time");
	});

	test("missing value treats event as 1", () => {
		const def: CounterDefinition = {
			...COUNTER,
			resetCadence: undefined,
			goal: undefined,
		};
		const s = summarizeCounter(def, [ev(new Date(2026, 4, 1).toISOString())], now);
		expect(s.total).toBe(1);
		expect(s.progress).toBeUndefined();
	});
});

describe("summarizeReverseHabit", () => {
	const now = new Date(2026, 4, 1, 12);

	test("daysSince and personal best", () => {
		const events = [
			ev(new Date(2026, 0, 1).toISOString()),
			ev(new Date(2026, 1, 5).toISOString()),
			ev(new Date(2026, 4, 1, 5).toISOString()),
		];
		const s = summarizeReverseHabit(REVERSE, events, now);
		expect(s.daysSince).toBe(0);
		// gap from Feb 5 → May 1 is 85 days
		expect(s.personalBestDays).toBeGreaterThanOrEqual(85);
	});

	test("milestones report last and next", () => {
		const events = [ev(new Date(2026, 3, 22).toISOString())];
		const s = summarizeReverseHabit(REVERSE, events, now);
		expect(s.daysSince).toBe(9);
		expect(s.lastMilestone).toBe(7);
		expect(s.nextMilestone).toBe(30);
	});

	test("crossed milestone shows in milestone range", () => {
		const events = [ev(new Date(2026, 3, 24, 12).toISOString())];
		const s = summarizeReverseHabit(REVERSE, events, now);
		expect(s.daysSince).toBe(7);
		expect(s.lastMilestone).toBe(7);
		expect(s.inMilestoneRange).toBe(true);
	});

	test("approaching milestone within proximity", () => {
		// 5 days ago → 2 away from 7-day milestone
		const events = [ev(new Date(2026, 3, 26, 12).toISOString())];
		const s = summarizeReverseHabit(REVERSE, events, now);
		expect(s.daysSince).toBe(5);
		expect(s.nextMilestone).toBe(7);
		expect(s.inMilestoneRange).toBe(true);
	});

	test("no events → daysSince null", () => {
		const s = summarizeReverseHabit(REVERSE, [], now);
		expect(s.daysSince).toBeNull();
	});
});

describe("summarizeAll", () => {
	test("dispatches by kind, skips archived", () => {
		const now = new Date(2026, 4, 1, 12);
		const archived: HabitDefinition = {
			...HABIT,
			id: "old-habit",
			status: "archived",
		};
		const map = new Map<string, Event[]>([
			[HABIT.id, [ev(new Date(2026, 4, 1, 7).toISOString())]],
			[MAINT.id, []],
			[PROJ.id, [ev(new Date(2026, 4, 1, 8).toISOString())]],
			[COUNTER.id, [ev(new Date(2026, 4, 1).toISOString(), 1)]],
			[REVERSE.id, [ev(new Date(2026, 0, 1).toISOString())]],
			[archived.id, [ev(new Date(2026, 4, 1).toISOString())]],
		]);
		const result = summarizeAll({
			definitions: [HABIT, MAINT, PROJ, COUNTER, REVERSE, archived],
			eventsByDefinitionId: map,
			now,
		});
		expect(result.habits.length).toBe(1);
		expect(result.habits[0].definition.id).toBe(HABIT.id);
		expect(result.maintenance.length).toBe(1);
		expect(result.projects.length).toBe(1);
		expect(result.counters.length).toBe(1);
		expect(result.reverseHabits.length).toBe(1);
	});
});
