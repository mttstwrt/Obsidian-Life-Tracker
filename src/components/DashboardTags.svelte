<script lang="ts">
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import { aggregateTagTimeline } from "../data/tagTimeline";
	import TagTimeline from "./charts/TagTimeline.svelte";

	let {
		definitions,
		eventsByDefinition,
		now,
	}: {
		definitions: Definition[];
		eventsByDefinition: Map<string, TrackerEvent[]>;
		now: Date;
	} = $props();

	type WindowKey = "30" | "90" | "180" | "365";
	let windowKey: WindowKey = $state("90");
	const windowOptions: { value: WindowKey; label: string }[] = [
		{ value: "30", label: "30d" },
		{ value: "90", label: "90d" },
		{ value: "180", label: "6mo" },
		{ value: "365", label: "1yr" },
	];

	const windowDays = $derived(parseInt(windowKey, 10));

	const anyTags = $derived(definitions.some((d) => d.tags.length > 0));

	const tracks = $derived(
		aggregateTagTimeline(definitions, eventsByDefinition, now, windowDays),
	);

	const totalEvents = $derived(tracks.reduce((s, t) => s + t.total, 0));
</script>

<div class="lt-tags">
	<div class="lt-tags__head">
		<p class="lt-tags__intro">
			Each lane rolls up every event whose definition carries that tag, plotted
			by day. Darker marks mean busier days.
		</p>
		<div class="lt-tags__seg" role="tablist" aria-label="Timeline window">
			{#each windowOptions as opt (opt.value)}
				<button
					type="button"
					role="tab"
					aria-selected={windowKey === opt.value}
					class="lt-tags__seg-btn"
					class:active={windowKey === opt.value}
					onclick={() => (windowKey = opt.value)}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</div>

	{#if !anyTags}
		<p class="lt-tags__empty">
			No tags yet. Add tags to a definition (in its form) to group activity
			here.
		</p>
	{:else if tracks.length === 0}
		<p class="lt-tags__empty">No tagged activity in the last {windowDays} days.</p>
	{:else}
		<div class="lt-tags__meta">
			{tracks.length} tag{tracks.length === 1 ? "" : "s"} ·
			{totalEvents} tagged event{totalEvents === 1 ? "" : "s"}
		</div>
		<TagTimeline {tracks} {now} {windowDays} />
	{/if}
</div>

<style>
	.lt-tags {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.lt-tags__head {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.lt-tags__intro {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
		max-width: 38rem;
	}
	.lt-tags__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-tags__meta {
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.lt-tags__seg {
		display: inline-flex;
		gap: 0.15rem;
		padding: 0.15rem;
		background: var(--background-primary);
		border-radius: 0.35rem;
		flex-wrap: wrap;
		flex-shrink: 0;
	}
	.lt-tags__seg-btn {
		padding: 0.25rem 0.55rem;
		font-size: 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.lt-tags__seg-btn:hover {
		color: var(--text-normal);
		background: var(--background-modifier-hover);
	}
	.lt-tags__seg-btn.active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
</style>
