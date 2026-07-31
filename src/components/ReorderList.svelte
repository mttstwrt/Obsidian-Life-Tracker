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
	let listEl: HTMLOListElement | null = $state(null);

	function move(from: number, to: number) {
		if (to < 0 || to >= order.length || from === to) return;
		const next = [...order];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		order = next;
	}

	/**
	 * Index of the row currently under the pointer, or null when it's past
	 * either end of the list. Measured off the live DOM rather than a cached
	 * rect list because rows shift as the drag reorders them.
	 */
	function indexAtY(y: number): number | null {
		if (!listEl) return null;
		const rows = listEl.querySelectorAll<HTMLElement>(".lt-reorder__row");
		for (let i = 0; i < rows.length; i++) {
			const rect = rows[i].getBoundingClientRect();
			if (y >= rect.top && y <= rect.bottom) return i;
		}
		return null;
	}

	// Pointer events rather than HTML5 drag-and-drop: dragstart/dragover never
	// fire in Obsidian's mobile webview, so the old handlers made this desktop
	// only. Pointer events cover mouse and touch through one code path.
	function onPointerDown(e: PointerEvent, i: number) {
		if (e.button > 0) return;
		const target = e.target as HTMLElement;
		if (target.closest("button")) return; // let the arrows do their own thing
		// Touch drags start from the handle only, so a finger anywhere else on a
		// row still scrolls the list instead of hijacking it into a reorder.
		if (e.pointerType !== "mouse" && !target.closest(".lt-reorder__handle")) {
			return;
		}
		draggingIndex = i;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (draggingIndex === null) return;
		e.preventDefault();
		const target = indexAtY(e.clientY);
		if (target === null || target === draggingIndex) return;
		move(draggingIndex, target);
		draggingIndex = target;
	}

	function onPointerUp(e: PointerEvent) {
		if (draggingIndex === null) return;
		const el = e.currentTarget as HTMLElement;
		if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
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
		<ol class="lt-reorder__list" bind:this={listEl}>
			{#each order as item, i (item.id)}
				<li
					class="lt-reorder__row"
					class:lt-reorder__row--dragging={draggingIndex === i}
					onpointerdown={(e) => onPointerDown(e, i)}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointercancel={onPointerUp}
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
		/* Suppress the long-press callout/selection bubble on iOS mid-drag. */
		-webkit-user-select: none;
		-webkit-touch-callout: none;
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
		/* Keep the webview from claiming the gesture as a scroll before the
		   pointermove handlers ever see it. */
		touch-action: none;
		/* Thumb-sized grab target; the glyph itself is only a few px wide. */
		min-width: 1.9rem;
		min-height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: -0.45rem 0 -0.45rem -0.5rem;
		cursor: grab;
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
