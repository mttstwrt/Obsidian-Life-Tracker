import { dateString, startOfDay } from "./dashboard";
import type { Definition, Event } from "./types";

const MS_PER_DAY = 86_400_000;

export type TagTrend = "up" | "down" | "flat";

/**
 * Deterministic, theme-agnostic color for a tag. The same tag name always maps
 * to the same hue so a tag reads identically across the timeline and the
 * co-occurrence panel. Fixed lightness/chroma keep colors legible on light and
 * dark themes alike.
 */
export function tagColor(tag: string): string {
	let h = 0;
	for (let i = 0; i < tag.length; i++) {
		h = (h * 31 + tag.charCodeAt(i)) >>> 0;
	}
	return `oklch(0.68 0.15 ${h % 360})`;
}

function computeTrend(earlier: number, recent: number): TagTrend {
	if (earlier === 0 && recent === 0) return "flat";
	if (earlier === 0) return "up";
	if (recent === 0) return "down";
	const ratio = recent / earlier;
	if (ratio >= 1.15) return "up";
	if (ratio <= 0.85) return "down";
	return "flat";
}

export interface TagEventRef {
	/** Raw ISO timestamp, used for ordering within the day. */
	timestamp: string;
	/** Local HH:MM of the event. */
	time: string;
	definitionId: string;
	definitionName: string;
	eventId: string;
	emoji?: string;
	note?: string;
}

export interface TagDayBucket {
	/** Local YYYY-MM-DD of the day this bucket covers. */
	date: string;
	/** Events tagged with the parent tag that occurred on this day. */
	count: number;
	/** Horizontal position within the window, 0..100. */
	x: number;
	/** The contributing events, ascending by timestamp. */
	events: TagEventRef[];
}

