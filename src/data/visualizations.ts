import { dateString, startOfDay } from "./dashboard";
import type { Event, FieldDef } from "./types";

const MS_PER_DAY = 86_400_000;

export interface DateBucket {
	date: string;
	count: number;
}

export function eventsByDate(events: Event[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const e of events) {
		const d = new Date(e.timestamp);
		if (Number.isNaN(d.getTime())) continue;
		const key = dateString(d);
		out.set(key, (out.get(key) ?? 0) + 1);
	}
	return out;
}

export function dateRange(now: Date, days: number): string[] {
	const today = startOfDay(now);
	const out: string[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(today);
		d.setDate(d.getDate() - i);
		out.push(dateString(d));
	}
	return out;
}

export function buildHeatmapBuckets(
	events: Event[],
	now: Date,
	days: number,
): DateBucket[] {
	const counts = eventsByDate(events);
	return dateRange(now, days).map((date) => ({
		date,
		count: counts.get(date) ?? 0,
	}));
}

export function eventsByDayOfWeek(events: Event[]): number[] {
	const buckets = [0, 0, 0, 0, 0, 0, 0];
	for (const e of events) {
		const d = new Date(e.timestamp);
		if (Number.isNaN(d.getTime())) continue;
		buckets[d.getDay()] += 1;
	}
	return buckets;
}

export interface WeekBucket {
	weekStart: string;
	count: number;
}

function startOfWeekMonday(d: Date): Date {
	const out = startOfDay(d);
	const dow = out.getDay();
	const offset = dow === 0 ? -6 : 1 - dow;
	out.setDate(out.getDate() + offset);
	return out;
}

export function eventsByWeek(
	events: Event[],
	now: Date,
	weeks: number,
): WeekBucket[] {
	const start = startOfWeekMonday(now);
	const out: WeekBucket[] = [];
	for (let i = weeks - 1; i >= 0; i--) {
		const d = new Date(start);
		d.setDate(d.getDate() - i * 7);
		out.push({ weekStart: dateString(d), count: 0 });
	}
	const weekIndexByStart = new Map(
		out.map((b, idx) => [b.weekStart, idx] as const),
	);
	for (const e of events) {
		const d = new Date(e.timestamp);
		if (Number.isNaN(d.getTime())) continue;
		const ws = dateString(startOfWeekMonday(d));
		const idx = weekIndexByStart.get(ws);
		if (idx !== undefined) out[idx].count += 1;
	}
	return out;
}

export interface NumericPoint {
	timestamp: string;
	value: number;
}

export function numericFieldSeries(
	events: Event[],
	key: string,
): NumericPoint[] {
	const out: NumericPoint[] = [];
	for (const e of events) {
		const fv = e.fields[key];
		if (!fv || fv.coercionError) continue;
		if (typeof fv.coerced === "number" && Number.isFinite(fv.coerced)) {
			out.push({ timestamp: e.timestamp, value: fv.coerced });
		}
	}
	out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	return out;
}

export interface NumericStats {
	count: number;
	mean: number;
	min: number;
	max: number;
}

export function numericStats(points: NumericPoint[]): NumericStats | null {
	if (points.length === 0) return null;
	let sum = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const p of points) {
		sum += p.value;
		if (p.value < min) min = p.value;
		if (p.value > max) max = p.value;
	}
	return {
		count: points.length,
		mean: sum / points.length,
		min,
		max,
	};
}

