<script lang="ts">
	import { startOfDay } from "../../data/dashboard";
	import type { TagDayBucket, TagTrack } from "../../data/tagTimeline";

	let {
		tracks,
		now,
		windowDays,
	}: {
		tracks: TagTrack[];
		now: Date;
		windowDays: number;
	} = $props();

	const MS_PER_DAY = 86_400_000;

	const todayStart = $derived(startOfDay(now));
	const windowStart = $derived.by(() => {
		const s = new Date(todayStart);
		s.setDate(s.getDate() - (windowDays - 1));
		return s;
	});
	const totalMs = $derived(windowDays * MS_PER_DAY);

	function dateToX(d: Date): number {
		return ((d.getTime() - windowStart.getTime()) / totalMs) * 100;
	}

	type Tick = { x: number; label: string; major: boolean };

	function fmtMonDay(d: Date): string {
		return d.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
	}
	function fmtMonth(d: Date): string {
		return d.toLocaleDateString(undefined, { month: "short" });
	}

	const ticks: Tick[] = $derived.by(() => {
		const out: Tick[] = [];
		const start = windowStart;
		const end = todayStart;

		if (windowDays <= 31) {
			// Weekly Mondays.
			const cur = new Date(start);
			while (cur.getDay() !== 1 && cur <= end) {
				cur.setDate(cur.getDate() + 1);
			}
			while (cur <= end) {
				out.push({ x: dateToX(cur), label: fmtMonDay(cur), major: true });
				cur.setDate(cur.getDate() + 7);
			}
		} else if (windowDays <= 120) {
			// Fortnightly Mondays.
			const cur = new Date(start);
			while (cur.getDay() !== 1 && cur <= end) {
				cur.setDate(cur.getDate() + 1);
			}
			while (cur <= end) {
				out.push({ x: dateToX(cur), label: fmtMonDay(cur), major: true });
				cur.setDate(cur.getDate() + 14);
			}
		} else if (windowDays <= 400) {
			// Monthly first-of-month; January gets the year.
			const cur = new Date(start.getFullYear(), start.getMonth(), 1);
			if (cur < start) cur.setMonth(cur.getMonth() + 1);
			while (cur <= end) {
				const label =
					cur.getMonth() === 0
						? `${fmtMonth(cur)} ${cur.getFullYear()}`
						: fmtMonth(cur);
				out.push({ x: dateToX(cur), label, major: true });
				cur.setMonth(cur.getMonth() + 1);
			}
		} else {
			// Quarterly; January shows the year only.
			const startQ = Math.floor(start.getMonth() / 3) * 3;
			const cur = new Date(start.getFullYear(), startQ, 1);
			if (cur < start) cur.setMonth(cur.getMonth() + 3);
			while (cur <= end) {
				const label =
					cur.getMonth() === 0 ? `${cur.getFullYear()}` : fmtMonth(cur);
				out.push({ x: dateToX(cur), label, major: true });
				cur.setMonth(cur.getMonth() + 3);
			}
		}
		return out;
	});

	function markOpacity(count: number, max: number): number {
		if (max <= 1) return 1;
		return 0.4 + 0.6 * (count / max);
	}

	const MAX_TITLE_EVENTS = 12;

	function markTitle(day: TagDayBucket): string {
		const header = `${day.date} · ${day.count} event${day.count === 1 ? "" : "s"}`;
		const lines = day.events.slice(0, MAX_TITLE_EVENTS).map((e) => {
			const emoji = e.emoji ? `${e.emoji} ` : "";
			const note = e.note ? ` — ${e.note}` : "";
			return `${e.time}  ${emoji}${e.definitionName}${note}`;
		});
		if (day.events.length > MAX_TITLE_EVENTS) {
			lines.push(`+${day.events.length - MAX_TITLE_EVENTS} more`);
		}
		return [header, ...lines].join("\n");
	}
</script>

