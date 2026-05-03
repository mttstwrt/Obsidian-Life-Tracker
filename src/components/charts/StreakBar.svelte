<script lang="ts">
	import { dateRange, eventsByDate } from "../../data/visualizations";
	import type { Event } from "../../data/types";

	let {
		events,
		now,
		days = 21,
	}: {
		events: Event[];
		now: Date;
		days?: number;
	} = $props();

	const counts = $derived(eventsByDate(events));
	const dates = $derived(dateRange(now, days));

	function isToday(iso: string): boolean {
		const t = now;
		const y = t.getFullYear();
		const m = String(t.getMonth() + 1).padStart(2, "0");
		const d = String(t.getDate()).padStart(2, "0");
		return iso === `${y}-${m}-${d}`;
	}
</script>

<div class="lt-streak" role="img" aria-label="last {days} days">
	{#each dates as d (d)}
		{@const c = counts.get(d) ?? 0}
		<span
			class="lt-streak__cell"
			class:has={c > 0}
			class:today={isToday(d)}
			title="{c} on {d}"
		></span>
	{/each}
</div>

<style>
	.lt-streak {
		display: inline-flex;
		gap: 2px;
		align-items: center;
	}
	.lt-streak__cell {
		display: inline-block;
		width: 8px;
		height: 12px;
		border-radius: 2px;
		background: var(--background-modifier-hover);
	}
	.lt-streak__cell.has {
		background: var(--interactive-accent);
	}
	.lt-streak__cell.today {
		outline: 1px solid var(--interactive-accent);
		outline-offset: 1px;
	}
</style>
