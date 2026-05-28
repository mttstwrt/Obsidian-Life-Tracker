<script lang="ts">
	import { startOfDay } from "../../data/dashboard";
	import type { Event as TrackerEvent } from "../../data/types";

	let {
		events,
		now,
		highlightId,
	}: {
		events: TrackerEvent[];
		now: Date;
		highlightId?: string;
	} = $props();

	const MS_PER_DAY = 86_400_000;
	const MIN_SPAN_DAYS = 14;

	const sorted = $derived(
		[...events]
			.filter((e) => !Number.isNaN(new Date(e.timestamp).getTime()))
			.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
	);

	const end = $derived(startOfDay(now));
	const windowStart = $derived.by(() => {
		const floor = new Date(end);
		floor.setDate(floor.getDate() - (MIN_SPAN_DAYS - 1));
		if (sorted.length === 0) return floor;
		const first = startOfDay(new Date(sorted[0].timestamp));
		return first < floor ? first : floor;
	});
	// +1 day so today lands just inside the right edge, leaving room for "now".
	const totalMs = $derived(
		Math.max(MS_PER_DAY, end.getTime() - windowStart.getTime() + MS_PER_DAY),
	);
	const spanDays = $derived(
		Math.round((end.getTime() - windowStart.getTime()) / MS_PER_DAY) + 1,
	);

	function dayX(ts: string): number {
		const dayMs = startOfDay(new Date(ts)).getTime();
		const x = ((dayMs - windowStart.getTime()) / totalMs) * 100;
		return Math.min(100, Math.max(0, x));
	}

	function fmtDateTime(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	}

	const marks = $derived(
		sorted.map((e) => ({
			id: e.id,
			x: dayX(e.timestamp),
			highlight: !!highlightId && e.id === highlightId,
			title: fmtDateTime(e.timestamp),
		})),
	);

	type Tick = { x: number; label: string };

	function fmtMonDay(d: Date): string {
		return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}
	function fmtMonth(d: Date): string {
		return d.toLocaleDateString(undefined, { month: "short" });
	}
	function tickX(d: Date): number {
		return ((d.getTime() - windowStart.getTime()) / totalMs) * 100;
	}

	const ticks: Tick[] = $derived.by(() => {
		const out: Tick[] = [];
		const start = windowStart;
		if (spanDays <= 31) {
			const cur = new Date(start);
			while (cur.getDay() !== 1 && cur <= end) cur.setDate(cur.getDate() + 1);
			while (cur <= end) {
				out.push({ x: tickX(cur), label: fmtMonDay(cur) });
				cur.setDate(cur.getDate() + 7);
			}
		} else if (spanDays <= 120) {
			const cur = new Date(start);
			while (cur.getDay() !== 1 && cur <= end) cur.setDate(cur.getDate() + 1);
			while (cur <= end) {
				out.push({ x: tickX(cur), label: fmtMonDay(cur) });
				cur.setDate(cur.getDate() + 14);
			}
		} else if (spanDays <= 400) {
			const cur = new Date(start.getFullYear(), start.getMonth(), 1);
			if (cur < start) cur.setMonth(cur.getMonth() + 1);
			while (cur <= end) {
				const label =
					cur.getMonth() === 0
						? `${fmtMonth(cur)} ${cur.getFullYear()}`
						: fmtMonth(cur);
				out.push({ x: tickX(cur), label });
				cur.setMonth(cur.getMonth() + 1);
			}
		} else {
			const startQ = Math.floor(start.getMonth() / 3) * 3;
			const cur = new Date(start.getFullYear(), startQ, 1);
			if (cur < start) cur.setMonth(cur.getMonth() + 3);
			while (cur <= end) {
				const label =
					cur.getMonth() === 0 ? `${cur.getFullYear()}` : fmtMonth(cur);
				out.push({ x: tickX(cur), label });
				cur.setMonth(cur.getMonth() + 3);
			}
		}
		return out;
	});
</script>

<div class="lt-evt" role="img" aria-label="event history timeline">
	<div class="lt-evt__plot">
		<div class="lt-evt__axis"></div>
		{#each ticks as t, i (i)}
			<span class="lt-evt__tick" style:left="{t.x}%"></span>
		{/each}
		{#each marks as m (m.id)}
			<span
				class="lt-evt__mark"
				class:highlight={m.highlight}
				style:left="{m.x}%"
				title={m.highlight ? `${m.title} (this event)` : m.title}
			></span>
		{/each}
		<span class="lt-evt__now" title="today"></span>
	</div>
	<div class="lt-evt__labels">
		{#each ticks as t, i (i)}
			{@const anchor = t.x < 6 ? "start" : t.x > 94 ? "end" : "mid"}
			<span
				class="lt-evt__label lt-evt__label--{anchor}"
				style:left="{t.x}%"
			>
				{t.label}
			</span>
		{/each}
	</div>
</div>

<style>
	.lt-evt {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.65rem;
		line-height: 1;
	}
	.lt-evt__plot {
		position: relative;
		width: 100%;
		height: 22px;
	}
	.lt-evt__axis {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--text-faint);
		opacity: 0.55;
	}
	.lt-evt__tick {
		position: absolute;
		top: 14px;
		width: 1px;
		height: 5px;
		background: var(--text-muted);
		opacity: 0.7;
		transform: translateX(-0.5px);
	}
	.lt-evt__mark {
		position: absolute;
		top: 4px;
		width: 2px;
		height: 9px;
		border-radius: 1px;
		background: var(--text-muted);
		transform: translateX(-1px);
	}
	.lt-evt__mark.highlight {
		top: 1px;
		width: 4px;
		height: 15px;
		border-radius: 2px;
		background: var(--interactive-accent);
		transform: translateX(-2px);
		z-index: 1;
		box-shadow: 0 0 0 2px var(--background-primary);
	}
	.lt-evt__now {
		position: absolute;
		top: 1px;
		bottom: 0;
		right: 0;
		width: 1px;
		background: var(--text-normal);
		opacity: 0.45;
	}
	.lt-evt__labels {
		position: relative;
		width: 100%;
		height: 12px;
	}
	.lt-evt__label {
		position: absolute;
		top: 0;
		color: var(--text-faint);
		white-space: nowrap;
		pointer-events: none;
	}
	.lt-evt__label--mid {
		transform: translateX(-50%);
	}
	.lt-evt__label--start {
		transform: translateX(0);
	}
	.lt-evt__label--end {
		transform: translateX(-100%);
	}
</style>
