<script lang="ts">
	import { Menu } from "obsidian";
	import type LifeTrackerPlugin from "../main";
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import {
		aggregateTagTimeline,
		type TagDayBucket,
		tagCoOccurrences,
	} from "../data/tagTimeline";
	import TagTimeline from "./charts/TagTimeline.svelte";
	import TagCoOccurrence from "./charts/TagCoOccurrence.svelte";

	let {
		definitions,
		eventsByDefinition,
		now,
		plugin,
	}: {
		definitions: Definition[];
		eventsByDefinition: Map<string, TrackerEvent[]>;
		now: Date;
		plugin: LifeTrackerPlugin;
	} = $props();

	let selectedTag: string | null = $state(null);

	const defById = $derived(new Map(definitions.map((d) => [d.id, d])));

	const eventIndex = $derived.by(() => {
		const idx = new Map<string, Map<string, TrackerEvent>>();
		for (const [defId, list] of eventsByDefinition) {
			const inner = new Map<string, TrackerEvent>();
			for (const ev of list) inner.set(ev.id, ev);
			idx.set(defId, inner);
		}
		return idx;
	});

	function handleTagClick(tag: string) {
		selectedTag = selectedTag === tag ? null : tag;
	}

	function handleMarkClick(day: TagDayBucket, event: MouseEvent) {
		const resolved = day.events.flatMap((ref) => {
			const def = defById.get(ref.definitionId);
			const ev = eventIndex.get(ref.definitionId)?.get(ref.eventId);
			return def && ev ? [{ def, ev, ref }] : [];
		});
		if (resolved.length === 0) return;
		if (resolved.length === 1) {
			void plugin.openEventDetail(resolved[0].def, resolved[0].ev);
			return;
		}
		const menu = new Menu();
		for (const { def, ev, ref } of resolved) {
			menu.addItem((item) => {
				const emoji = ref.emoji ? `${ref.emoji} ` : "";
				item
					.setTitle(`${ref.time}  ${emoji}${ref.definitionName}`)
					.onClick(() => void plugin.openEventDetail(def, ev));
			});
		}
		menu.showAtMouseEvent(event);
	}

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

	const displayTracks = $derived(
		selectedTag ? tracks.filter((t) => t.tag === selectedTag) : tracks,
	);

	const totalEvents = $derived(tracks.reduce((s, t) => s + t.total, 0));

	const coPairs = $derived(tagCoOccurrences(tracks));

	const coPairsShown = $derived(
		(selectedTag
			? coPairs.filter((p) => p.a === selectedTag || p.b === selectedTag)
			: coPairs
		).slice(0, 12),
	);
</script>

<div class="lt-tags">
	<div class="lt-tags__head">
		<p class="lt-tags__intro">
			Each lane rolls up every event whose definition carries that tag, plotted
			by day. Darker marks mean busier days. Click a mark to open that day's
			event(s); click a tag to filter.
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
			{#if selectedTag}
				<span>Filtered to <strong>#{selectedTag}</strong></span>
				<button
					type="button"
					class="lt-tags__clear"
					onclick={() => (selectedTag = null)}
				>
					Show all
				</button>
			{:else}
				{tracks.length} tag{tracks.length === 1 ? "" : "s"} ·
				{totalEvents} tagged event{totalEvents === 1 ? "" : "s"}
			{/if}
		</div>
		{#if displayTracks.length === 0}
			<p class="lt-tags__empty">
				No <strong>#{selectedTag}</strong> activity in the last {windowDays}
				days.
				<button
					type="button"
					class="lt-tags__clear"
					onclick={() => (selectedTag = null)}
				>
					Show all
				</button>
			</p>
		{:else}
			<TagTimeline
				tracks={displayTracks}
				{now}
				{windowDays}
				{selectedTag}
				onTagClick={handleTagClick}
				onMarkClick={handleMarkClick}
			/>
		{/if}

		{#if coPairsShown.length > 0}
			<section class="lt-tags__co-panel">
				<h3 class="lt-tags__co-heading">
					{#if selectedTag}
						Fires together with #{selectedTag}
					{:else}
						Tags that fire together
					{/if}
				</h3>
				<TagCoOccurrence pairs={coPairsShown} onTagClick={handleTagClick} />
			</section>
		{/if}
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
	.lt-tags__co-panel {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		background: var(--background-secondary);
		border-radius: 0.4rem;
	}
	.lt-tags__co-heading {
		margin: 0;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	.lt-tags__meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.lt-tags__clear {
		padding: 0.1rem 0.45rem;
		font-size: 0.7rem;
		background: transparent;
		border: 1px solid var(--background-modifier-border);
		border-radius: 0.25rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.lt-tags__clear:hover {
		color: var(--text-normal);
		background: var(--background-modifier-hover);
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
