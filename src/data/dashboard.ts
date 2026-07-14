import { parseTargetCadence } from "./definitionForm";
import type {
	CounterDefinition,
	Definition,
	Event,
	HabitDefinition,
	MaintenanceDefinition,
	ProjectDefinition,
	ReverseHabitDefinition,
} from "./types";
import { milestoneTone } from "./visualizations";

export type FreshnessStatus = "never" | "ok" | "approaching" | "overdue";

export type HabitWindowMode = "calendar" | "rolling";

export interface HabitSummary {
	definition: HabitDefinition;
	totalEvents: number;
	lastEventTimestamp?: string;
	recentByDate: Map<string, number>;
	periodCount: number;
	periodTarget: number;
	periodLabel:
		| "today"
		| "this week"
		| "this month"
		| "past 7 days"
		| "past 30 days"
		| "—";
	dueToday: boolean;
	currentStreak: number;
}

export interface MaintenanceSummary {
	definition: MaintenanceDefinition;
	lastEventTimestamp?: string;
	daysSince: number | null;
	status: FreshnessStatus;
	freshness: number;
	urgency: number;
}

export interface ProjectSummary {
	definition: ProjectDefinition;
	lastEventTimestamp?: string;
	daysSince: number | null;
	totalEvents: number;
	eventsLast30: number;
	dormantAfterDays: number;
	isDormant: boolean;
}

export interface CounterSummary {
	definition: CounterDefinition;
	total: number;
	periodTotal: number;
	periodLabel: "this year" | "this month" | "all time";
	goal?: number;
	progress?: number;
}

export interface ReverseHabitSummary {
	definition: ReverseHabitDefinition;
	lastEventTimestamp?: string;
	daysSince: number | null;
	personalBestDays: number;
	lastMilestone?: number;
	nextMilestone?: number;
	inMilestoneRange: boolean;
	tone: number;
}

const MS_PER_DAY = 86_400_000;
const PROJECT_DEFAULT_DORMANT_DAYS = 14;
const HABITS_GRID_DAYS = 28;
const MILESTONE_PROXIMITY_DAYS = 3;

export function dateString(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
	const out = new Date(d);
	out.setHours(0, 0, 0, 0);
	return out;
}

export function startOfWeekMonday(d: Date): Date {
	const out = startOfDay(d);
	const dow = out.getDay();
	const offset = dow === 0 ? -6 : 1 - dow;
	out.setDate(out.getDate() + offset);
	return out;
}

export function startOfMonth(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d: Date): Date {
	return new Date(d.getFullYear(), 0, 1);
}

