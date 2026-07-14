<script lang="ts">
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import type { TagDayEntry } from "../views/TagDayModal";

	let {
		entries,
		onLogDefinition,
		onOpenEvent,
	}: {
		entries: TagDayEntry[];
		onLogDefinition: (def: Definition) => void;
		onOpenEvent: (def: Definition, event: TrackerEvent) => void;
	} = $props();

	function eventLabel(event: TrackerEvent): string {
		const time = event.timestamp.includes("T")
			? event.timestamp.split("T")[1].slice(0, 5)
			: "";
		const parts = [time];
		if (event.value !== undefined) parts.push(String(event.value));
		if (event.note) parts.push(event.note);
		return parts.filter(Boolean).join(" · ") || "(event)";
	}
</script>

<div class="lt-tagday">
	{#if entries.length === 0}
		<p class="lt-tagday__empty">No definitions carry this tag.</p>
	{:else}
		{#each entries as entry (entry.definition.id)}
			<div class="lt-tagday__def">
				<button
					type="button"
					class="lt-tagday__def-button"
					onclick={() => onLogDefinition(entry.definition)}
				>
					<span class="lt-tagday__def-name">
						{#if entry.definition.emoji}{entry.definition.emoji}
						{/if}{entry.definition.displayName}
					</span>
					<span class="lt-tagday__hint">log / plan</span>
				</button>
				{#each entry.events as event (event.id)}
					<button
						type="button"
						class="lt-tagday__event"
						onclick={() => onOpenEvent(entry.definition, event)}
					>
						{eventLabel(event)}
					</button>
				{/each}
			</div>
		{/each}
	{/if}
</div>

<style>
	.lt-tagday {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-tagday__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-tagday__def {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.lt-tagday__def-button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		background: var(--background-modifier-hover);
		border: 1px solid transparent;
		border-radius: 0.35rem;
		padding: 0.45rem 0.6rem;
		font-size: 0.95rem;
		cursor: pointer;
		text-align: left;
	}
	.lt-tagday__def-button:hover {
		border-color: var(--interactive-accent);
	}
	.lt-tagday__def-name {
		font-weight: 600;
	}
	.lt-tagday__hint {
		font-size: 0.7rem;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lt-tagday__event {
		background: transparent;
		border: none;
		border-left: 2px solid var(--background-modifier-border);
		border-radius: 0;
		margin-left: 0.6rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		cursor: pointer;
		text-align: left;
	}
	.lt-tagday__event:hover {
		color: var(--text-normal);
		border-left-color: var(--interactive-accent);
	}
</style>
