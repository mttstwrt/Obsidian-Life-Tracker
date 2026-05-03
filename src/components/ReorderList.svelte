<script lang="ts">
	import type { ReorderItem } from "../views/ReorderModal";

	let {
		items,
		onSave,
		onCancel,
	}: {
		items: ReorderItem[];
		onSave: (orderedIds: string[]) => void;
		onCancel: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let order: ReorderItem[] = $state([...items]);
	let draggingIndex: number | null = $state(null);

	function move(from: number, to: number) {
		if (to < 0 || to >= order.length || from === to) return;
		const next = [...order];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		order = next;
	}

	function onDragStart(e: DragEvent, i: number) {
		draggingIndex = i;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", String(i));
		}
	}

	function onDragOver(e: DragEvent, i: number) {
		if (draggingIndex === null || draggingIndex === i) return;
		e.preventDefault();
		move(draggingIndex, i);
		draggingIndex = i;
	}

	function onDragEnd() {
		draggingIndex = null;
	}

	function save() {
		onSave(order.map((x) => x.id));
	}
</script>

<div class="lt-reorder">
	{#if order.length === 0}
		<p class="lt-reorder__empty">Nothing to reorder yet.</p>
	{:else}
		<ol class="lt-reorder__list">
			{#each order as item, i (item.id)}
				<li
					class="lt-reorder__row"
					class:lt-reorder__row--dragging={draggingIndex === i}
					draggable="true"
					ondragstart={(e) => onDragStart(e, i)}
					ondragover={(e) => onDragOver(e, i)}
					ondragend={onDragEnd}
				>
					<span class="lt-reorder__handle" aria-hidden="true">⋮⋮</span>
					{#if item.emoji}
						<span class="lt-reorder__emoji">{item.emoji}</span>
					{/if}
					<span class="lt-reorder__label">
						<span class="lt-reorder__name">{item.label}</span>
						{#if item.hint}
							<span class="lt-reorder__hint">{item.hint}</span>
						{/if}
					</span>
					<span class="lt-reorder__arrows">
						<button
							type="button"
							class="lt-reorder__arrow"
							aria-label="Move up"
							disabled={i === 0}
							onclick={() => move(i, i - 1)}
						>
							▲
						</button>
						<button
							type="button"
							class="lt-reorder__arrow"
							aria-label="Move down"
							disabled={i === order.length - 1}
							onclick={() => move(i, i + 1)}
						>
							▼
						</button>
					</span>
				</li>
			{/each}
		</ol>
	{/if}

	<div class="lt-reorder__actions">
		<button type="button" class="lt-reorder__cancel" onclick={onCancel}>
			Cancel
		</button>
		<button
			type="button"
			class="lt-reorder__save"
			disabled={order.length === 0}
			onclick={save}
		>
			Save order
		</button>
	</div>
</div>

<style>
	.lt-reorder {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.lt-reorder__empty {
		color: var(--text-muted);
		font-style: italic;
		margin: 0;
	}
	.lt-reorder__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.lt-reorder__row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.5rem;
		border-radius: 0.4rem;
		background: var(--background-secondary);
		border: 1px solid transparent;
		cursor: grab;
		user-select: none;
	}
	.lt-reorder__row:active {
		cursor: grabbing;
	}
	.lt-reorder__row--dragging {
		opacity: 0.5;
		border-color: var(--interactive-accent);
	}
	.lt-reorder__handle {
		color: var(--text-faint);
		font-size: 0.9rem;
		letter-spacing: -2px;
		flex-shrink: 0;
	}
	.lt-reorder__emoji {
		font-size: 1.1rem;
		flex-shrink: 0;
	}
	.lt-reorder__label {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.lt-reorder__name {
		overflow-wrap: anywhere;
	}
	.lt-reorder__hint {
		font-size: 0.7rem;
		color: var(--text-faint);
		text-transform: uppercase;
	}
	.lt-reorder__arrows {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex-shrink: 0;
	}
	.lt-reorder__arrow {
		min-width: 1.8rem;
		min-height: 1.4rem;
		padding: 0 0.4rem;
		font-size: 0.7rem;
		line-height: 1;
		border: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
		border-radius: 0.25rem;
		cursor: pointer;
	}
	.lt-reorder__arrow:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.lt-reorder__actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.lt-reorder__save {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
</style>