function parseTimestamp(t: string): Date | null {
	const d = new Date(t);
	return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(earlier: Date, later: Date): number {
	const a = startOfDay(earlier).getTime();
	const b = startOfDay(later).getTime();
	return Math.floor((b - a) / MS_PER_DAY);
}

function lastEvent(events: Event[]): Event | undefined {
	let best: Event | undefined;
	for (const e of events) {
		if (!best || e.timestamp > best.timestamp) best = e;
	}
	return best;
}

function eventValueNumeric(e: Event): number {
	if (typeof e.value === "number" && Number.isFinite(e.value)) return e.value;
	return 1;
}

export interface DashboardInput {
	definitions: Definition[];
	eventsByDefinitionId: Map<string, Event[]>;
	now: Date;
	habitWindowMode?: HabitWindowMode;
}

export interface DashboardSummaries {
	habits: HabitSummary[];
	maintenance: MaintenanceSummary[];
	projects: ProjectSummary[];
	counters: CounterSummary[];
	reverseHabits: ReverseHabitSummary[];
}

export function summarizeAll(input: DashboardInput): DashboardSummaries {
	const habits: HabitSummary[] = [];
	const maintenance: MaintenanceSummary[] = [];
	const projects: ProjectSummary[] = [];
	const counters: CounterSummary[] = [];
	const reverseHabits: ReverseHabitSummary[] = [];

	for (const def of input.definitions) {
		if (def.status === "archived") continue;
		const events = input.eventsByDefinitionId.get(def.id) ?? [];
		switch (def.kind) {
			case "habit":
				habits.push(
					summarizeHabit(def, events, input.now, input.habitWindowMode),
				);
				break;
			case "maintenance":
				maintenance.push(summarizeMaintenance(def, events, input.now));
				break;
			case "project":
				projects.push(summarizeProject(def, events, input.now));
				break;
			case "counter":
				counters.push(summarizeCounter(def, events, input.now));
				break;
			case "reverse-habit":
				reverseHabits.push(summarizeReverseHabit(def, events, input.now));
				break;
		}
	}
	return { habits, maintenance, projects, counters, reverseHabits };
}

type CadencePeriod = "day" | "week" | "month";

function periodStart(d: Date, period: CadencePeriod): Date {
	if (period === "day") return startOfDay(d);
	if (period === "week") return startOfWeekMonday(d);
	return startOfMonth(d);
}

function prevPeriodStart(start: Date, period: CadencePeriod): Date {
	const prev = new Date(start);
	if (period === "day") prev.setDate(prev.getDate() - 1);
	else if (period === "week") prev.setDate(prev.getDate() - 7);
	else prev.setMonth(prev.getMonth() - 1);
	return prev;
}

function computeHabitStreak(
	events: Event[],
	cadence: { count: number; period: CadencePeriod },
	now: Date,
	currentPeriodCount: number,
	target: number,
): number {
	if (target <= 0) return 0;
	const periodCounts = new Map<string, number>();
	for (const e of events) {
		const ts = parseTimestamp(e.timestamp);
		if (!ts) continue;
		const key = dateString(periodStart(ts, cadence.period));
		periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
	}
	let streak = 0;
	let cursor = prevPeriodStart(periodStart(now, cadence.period), cadence.period);
	// Stop walking once events run out — a period with no events is unmet and breaks the chain.
	const oldest = events.reduce<Date | null>((acc, e) => {
		const ts = parseTimestamp(e.timestamp);
		if (!ts) return acc;
		if (acc === null || ts < acc) return ts;
		return acc;
	}, null);
	const oldestPeriodStart = oldest ? periodStart(oldest, cadence.period) : null;
	while (true) {
		if (oldestPeriodStart && cursor < oldestPeriodStart) break;
		const count = periodCounts.get(dateString(cursor)) ?? 0;
		if (count >= target) {
			streak += 1;
			cursor = prevPeriodStart(cursor, cadence.period);
		} else {
			break;
		}
	}
	if (currentPeriodCount >= target) streak += 1;
	return streak;
}

export function summarizeHabit(
	def: HabitDefinition,
	events: Event[],
	now: Date,
	windowMode: HabitWindowMode = "calendar",
): HabitSummary {
	const cadence = parseTargetCadence(def.targetCadence);
	const today = startOfDay(now);
	let periodStart: Date;
	let periodLabel: HabitSummary["periodLabel"];

	if (!cadence) {
		periodStart = today;
		periodLabel = "—";
	} else if (cadence.period === "day") {
		periodStart = today;
		periodLabel = "today";
	} else if (cadence.period === "week") {
		if (windowMode === "rolling") {
			periodStart = new Date(today);
			periodStart.setDate(periodStart.getDate() - 6);
			periodLabel = "past 7 days";
		} else {
			periodStart = startOfWeekMonday(now);
			periodLabel = "this week";
		}
	} else {
		if (windowMode === "rolling") {
			periodStart = new Date(today);
			periodStart.setDate(periodStart.getDate() - 29);
			periodLabel = "past 30 days";
		} else {
			periodStart = startOfMonth(now);
			periodLabel = "this month";
		}
	}
	const periodStartIso = periodStart.toISOString();

	let periodCount = 0;
	const recentByDate = new Map<string, number>();
	const gridStart = new Date(today);
	gridStart.setDate(gridStart.getDate() - (HABITS_GRID_DAYS - 1));
	for (const e of events) {
		if (e.timestamp >= periodStartIso) periodCount += 1;
		const ts = parseTimestamp(e.timestamp);
		if (ts && ts >= gridStart) {
			const key = dateString(ts);
			recentByDate.set(key, (recentByDate.get(key) ?? 0) + 1);
		}
	}

	const last = lastEvent(events);

	const periodTarget = cadence ? cadence.count : 0;
	const dueToday = cadence ? periodCount < periodTarget : false;
	const currentStreak = cadence
		? computeHabitStreak(events, cadence, now, periodCount, periodTarget)
		: 0;

	return {
		definition: def,
		totalEvents: events.length,
		lastEventTimestamp: last?.timestamp,
		recentByDate,
		periodCount,
		periodTarget,
		periodLabel,
		dueToday,
		currentStreak,
	};
}

export function summarizeMaintenance(
	def: MaintenanceDefinition,
	events: Event[],
	now: Date,
): MaintenanceSummary {
	const last = lastEvent(events);
	if (!last) {
		return {
			definition: def,
			daysSince: null,
			status: "never",
			freshness: Number.POSITIVE_INFINITY,
			urgency: Number.POSITIVE_INFINITY,
		};
	}
	const ts = parseTimestamp(last.timestamp);
	const daysSince = ts === null ? 0 : daysBetween(ts, now);
	const interval = Math.max(1, def.intervalDays);
	const warning = Math.max(0, def.warningThresholdDays);
	let status: FreshnessStatus;
	if (daysSince >= interval) status = "overdue";
	else if (daysSince >= interval - warning) status = "approaching";
	else status = "ok";
	return {
		definition: def,
		lastEventTimestamp: last.timestamp,
		daysSince,
		status,
		freshness: daysSince / interval,
		urgency: daysSince - interval,
	};
}

export function projectFreshnessStatus(p: ProjectSummary): FreshnessStatus {
	if (p.daysSince === null) return "never";
	if (p.isDormant) return "overdue";
	if (p.daysSince >= p.dormantAfterDays * 0.8) return "approaching";
	return "ok";
}

export function summarizeProject(
	def: ProjectDefinition,
	events: Event[],
	now: Date,
): ProjectSummary {
	const last = lastEvent(events);
	const ts = last ? parseTimestamp(last.timestamp) : null;
	const daysSince = ts === null ? null : daysBetween(ts, now);
	const dormantAfter = def.dormantAfterDays ?? PROJECT_DEFAULT_DORMANT_DAYS;
	const isDormant = daysSince === null ? false : daysSince > dormantAfter;
	const cutoff = new Date(now);
	cutoff.setDate(cutoff.getDate() - 30);
	const cutoffIso = cutoff.toISOString();
	let eventsLast30 = 0;
	for (const e of events) {
		if (e.timestamp >= cutoffIso) eventsLast30 += 1;
	}
	return {
		definition: def,
		lastEventTimestamp: last?.timestamp,
		daysSince,
		totalEvents: events.length,
		eventsLast30,
		dormantAfterDays: dormantAfter,
		isDormant,
	};
}

export function summarizeCounter(
	def: CounterDefinition,
	events: Event[],
	now: Date,
): CounterSummary {
	let total = 0;
	for (const e of events) total += eventValueNumeric(e);

	let periodTotal = total;
	let periodLabel: CounterSummary["periodLabel"] = "all time";
	if (def.resetCadence === "yearly") {
		const start = startOfYear(now).toISOString();
		periodTotal = 0;
		for (const e of events) if (e.timestamp >= start) periodTotal += eventValueNumeric(e);
		periodLabel = "this year";
	} else if (def.resetCadence === "monthly") {
		const start = startOfMonth(now).toISOString();
		periodTotal = 0;
		for (const e of events) if (e.timestamp >= start) periodTotal += eventValueNumeric(e);
		periodLabel = "this month";
	}

	const summary: CounterSummary = {
		definition: def,
		total,
		periodTotal,
		periodLabel,
		goal: def.goal,
	};
	if (typeof def.goal === "number" && def.goal > 0) {
		summary.progress = periodTotal / def.goal;
	}
	return summary;
}

export function summarizeReverseHabit(
	def: ReverseHabitDefinition,
	events: Event[],
	now: Date,
): ReverseHabitSummary {
	const sorted = [...events].sort((a, b) =>
		a.timestamp.localeCompare(b.timestamp),
	);
	const last = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
	const ts = last ? parseTimestamp(last.timestamp) : null;
	const daysSince = ts === null ? null : daysBetween(ts, now);

	let personalBest = daysSince ?? 0;
	for (let i = 1; i < sorted.length; i++) {
		const prev = parseTimestamp(sorted[i - 1].timestamp);
		const cur = parseTimestamp(sorted[i].timestamp);
		if (prev && cur) {
			const gap = daysBetween(prev, cur);
			if (gap > personalBest) personalBest = gap;
		}
	}

	const milestones = (def.milestones ?? [])
		.filter((m) => Number.isFinite(m) && m > 0)
		.slice()
		.sort((a, b) => a - b);

	let lastMilestone: number | undefined;
	let nextMilestone: number | undefined;
	if (daysSince !== null && milestones.length > 0) {
		for (const m of milestones) {
			if (m <= daysSince) lastMilestone = m;
			else if (nextMilestone === undefined) nextMilestone = m;
		}
	}

	let inMilestoneRange = false;
	if (daysSince !== null) {
		if (lastMilestone !== undefined && daysSince - lastMilestone <= 0) {
			inMilestoneRange = true;
		}
		if (
			nextMilestone !== undefined &&
			nextMilestone - daysSince <= MILESTONE_PROXIMITY_DAYS
		) {
			inMilestoneRange = true;
		}
		if (lastMilestone !== undefined && daysSince === lastMilestone) {
			inMilestoneRange = true;
		}
	}

	return {
		definition: def,
		lastEventTimestamp: last?.timestamp,
		daysSince,
		personalBestDays: personalBest,
		lastMilestone,
		nextMilestone,
		inMilestoneRange,
		tone: milestoneTone(daysSince, milestones),
	};
}

export function applyOrder<T>(
	items: T[],
	order: string[],
	idOf: (item: T) => string,
): T[] {
	if (order.length === 0) return items;
	const idx = new Map(order.map((id, i) => [id, i]));
	const indexed = items.map((item, i) => ({ item, i }));
	indexed.sort((a, b) => {
		const ai = idx.get(idOf(a.item));
		const bi = idx.get(idOf(b.item));
		if (ai !== undefined && bi !== undefined) return ai - bi;
		if (ai !== undefined) return -1;
		if (bi !== undefined) return 1;
		return a.i - b.i;
	});
	return indexed.map((x) => x.item);
}

export function gridDates(now: Date, days: number = HABITS_GRID_DAYS): string[] {
	const today = startOfDay(now);
	const out: string[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(today);
		d.setDate(d.getDate() - i);
		out.push(dateString(d));
	}
	return out;
}

export const HABITS_GRID_LENGTH = HABITS_GRID_DAYS;