<div class="lt-tt">
	<div class="lt-tt__axis-row">
		<div class="lt-tt__axis-spacer"></div>
		<div class="lt-tt__axis">
			{#each ticks as t, i (i)}
				<span class="lt-tt__tick" class:major={t.major} style:left="{t.x}%"
				></span>
			{/each}
			{#each ticks as t, i (i)}
				{#if t.label}
					{@const anchor = t.x < 6 ? "start" : t.x > 94 ? "end" : "mid"}
					<span
						class="lt-tt__tick-label lt-tt__tick-label--{anchor}"
						style:left="{t.x}%"
					>
						{t.label}
					</span>
				{/if}
			{/each}
		</div>
	</div>

	{#each tracks as track (track.tag)}
		<div class="lt-tt__row">
			<div class="lt-tt__label" title={track.tag}>
				<span class="lt-tt__tag">#{track.tag}</span>
				<span class="lt-tt__meta">
					{track.total}
					{#if track.definitionCount > 1}
						· {track.definitionCount} defs
					{/if}
				</span>
			</div>
			<div class="lt-tt__lane" role="img" aria-label="{track.tag}: {track.total} events">
				<div class="lt-tt__baseline"></div>
				{#each ticks as t, i (i)}
					<span class="lt-tt__gridline" style:left="{t.x}%"></span>
				{/each}
				{#each track.days as day (day.date)}
					<span
						class="lt-tt__mark"
						style:left="{day.x}%"
						style:opacity={markOpacity(day.count, track.maxDayCount)}
						title={markTitle(day)}
					></span>
				{/each}
				<span class="lt-tt__now" title="today"></span>
			</div>
		</div>
	{/each}
</div>

<style>
	.lt-tt {
		--lt-tt-label-w: 9rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
	}
	.lt-tt__axis-row,
	.lt-tt__row {
		display: grid;
		grid-template-columns: var(--lt-tt-label-w) 1fr;
		align-items: center;
		gap: 0.5rem;
	}
	.lt-tt__axis-spacer {
		min-width: 0;
	}
	.lt-tt__axis {
		position: relative;
		height: 14px;
	}
	.lt-tt__tick {
		position: absolute;
		bottom: 0;
		width: 1px;
		height: 4px;
		background: var(--text-faint);
		opacity: 0.6;
		transform: translateX(-0.5px);
	}
	.lt-tt__tick.major {
		height: 6px;
		background: var(--text-muted);
		opacity: 0.85;
	}
	.lt-tt__tick-label {
		position: absolute;
		top: 0;
		font-size: 0.65rem;
		color: var(--text-faint);
		white-space: nowrap;
		pointer-events: none;
	}
	.lt-tt__tick-label--mid {
		transform: translateX(-50%);
	}
	.lt-tt__tick-label--start {
		transform: translateX(0);
	}
	.lt-tt__tick-label--end {
		transform: translateX(-100%);
	}
	.lt-tt__label {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.15;
	}
	.lt-tt__tag {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lt-tt__meta {
		font-size: 0.65rem;
		color: var(--text-faint);
	}
	.lt-tt__lane {
		position: relative;
		height: 22px;
	}
	.lt-tt__baseline {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--background-modifier-border);
		transform: translateY(-0.5px);
	}
	.lt-tt__gridline {
		position: absolute;
		top: 2px;
		bottom: 2px;
		width: 1px;
		background: var(--text-faint);
		opacity: 0.12;
	}
	.lt-tt__mark {
		position: absolute;
		top: 3px;
		bottom: 3px;
		width: 3px;
		border-radius: 1.5px;
		background: var(--interactive-accent);
		transform: translateX(-1.5px);
	}
	.lt-tt__now {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0;
		width: 1px;
		background: var(--text-normal);
		opacity: 0.45;
	}
	@media (max-width: 600px) {
		.lt-tt {
			--lt-tt-label-w: 6rem;
		}
	}
</style>
