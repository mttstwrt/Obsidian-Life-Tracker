<script lang="ts">
	import { buildHeatmapBuckets } from "../../data/visualizations";
	import type { Event } from "../../data/types";

	let {
		events,
		now,
		days = 90,
		cell = 10,
		gap = 2,
		title,
		onCellClick,
	}: {
		events: Event[];
		now: Date;
		days?: number;
		cell?: number;
		gap?: number;
		title?: string;
		onCellClick?: (date: string) => void;
	} = $props();

	const buckets = $derived(buildHeatmapBuckets(events, now, days));

	const maxCount = $derived(buckets.reduce((m, b) => Math.max(m, b.count), 0));

	// columns are weeks (Mon-start). compute layout: rows=7, cols=ceil(days/7)+spill
	const layout = $derived.by(() => {
		const cols: { x: number; cells: { y: number; bucket: typeof buckets[number] }[] }[] = [];
		// Anchor rightmost column at "now" week.
		// Walk dates left→right but group into Mon-Sun columns.
		let currentCol: { x: number; cells: { y: number; bucket: typeof buckets[number] }[] } | null = null;
		let colIndex = 0;
		const dowToRow = (dow: number) => (dow === 0 ? 6 : dow - 1); // Mon=0, Sun=6
		for (let i = 0; i < buckets.length; i++) {
			const b = buckets[i];
			const date = new Date(`${b.date}T12:00:00`);
			const row = dowToRow(date.getDay());
			if (row === 0 || currentCol === null) {
				currentCol = { x: colIndex * (cell + gap), cells: [] };
				cols.push(currentCol);
				colIndex += 1;
			}
			currentCol.cells.push({ y: row * (cell + gap), bucket: b });
		}
		const width = colIndex * (cell + gap);
		const height = 7 * (cell + gap);
		return { cols, width, height };
	});

	function intensity(c: number): number {
		if (maxCount === 0 || c === 0) return 0;
		return Math.min(1, c / maxCount);
	}

	function fill(c: number): string {
		if (c === 0) return "var(--background-modifier-hover)";
		const i = intensity(c);
		// blend between two CSS vars by alpha; simple approach: use accent with opacity
		return `color-mix(in srgb, var(--interactive-accent) ${Math.round(20 + i * 80)}%, transparent)`;
	}
</script>

<div class="lt-heat" aria-label={title ?? `${days}-day activity heatmap`}>
	{#if title}
		<div class="lt-heat__title">{title}</div>
	{/if}
	<svg
		role="img"
		aria-hidden={title ? "false" : "true"}
		viewBox="0 0 {layout.width} {layout.height}"
		width={layout.width}
		height={layout.height}
	>
		{#each layout.cols as col (col.x)}
			{#each col.cells as c (c.bucket.date)}
				{#if onCellClick}
					<rect
						x={col.x}
						y={c.y}
						width={cell}
						height={cell}
						rx="1.5"
						fill={fill(c.bucket.count)}
						class="lt-heat__cell lt-heat__cell--button"
						role="button"
						tabindex="0"
						aria-label="{c.bucket.count} events on {c.bucket.date}"
						onclick={() => onCellClick?.(c.bucket.date)}
						onkeydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onCellClick?.(c.bucket.date);
							}
						}}
					>
						<title>{c.bucket.count} on {c.bucket.date}</title>
					</rect>
				{:else}
					<rect
						x={col.x}
						y={c.y}
						width={cell}
						height={cell}
						rx="1.5"
						fill={fill(c.bucket.count)}
						class="lt-heat__cell"
					>
						<title>{c.bucket.count} on {c.bucket.date}</title>
					</rect>
				{/if}
			{/each}
		{/each}
	</svg>
</div>

<style>
	.lt-heat {
		display: inline-flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.lt-heat__title {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.lt-heat__cell--button {
		cursor: pointer;
	}
	.lt-heat__cell--button:hover {
		stroke: var(--interactive-accent);
		stroke-width: 1;
	}
</style>