export function fieldDistribution(
	events: Event[],
	field: FieldDef,
): { label: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const e of events) {
		const fv = e.fields[field.key];
		if (!fv) continue;
		if (fv.coercionError) continue;
		const c = fv.coerced;
		if (Array.isArray(c)) {
			for (const item of c) counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
		} else if (c !== undefined) {
			counts.set(String(c), (counts.get(String(c)) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count);
}

export interface CorrelationHint {
	keyA: string;
	keyB: string;
	r: number;
	n: number;
}

export function pearson(xs: number[], ys: number[]): number | null {
	const n = xs.length;
	if (n < 2 || n !== ys.length) return null;
	let sx = 0;
	let sy = 0;
	for (let i = 0; i < n; i++) {
		sx += xs[i];
		sy += ys[i];
	}
	const mx = sx / n;
	const my = sy / n;
	let num = 0;
	let dx2 = 0;
	let dy2 = 0;
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - mx;
		const dy = ys[i] - my;
		num += dx * dy;
		dx2 += dx * dx;
		dy2 += dy * dy;
	}
	if (dx2 === 0 || dy2 === 0) return null;
	return num / Math.sqrt(dx2 * dy2);
}

export function fieldCorrelations(
	events: Event[],
	numericFieldKeys: string[],
	threshold = 0.5,
): CorrelationHint[] {
	const hints: CorrelationHint[] = [];
	for (let i = 0; i < numericFieldKeys.length; i++) {
		for (let j = i + 1; j < numericFieldKeys.length; j++) {
			const a = numericFieldKeys[i];
			const b = numericFieldKeys[j];
			const xs: number[] = [];
			const ys: number[] = [];
			for (const e of events) {
				const fa = e.fields[a];
				const fb = e.fields[b];
				if (!fa || !fb) continue;
				if (fa.coercionError || fb.coercionError) continue;
				if (
					typeof fa.coerced === "number" &&
					typeof fb.coerced === "number" &&
					Number.isFinite(fa.coerced) &&
					Number.isFinite(fb.coerced)
				) {
					xs.push(fa.coerced);
					ys.push(fb.coerced);
				}
			}
			const r = pearson(xs, ys);
			if (r !== null && Math.abs(r) >= threshold) {
				hints.push({ keyA: a, keyB: b, r, n: xs.length });
			}
		}
	}
	return hints.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

export interface SparklinePath {
	d: string;
	width: number;
	height: number;
	min: number;
	max: number;
}

export function sparklinePath(
	values: number[],
	width = 100,
	height = 24,
): SparklinePath | null {
	if (values.length === 0) return null;
	let min = values[0];
	let max = values[0];
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const range = max - min || 1;
	const stepX = values.length > 1 ? width / (values.length - 1) : 0;
	const segs: string[] = [];
	for (let i = 0; i < values.length; i++) {
		const x = i * stepX;
		const y = height - ((values[i] - min) / range) * height;
		segs.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
	}
	if (values.length === 1) {
		segs.push(`L${width.toFixed(2)},${segs[0].slice(1)}`);
	}
	return { d: segs.join(" "), width, height, min, max };
}

export function milestoneTone(
	daysSince: number | null,
	milestones: number[],
): number {
	if (daysSince === null || daysSince <= 0) return 0;

	const sorted = (milestones ?? [])
		.filter((m) => Number.isFinite(m) && m > 0)
		.slice()
		.sort((a, b) => a - b);

	if (sorted.length === 0) {
		if (daysSince <= 1) return 0;
		if (daysSince >= 3) return 1;
		return (daysSince - 1) / 2;
	}

	const anchors = [0, ...sorted];
	const last = anchors[anchors.length - 1];
	if (daysSince >= last) return 1;

	for (let i = 1; i < anchors.length; i++) {
		if (daysSince <= anchors[i]) {
			const lo = anchors[i - 1];
			const hi = anchors[i];
			const span = hi - lo || 1;
			const segT = (daysSince - lo) / span;
			const tLo = (i - 1) / (anchors.length - 1);
			const tHi = i / (anchors.length - 1);
			return tLo + segT * (tHi - tLo);
		}
	}
	return 1;
}

export function toneColor(t: number): string {
	const clamped = Math.min(1, Math.max(0, t));
	const success = "var(--text-success, var(--interactive-accent))";
	if (clamped <= 0.5) {
		const pct = (clamped * 2 * 100).toFixed(1);
		return `color-mix(in oklch, var(--text-error), var(--text-warning) ${pct}%)`;
	}
	const pct = ((clamped - 0.5) * 2 * 100).toFixed(1);
	return `color-mix(in oklch, var(--text-warning), ${success} ${pct}%)`;
}

export interface MaintenanceTimelineMark {
	date: string;
	x: number;
	overdue: boolean;
}

export function maintenanceTimeline(
	events: Event[],
	now: Date,
	intervalDays: number,
	windowDays: number,
): MaintenanceTimelineMark[] {
	const cutoff = new Date(startOfDay(now));
	cutoff.setDate(cutoff.getDate() - (windowDays - 1));
	const cutoffMs = cutoff.getTime();
	const totalMs = windowDays * MS_PER_DAY;
	const out: MaintenanceTimelineMark[] = [];
	const sorted = [...events].sort((a, b) =>
		a.timestamp.localeCompare(b.timestamp),
	);
	let prevMs: number | null = null;
	for (const e of sorted) {
		const d = new Date(e.timestamp);
		if (Number.isNaN(d.getTime())) continue;
		const ms = startOfDay(d).getTime();
		if (ms < cutoffMs) {
			prevMs = ms;
			continue;
		}
		const x = ((ms - cutoffMs) / totalMs) * 100;
		const overdue =
			prevMs !== null && (ms - prevMs) / MS_PER_DAY > intervalDays;
		out.push({ date: dateString(d), x, overdue });
		prevMs = ms;
	}
	return out;
}
