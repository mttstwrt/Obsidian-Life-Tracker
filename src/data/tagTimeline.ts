import { dateString, startOfDay } from "./dashboard";
import type { Definition, Event } from "./types";

const MS_PER_DAY = 86_400_000;

export interface TagEventRef {
	/** Raw ISO timestamp, used for ordering within the day. */
	timestamp: string;
	/** Local HH:MM of the event. */
	time: string;
	definitionName: string;
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
				definitionName: def.displayName,
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
		tracks.push({
			tag,
			total,
			definitionCount: defsByTag.get(tag)?.size ?? 0,
			maxDayCount,
			lastActive,
			days: buckets,
		});
	}

	tracks.sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
	return tracks;
}
