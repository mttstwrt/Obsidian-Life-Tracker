<script lang="ts">
	import { maintenanceTimeline } from "../../data/visualizations";
	import type { Event } from "../../data/types";

	type Tone = "ok" | "warn" | "bad";
	type Status = "never" | "ok" | "approaching" | "overdue";

	let {
		events,
		now,
		intervalDays,
		windowDays = 90,
		status = "ok",
	}: {
		events: Event[];
		now: Date;
		intervalDays: number;
		windowDays?: number;
		status?: Status;
	} = $props();

	const MS_PER_DAY = 24 * 60 * 60 * 1000;

	function startOfDay(d: Date): Date {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate());
	}

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

	const marks = $derived(
		maintenanceTimeline(events, now, intervalDays, windowDays),
	);

	const segments = $derived.by(() => {
		const segs: { start: number; end: number; tone: Tone }[] = [];
		const ms = marks;
		if (ms.length === 0) return segs;
		for (let i = 1; i < ms.length; i++) {
			segs.push({
				start: ms[i - 1].x,
				end: ms[i].x,
				tone: ms[i].overdue ? "bad" : "ok",
			});
		}
		const last = ms[ms.length - 1];
		const tailTone: Tone =
			status === "overdue"
				? "bad"
				: status === "approaching"
					? "warn"
					: "ok";
		segs.push({ start: last.x, end: 100, tone: tailTone });
		return segs;
	});

	const dueX = $derived.by(() => {
		const ms = marks;
		if (ms.length === 0) return -1;
		const last = ms[ms.length - 1];
		if (windowDays <= 0) return -1;
		const x = last.x + (intervalDays / windowDays) * 100;
		return x > 0 && x < 100 ? x : -1;
	});

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

		if (windowDays <= 30) {
			// Weekly Mondays as major ticks; daily minor ticks.
			const cur = new Date(start);
			while (cur <= end) {
				const isMonday = cur.getDay() === 1;
				out.push({
					x: dateToX(cur),
					label: isMonday ? fmtMonDay(cur) : "",
					major: isMonday,
				});
				cur.setDate(cur.getDate() + 1);
			}
		} else if (windowDays <= 120) {
			// Weekly major ticks, no minor ticks.
			const cur = new Date(start);
			while (cur.getDay() !== 1 && cur <= end) {
				cur.setDate(cur.getDate() + 1);
			}
			while (cur <= end) {
				out.push({ x: dateToX(cur), label: fmtMonDay(cur), major: true });
				cur.setDate(cur.getDate() + 7);
			}
		} else if (windowDays <= 400) {
			// Monthly first-of-month major ticks.
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
			// Quarterly first-of-quarter major ticks; January gets year tag.
			const startQ = Math.floor(start.getMonth() / 3) * 3;
			const cur = new Date(start.getFullYear(), startQ, 1);
			if (cur < start) cur.setMonth(cur.getMonth() + 3);
			while (cur <= end) {
				const label =
					cur.getMonth() === 0
						? `${cur.getFullYear()}`
						: fmtMonth(cur);
				out.push({ x: dateToX(cur), label, major: true });
				cur.setMonth(cur.getMonth() + 3);
			}
		}

		return out;
	});

	function colorFor(tone: Tone): string {
		if (tone === "bad") return "var(--text-error)";
		if (tone === "warn") return "var(--text-warning)";
		return "var(--text-success, var(--interactive-accent))";
	}
</script>

<div
	class="lt-fresh"
	role="img"
	aria-label="maintenance timeline, last {windowDays} days"
>
	<div class="lt-fresh__plot">
		<div class="lt-fresh__axis"></div>

		{#each segments as s, i (i)}
			<div
				class="lt-fresh__band"
				style:left="{s.start}%"
				style:width="{Math.max(0, s.end - s.start)}%"
				style:background={colorFor(s.tone)}
			></div>
		{/each}

		{#each ticks as t, i (i)}
			<span
				class="lt-fresh__tick"
				class:major={t.major}
				style:left="{t.x}%"
			></span>
		{/each}

		{#each marks as m, i (i)}
			<span
				class="lt-fresh__mark"
				class:overdue={m.overdue}
				style:left="{m.x}%"
				title={m.overdue ? `${m.date} (gap exceeded interval)` : m.date}
			></span>
		{/each}

		{#if dueX >= 0}
			<span
				class="lt-fresh__due"
				style:left="{dueX}%"
				title="next due ({intervalDays}d after last)"
			></span>
		{/if}

		<span class="lt-fresh__now" title="today"></span>
	</div>

	<div class="lt-fresh__labels">
		{#each ticks as t, i (i)}
			{#if t.label}
				{@const anchor =
					t.x < 6 ? "start" : t.x > 94 ? "end" : "mid"}
				<span
					class="lt-fresh__label lt-fresh__label--{anchor}"
					class:major={t.major}
					style:left="{t.x}%"
				>
					{t.label}
				</span>
			{/if}
		{/each}
	</div>
</div>

<style>
	.lt-fresh {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.65rem;
		line-height: 1;
	}
	.lt-fresh__plot {
		position: relative;
		width: 100%;
		height: 24px;
	}
	.lt-fresh__axis {
		position: absolute;
		top: 10px;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--text-faint);
		opacity: 0.55;
	}
	.lt-fresh__band {
		position: absolute;
		top: 12px;
		height: 3px;
		opacity: 0.55;
		border-radius: 1.5px;
	}
	.lt-fresh__tick {
		position: absolute;
		top: 16px;
		width: 1px;
		height: 3px;
		background: var(--text-faint);
		opacity: 0.6;
		transform: translateX(-0.5px);
	}
	.lt-fresh__tick.major {
		top: 16px;
		height: 6px;
		background: var(--text-muted);
		opacity: 0.85;
	}
	.lt-fresh__mark {
		position: absolute;
		top: 2px;
		left: 0;
		transform: translateX(-50%);
		width: 2px;
		height: 9px;
		border-radius: 1px;
		background: var(--interactive-accent);
		z-index: 1;
	}
	.lt-fresh__mark.overdue {
		background: var(--text-error);
	}
	.lt-fresh__due {
		position: absolute;
		top: 2px;
		bottom: 0;
		width: 0;
		border-left: 1px dashed var(--text-muted);
		opacity: 0.7;
	}
	.lt-fresh__now {
		position: absolute;
		top: 2px;
		bottom: 0;
		right: 0;
		width: 1px;
		background: var(--text-normal);
		opacity: 0.5;
	}
	.lt-fresh__labels {
		position: relative;
		width: 100%;
		height: 12px;
	}
	.lt-fresh__label {
		position: absolute;
		top: 0;
		color: var(--text-faint);
		white-space: nowrap;
		pointer-events: none;
	}
	.lt-fresh__label--mid {
		transform: translateX(-50%);
	}
	.lt-fresh__label--start {
		transform: translateX(0);
	}
	.lt-fresh__label--end {
		transform: translateX(-100%);
	}
	.lt-fresh__label.major {
		color: var(--text-muted);
	}
</style>
