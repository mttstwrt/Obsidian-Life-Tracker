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
	summarizeScore,
} from "../dashboard";
import type {
	CounterDefinition,
	Event,
	HabitDefinition,
	MaintenanceDefinition,
	ProjectDefinition,
	ReverseHabitDefinition,
	ScoreDefinition,
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

	test("weekly streak preserved when current week incomplete", () => {
		// Now = Mon May 4, 2026 — current week starts today, no events yet.
		const now = new Date(2026, 4, 4, 9);
		const events = [
			// week of Apr 27–May 3: 4 events (target met)
			ev(new Date(2026, 3, 27, 8).toISOString()),
			ev(new Date(2026, 3, 29, 8).toISOString()),
			ev(new Date(2026, 4, 1, 8).toISOString()),
			ev(new Date(2026, 4, 3, 8).toISOString()),
			// week of Apr 20–26: 4 events (target met)
			ev(new Date(2026, 3, 20, 8).toISOString()),
			ev(new Date(2026, 3, 22, 8).toISOString()),
			ev(new Date(2026, 3, 24, 8).toISOString()),
			ev(new Date(2026, 3, 26, 8).toISOString()),
		];
		const s = summarizeHabit(HABIT, events, now);
		expect(s.periodCount).toBe(0);
		expect(s.currentStreak).toBe(2);
	});

	test("weekly streak adds current week when target met", () => {
		// Now = Fri May 8, 2026 — week of May 4–10, 4 events logged Mon–Thu.
		const now = new Date(2026, 4, 8, 18);
		const events = [
			ev(new Date(2026, 4, 4, 8).toISOString()),
			ev(new Date(2026, 4, 5, 8).toISOString()),
			ev(new Date(2026, 4, 6, 8).toISOString()),
			ev(new Date(2026, 4, 7, 8).toISOString()),
			// Prior week Apr 27–May 3: 4 events
			ev(new Date(2026, 3, 27, 8).toISOString()),
			ev(new Date(2026, 3, 29, 8).toISOString()),
			ev(new Date(2026, 4, 1, 8).toISOString()),
			ev(new Date(2026, 4, 3, 8).toISOString()),
		];
		const s = summarizeHabit(HABIT, events, now);
		expect(s.periodCount).toBe(4);
		expect(s.currentStreak).toBe(2);
	});

	test("weekly streak breaks on a missed prior week", () => {
		// Now = Mon May 4, 2026. Prior week (Apr 27–May 3) had only 1 event — under target.
		const now = new Date(2026, 4, 4, 9);
		const events = [
			ev(new Date(2026, 3, 28, 8).toISOString()), // 1 event in prior week
			// week of Apr 20–26: 4 events (would be a streak if reachable)
			ev(new Date(2026, 3, 20, 8).toISOString()),
			ev(new Date(2026, 3, 22, 8).toISOString()),
			ev(new Date(2026, 3, 24, 8).toISOString()),
			ev(new Date(2026, 3, 26, 8).toISOString()),
		];
		const s = summarizeHabit(HABIT, events, now);
		expect(s.currentStreak).toBe(0);
	});

	test("monthly streak walks back through completed calendar months", () => {
		const monthly: HabitDefinition = { ...HABIT, targetCadence: "5/month" };
		// Now = May 5, 2026; current month has 1 event (under target).
		const now = new Date(2026, 4, 5, 9);
		const events = [
			ev(new Date(2026, 4, 2, 8).toISOString()),
			// April: 5 events
			ev(new Date(2026, 3, 2, 8).toISOString()),
			ev(new Date(2026, 3, 9, 8).toISOString()),
			ev(new Date(2026, 3, 16, 8).toISOString()),
			ev(new Date(2026, 3, 23, 8).toISOString()),
			ev(new Date(2026, 3, 30, 8).toISOString()),
			// March: 5 events
			ev(new Date(2026, 2, 3, 8).toISOString()),
			ev(new Date(2026, 2, 10, 8).toISOString()),
			ev(new Date(2026, 2, 17, 8).toISOString()),
			ev(new Date(2026, 2, 24, 8).toISOString()),
			ev(new Date(2026, 2, 31, 8).toISOString()),
			// February: 2 events (under target — chain breaks here)
			ev(new Date(2026, 1, 4, 8).toISOString()),
			ev(new Date(2026, 1, 18, 8).toISOString()),
		];
		const s = summarizeHabit(monthly, events, now);
		expect(s.currentStreak).toBe(2);
	});

	test("streak is 0 when no events", () => {
		const now = new Date(2026, 4, 4, 9);
		const s = summarizeHabit(HABIT, [], now);
		expect(s.currentStreak).toBe(0);
	});

	test("rolling weekly window counts past 7 days", () => {
		// Today is Mon May 4, 2026; calendar week just started (no events yet this week)
		const now = new Date(2026, 4, 4, 12);
		const events = [
			ev(new Date(2026, 3, 29, 8).toISOString()), // last Wed
			ev(new Date(2026, 4, 2, 8).toISOString()), // last Sat
		];
		const calendar = summarizeHabit(HABIT, events, now, "calendar");
		expect(calendar.periodCount).toBe(0);
		expect(calendar.periodLabel).toBe("this week");

		const rolling = summarizeHabit(HABIT, events, now, "rolling");
		expect(rolling.periodCount).toBe(2);
		expect(rolling.periodTarget).toBe(4);
		expect(rolling.periodLabel).toBe("past 7 days");
	});

	test("rolling weekly drops events beyond 7-day window", () => {
		// Today is Wed May 6, 2026 — a week after the prior Wed run
		const now = new Date(2026, 4, 6, 12);
		const events = [
			ev(new Date(2026, 3, 29, 8).toISOString()), // 8 cal days ago, out of window
			ev(new Date(2026, 4, 2, 8).toISOString()), // 4 days ago, in window
		];
		const rolling = summarizeHabit(HABIT, events, now, "rolling");
		expect(rolling.periodCount).toBe(1);
		expect(rolling.periodLabel).toBe("past 7 days");
	});

	test("rolling monthly window counts past 30 days", () => {
		const monthly: HabitDefinition = { ...HABIT, targetCadence: "10/month" };
		const now = new Date(2026, 4, 4, 12);
		const events = [
			ev(new Date(2026, 3, 6, 8).toISOString()), // 28 days ago, in window
			ev(new Date(2026, 3, 5, 8).toISOString()), // 29 days ago, on edge (in window)
			ev(new Date(2026, 3, 4, 8).toISOString()), // 30 days ago, out of window
		];
		const rolling = summarizeHabit(monthly, events, now, "rolling");
		expect(rolling.periodCount).toBe(2);
		expect(rolling.periodLabel).toBe("past 30 days");
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

const SCORE: ScoreDefinition = {
	id: "sleep",
	displayName: "Sleep quality",
	kind: "score",
	status: "active",
	tags: [],
	created: "2026-01-01",
	schemaVersion: 1,
	scale: [1, 10],
};

/** A rating at local noon on the given day offset back from `now`. */
function rating(now: Date, daysAgo: number, value: number, hour = 12): Event {
	const d = new Date(now);
	d.setDate(d.getDate() - daysAgo);
	d.setHours(hour, 0, 0, 0);
	return {
		id: `${daysAgo}-${hour}-${value}`,
		timestamp: d.toISOString(),
		value,
		fields: {},
	};
}

describe("summarizeScore", () => {
	const NOW = new Date(2026, 4, 20, 18);

	test("an unrated score reports nothing rather than zero", () => {
		const s = summarizeScore(SCORE, [], NOW);
		expect(s.count).toBe(0);
		expect(s.latest).toBeUndefined();
		expect(s.mean7).toBeUndefined();
		expect(s.meanAll).toBeUndefined();
		expect(s.tone).toBeUndefined();
		expect(s.status).toBe("never");
		expect(s.coverage7).toBe(0);
		expect(s.byDate.size).toBe(0);
	});

	test("a single rating lands in latest, today, and the day map", () => {
		const s = summarizeScore(SCORE, [rating(NOW, 0, 8)], NOW);
		expect(s.count).toBe(1);
		expect(s.latest?.value).toBe(8);
		expect(s.todayValue).toBe(8);
		expect(s.mean7).toBe(8);
		expect(s.byDate.get(dateString(NOW))).toBe(8);
		expect(s.daysSinceLast).toBe(0);
	});

	// The core rule: a day rated three times must not outweigh a day rated once,
	// so every mean runs over folded day values rather than raw events.
	test("means run over day values, not raw events", () => {
		const events = [
			rating(NOW, 1, 2, 9),
			rating(NOW, 1, 2, 13),
			rating(NOW, 1, 2, 20),
			rating(NOW, 0, 8),
		];
		const s = summarizeScore(SCORE, events, NOW);
		expect(s.count).toBe(4);
		// Day values are 2 and 8, so the mean is 5 — not (2+2+2+8)/4 = 3.5.
		expect(s.mean7).toBe(5);
		expect(s.byDate.size).toBe(2);
	});

	describe("dayAggregate", () => {
		const sameDay = [
			rating(NOW, 0, 2, 9),
			rating(NOW, 0, 6, 13),
			rating(NOW, 0, 4, 20),
		];

		test("defaults to the mean", () => {
			const s = summarizeScore(SCORE, sameDay, NOW);
			expect(s.todayValue).toBe(4);
		});

		test("max takes the highest", () => {
			const def: ScoreDefinition = { ...SCORE, dayAggregate: "max" };
			expect(summarizeScore(def, sameDay, NOW).todayValue).toBe(6);
		});

		test("min takes the lowest", () => {
			const def: ScoreDefinition = { ...SCORE, dayAggregate: "min" };
			expect(summarizeScore(def, sameDay, NOW).todayValue).toBe(2);
		});

		test("last takes the latest by timestamp, not by array order", () => {
			const def: ScoreDefinition = { ...SCORE, dayAggregate: "last" };
			const shuffled = [sameDay[1], sameDay[2], sameDay[0]];
			expect(summarizeScore(def, shuffled, NOW).todayValue).toBe(4);
		});
	});

	// An unrated day is unknown, not bad. Counting it as zero would drag every
	// average toward the bottom of the scale.
	test("unrated days are excluded from means, not counted as zero", () => {
		const s = summarizeScore(
			SCORE,
			[rating(NOW, 0, 8), rating(NOW, 6, 6)],
			NOW,
		);
		expect(s.mean7).toBe(7);
		expect(s.coverage7).toBeCloseTo(2 / 7);
	});

	test("coverage counts rated days in the window", () => {
		const events = [0, 1, 2, 3].map((d) => rating(NOW, d, 5));
		const s = summarizeScore(SCORE, events, NOW);
		expect(s.coverage7).toBeCloseTo(4 / 7);
		expect(s.coverage30).toBeCloseTo(4 / 30);
	});

	test("events outside the window do not leak into it", () => {
		const s = summarizeScore(SCORE, [rating(NOW, 20, 3)], NOW);
		expect(s.mean7).toBeUndefined();
		expect(s.mean30).toBe(3);
		expect(s.meanAll).toBe(3);
	});

	test("min and max are the raw extremes, not day values", () => {
		const events = [rating(NOW, 0, 2, 9), rating(NOW, 0, 8, 13)];
		const s = summarizeScore(SCORE, events, NOW);
		expect(s.min).toBe(2);
		expect(s.max).toBe(8);
		// The day itself folded to the mean of the two.
		expect(s.todayValue).toBe(5);
	});

	test("an event with no value is ignored entirely", () => {
		const events = [
			rating(NOW, 0, 8),
			{ ...rating(NOW, 1, 0), value: undefined },
		];
		const s = summarizeScore(SCORE, events, NOW);
		expect(s.count).toBe(1);
		expect(s.byDate.size).toBe(1);
	});

	describe("trend", () => {
		test("stays undefined until both windows have enough rated days", () => {
			const thin = [0, 1, 2].map((d) => rating(NOW, d, 5));
			expect(summarizeScore(SCORE, thin, NOW).trend).toBeUndefined();
		});

		test("compares the recent week against the month", () => {
			// 10 older days at 4, then 3 recent days at 8.
			const events = [
				...Array.from({ length: 10 }, (_, i) => rating(NOW, i + 7, 4)),
				...[0, 1, 2].map((d) => rating(NOW, d, 8)),
			];
			const s = summarizeScore(SCORE, events, NOW);
			expect(s.mean7).toBe(8);
			expect(s.trend).toBeDefined();
			expect(s.trend as number).toBeGreaterThan(0);
		});
	});

	describe("status", () => {
		test("a stated cadence drives ok / approaching / overdue", () => {
			const def: ScoreDefinition = { ...SCORE, expectedCadence: "1/day" };
			expect(summarizeScore(def, [rating(NOW, 0, 5)], NOW).status).toBe("ok");
			expect(summarizeScore(def, [rating(NOW, 2, 5)], NOW).status).toBe(
				"approaching",
			);
			expect(summarizeScore(def, [rating(NOW, 9, 5)], NOW).status).toBe(
				"overdue",
			);
		});

		test("without a cadence there is no expectation to fall behind", () => {
			expect(summarizeScore(SCORE, [rating(NOW, 40, 5)], NOW).status).toBe("ok");
		});

		test("a weekly cadence tolerates a longer gap than a daily one", () => {
			const weekly: ScoreDefinition = { ...SCORE, expectedCadence: "1/week" };
			expect(summarizeScore(weekly, [rating(NOW, 5, 5)], NOW).status).toBe("ok");
		});
	});

	describe("tone", () => {
		test("runs low to high on an ordinary score", () => {
			expect(summarizeScore(SCORE, [rating(NOW, 0, 1)], NOW).tone).toBe(0);
			expect(summarizeScore(SCORE, [rating(NOW, 0, 10)], NOW).tone).toBe(1);
		});

		// Low stress is the good end, so the ramp has to run the other way or the
		// grid would paint a calm day red.
		test("inverts when a low rating is the good one", () => {
			const stress: ScoreDefinition = {
				...SCORE,
				scale: [1, 5],
				higherIsBetter: false,
			};
			expect(summarizeScore(stress, [rating(NOW, 0, 1)], NOW).tone).toBe(1);
			expect(summarizeScore(stress, [rating(NOW, 0, 5)], NOW).tone).toBe(0);
		});
	});

	describe("distribution", () => {
		test("covers the whole scale, including never-used ratings", () => {
			const s = summarizeScore(SCORE, [rating(NOW, 0, 8)], NOW);
			expect(s.distribution).toHaveLength(10);
			expect(s.distribution[0]).toEqual({ value: 1, count: 0 });
			expect(s.distribution[7]).toEqual({ value: 8, count: 1 });
		});

		test("buckets a fractional rating by rounding", () => {
			const s = summarizeScore(SCORE, [rating(NOW, 0, 7.4)], NOW);
			expect(s.distribution[6]).toEqual({ value: 7, count: 1 });
		});
	});
});

describe("summarizeAll — scores", () => {
	test("scores are dispatched into their own bucket", () => {
		const now = new Date(2026, 4, 20, 18);
		const result = summarizeAll({
			definitions: [SCORE, HABIT],
			eventsByDefinitionId: new Map([[SCORE.id, [rating(now, 0, 7)]]]),
			now,
		});
		expect(result.scores).toHaveLength(1);
		expect(result.scores[0].definition.id).toBe(SCORE.id);
		expect(result.scores[0].todayValue).toBe(7);
	});

	test("an archived score is skipped like any other kind", () => {
		const now = new Date(2026, 4, 20, 18);
		const result = summarizeAll({
			definitions: [{ ...SCORE, status: "archived" } as ScoreDefinition],
			eventsByDefinitionId: new Map([[SCORE.id, [rating(now, 0, 7)]]]),
			now,
		});
		expect(result.scores).toHaveLength(0);
	});
});
