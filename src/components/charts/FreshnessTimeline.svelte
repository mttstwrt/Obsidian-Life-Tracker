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

	function colorFor(tone: Tone): string {
		if (tone === "bad") return "var(--text-error)";
		if (tone === "warn") return "var(--text-warning)";
		return "var(--text-success, var(--interactive-accent))";
	}
</script>

<div class="lt-fresh" role="img" aria-label="last {windowDays} days timeline">
	<div class="lt-fresh__track"></div>
	{#each segments as s, i (i)}
		<div
			class="lt-fresh__seg"
			style:left="{s.start}%"
			style:width="{Math.max(0, s.end - s.start)}%"
			style:background={colorFor(s.tone)}
		></div>
	{/each}
	{#if dueX >= 0}
		<span
			class="lt-fresh__due"
			style:left="{dueX}%"
			title="next due ({intervalDays}d after last)"
		></span>
	{/if}
	{#each marks as m, i (i)}
		<span
			class="lt-fresh__mark"
			class:overdue={m.overdue}
			style:left="{m.x}%"
			title={m.overdue ? `${m.date} (gap exceeded interval)` : m.date}
		></span>
	{/each}
	<span class="lt-fresh__now" title="today"></span>
</div>

<style>
	.lt-fresh {
		position: relative;
		width: 100%;
		height: 22px;
		margin-top: 0.2rem;
	}
	.lt-fresh__track {
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 6px;
		transform: translateY(-50%);
		background: var(--background-modifier-hover);
		border-radius: 3px;
	}
	.lt-fresh__seg {
		position: absolute;
		top: 50%;
		height: 6px;
		transform: translateY(-50%);
		opacity: 0.55;
		border-radius: 3px;
	}
	.lt-fresh__mark {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--interactive-accent);
		border: 1px solid var(--background-primary);
		box-sizing: content-box;
	}
	.lt-fresh__mark.overdue {
		background: var(--text-error);
	}
	.lt-fresh__due {
		position: absolute;
		top: 2px;
		bottom: 2px;
		width: 2px;
		transform: translateX(-1px);
		background: var(--text-muted);
		opacity: 0.7;
	}
	.lt-fresh__now {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0;
		width: 2px;
		background: var(--text-faint);
	}
</style>