function formatTime(d: Date): string {
	return d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

export interface TagTrack {
	tag: string;
	/** Total tagged events in the window. */
	total: number;
	/** Distinct definitions that contributed events for this tag in the window. */
	definitionCount: number;
	/** Busiest single day's count, for scaling mark intensity. */
	maxDayCount: number;
	/** Local YYYY-MM-DD of the most recent active day, or null. */
	lastActive: string | null;
	/** Whole days between the most recent active day and today; null if never. */
	lastActiveDaysAgo: number | null;
	/** Recent-half vs earlier-half activity within the window. */
	trend: TagTrend;
	/** Per-week event counts across the window, oldest→newest, for a sparkline. */
	weeklyCounts: number[];
	/** Active days (count > 0), ascending by date. */
	days: TagDayBucket[];
}

/**
 * Rolls events across every definition up by the definition's tags, bucketed by
 * day inside a trailing window ending today. A single event contributes once to
 * each tag its definition carries. Tracks are sorted by total descending, then
 * tag ascending. Tags whose definitions logged nothing in the window are omitted.
 *
 * The x positions match the maintenance/freshness timelines: the window spans
 * `windowDays * MS_PER_DAY`, so today lands just shy of 100% leaving room for the
 * "now" marker.
 */
export function aggregateTagTimeline(
	definitions: Definition[],
	eventsByDefinitionId: Map<string, Event[]>,
	now: Date,
	windowDays: number,
): TagTrack[] {
	const today = startOfDay(now);
	const endMs = today.getTime();
	const cutoff = new Date(today);
	cutoff.setDate(cutoff.getDate() - (windowDays - 1));
	const cutoffMs = cutoff.getTime();
	const totalMs = windowDays * MS_PER_DAY;

	const refsByTag = new Map<string, Map<string, TagEventRef[]>>();
	const defsByTag = new Map<string, Set<string>>();

	for (const def of definitions) {
		if (def.tags.length === 0) continue;
		const events = eventsByDefinitionId.get(def.id);
		if (!events) continue;
		for (const e of events) {
			const d = new Date(e.timestamp);
			if (Number.isNaN(d.getTime())) continue;
			const dayMs = startOfDay(d).getTime();
			if (dayMs < cutoffMs || dayMs > endMs) continue;
			const key = dateString(d);
			const ref: TagEventRef = {
				timestamp: e.timestamp,
				time: formatTime(d),
				definitionId: def.id,
				definitionName: def.displayName,
				eventId: e.id,
				emoji: def.emoji,
				note: e.note,
			};
			for (const tag of def.tags) {
				let days = refsByTag.get(tag);
				if (!days) {
					days = new Map();
					refsByTag.set(tag, days);
				}
				const list = days.get(key);
				if (list) list.push(ref);
				else days.set(key, [ref]);
				let defs = defsByTag.get(tag);
				if (!defs) {
					defs = new Set();
					defsByTag.set(tag, defs);
				}
				defs.add(def.id);
			}
		}
	}

	const tracks: TagTrack[] = [];
	for (const [tag, days] of refsByTag) {
		const buckets: TagDayBucket[] = [];
		let total = 0;
		let maxDayCount = 0;
		let lastActive: string | null = null;
		for (const key of [...days.keys()].sort()) {
			const refs = (days.get(key) ?? []).sort((a, b) =>
				a.timestamp.localeCompare(b.timestamp),
			);
			const count = refs.length;
			total += count;
			if (count > maxDayCount) maxDayCount = count;
			lastActive = key;
			const dayMs = new Date(`${key}T00:00:00`).getTime();
			const x = totalMs > 0 ? ((dayMs - cutoffMs) / totalMs) * 100 : 0;
			buckets.push({ date: key, count, x, events: refs });
		}

		const weekCount = Math.max(1, Math.ceil(windowDays / 7));
		const weekMs = 7 * MS_PER_DAY;
		const midMs = cutoffMs + totalMs / 2;
		const weeklyCounts = new Array<number>(weekCount).fill(0);
		let earlierSum = 0;
		let recentSum = 0;
		for (const b of buckets) {
			const dayMs = new Date(`${b.date}T00:00:00`).getTime();
			const wi = Math.min(
				weekCount - 1,
				Math.max(0, Math.floor((dayMs - cutoffMs) / weekMs)),
			);
			weeklyCounts[wi] += b.count;
			if (dayMs < midMs) earlierSum += b.count;
			else recentSum += b.count;
		}
		const lastActiveDaysAgo =
			lastActive === null
				? null
				: Math.round(
						(endMs - new Date(`${lastActive}T00:00:00`).getTime()) /
							MS_PER_DAY,
					);

		tracks.push({
			tag,
			total,
			definitionCount: defsByTag.get(tag)?.size ?? 0,
			maxDayCount,
			lastActive,
			lastActiveDaysAgo,
			trend: computeTrend(earlierSum, recentSum),
			weeklyCounts,
			days: buckets,
		});
	}

	tracks.sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
	return tracks;
}

export interface TagPair {
	a: string;
	b: string;
	/** Days in the window where both tags had at least one event. */
	sharedDays: number;
	/** sharedDays / |activeDaysA ∪ activeDaysB|, a 0..1 overlap strength. */
	jaccard: number;
}

/**
 * Finds tags that tend to be active on the same day, computed over the day-sets
 * already on each track. "Together" means same calendar day, not same event, so
 * it surfaces behavioral overlap (e.g. you log #outdoor on the days you log
 * #cardio) rather than just definitions that happen to share tags. Pairs are
 * sorted by shared-day count, then overlap strength.
 */
export function tagCoOccurrences(tracks: TagTrack[], minShared = 1): TagPair[] {
	const sets = tracks.map((t) => ({
		tag: t.tag,
		days: new Set(t.days.map((d) => d.date)),
	}));
	const out: TagPair[] = [];
	for (let i = 0; i < sets.length; i++) {
		for (let j = i + 1; j < sets.length; j++) {
			const A = sets[i];
			const B = sets[j];
			const [small, large] =
				A.days.size <= B.days.size ? [A.days, B.days] : [B.days, A.days];
			let shared = 0;
			for (const d of small) if (large.has(d)) shared++;
			if (shared < minShared) continue;
			const union = A.days.size + B.days.size - shared;
			out.push({
				a: A.tag,
				b: B.tag,
				sharedDays: shared,
				jaccard: union > 0 ? shared / union : 0,
			});
		}
	}
	out.sort(
		(x, y) =>
			y.sharedDays - x.sharedDays ||
			y.jaccard - x.jaccard ||
			x.a.localeCompare(y.a) ||
			x.b.localeCompare(y.b),
	);
	return out;
}
