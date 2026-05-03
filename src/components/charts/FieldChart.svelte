<script lang="ts">
	import {
		fieldDistribution,
		numericFieldSeries,
		numericStats,
	} from "../../data/visualizations";
	import type { Event, FieldDef } from "../../data/types";
	import BarChart from "./BarChart.svelte";
	import Sparkline from "./Sparkline.svelte";

	let {
		events,
		field,
	}: {
		events: Event[];
		field: FieldDef;
	} = $props();

	const isNumeric = $derived(field.type === "number");
	const series = $derived(isNumeric ? numericFieldSeries(events, field.key) : []);
	const stats = $derived(numericStats(series));
	const distribution = $derived(
		!isNumeric ? fieldDistribution(events, field).slice(0, 8) : [],
	);

	const errorCount = $derived.by(() => {
		let n = 0;
		for (const e of events) {
			if (e.fields[field.key]?.coercionError) n += 1;
		}
		return n;
	});

	function fmt(n: number): string {
		if (Number.isInteger(n)) return String(n);
		return n.toFixed(2);
	}
</script>

<div class="lt-field">
	<div class="lt-field__head">
		<span class="lt-field__key">{field.prompt ?? field.key}</span>
		<span class="lt-field__type">· {field.type}</span>
		{#if errorCount > 0}
			<span class="lt-field__warn" title="{errorCount} coercion errors">
				⚠ {errorCount}
			</span>
		{/if}
	</div>

	{#if isNumeric}
		{#if stats}
			<div class="lt-field__row">
				<Sparkline values={series.map((p) => p.value)} width={140} height={28} />
				<div class="lt-field__stats">
					<div>avg <strong>{fmt(stats.mean)}</strong></div>
					<div>min {fmt(stats.min)} · max {fmt(stats.max)}</div>
					<div class="lt-field__n">n={stats.count}</div>
				</div>
			</div>
		{:else}
			<div class="lt-field__empty">no numeric data yet</div>
		{/if}
	{:else if distribution.length > 0}
		<BarChart bars={distribution} width={220} height={64} />
	{:else}
		<div class="lt-field__empty">no values yet</div>
	{/if}
</div>

<style>
	.lt-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.4rem 0.5rem;
		background: var(--background-secondary);
		border-radius: 0.3rem;
	}
	.lt-field__head {
		display: flex;
		gap: 0.35rem;
		align-items: baseline;
		font-size: 0.85rem;
	}
	.lt-field__key {
		font-weight: 500;
	}
	.lt-field__type {
		color: var(--text-faint);
	}
	.lt-field__warn {
		margin-left: auto;
		color: var(--text-warning);
		font-size: 0.75rem;
	}
	.lt-field__row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.lt-field__stats {
		font-size: 0.8rem;
		color: var(--text-muted);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.lt-field__n {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
	.lt-field__empty {
		font-size: 0.8rem;
		color: var(--text-faint);
		font-style: italic;
	}
</style>
