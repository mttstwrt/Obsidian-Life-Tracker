<script lang="ts">
	let {
		bars,
		width = 220,
		height = 80,
		barColor = "var(--interactive-accent)",
		showLabels = true,
		title,
	}: {
		bars: { label: string; count: number }[];
		width?: number;
		height?: number;
		barColor?: string;
		showLabels?: boolean;
		title?: string;
	} = $props();

	const max = $derived(bars.reduce((m, b) => Math.max(m, b.count), 0));
	const labelHeight = 14;
	const barAreaHeight = $derived(showLabels ? height - labelHeight : height);
	const slot = $derived(bars.length > 0 ? width / bars.length : 0);
	const barWidth = $derived(Math.max(2, slot * 0.7));
</script>

{#if bars.length > 0}
	<div class="lt-bar" aria-label={title}>
		{#if title}
			<div class="lt-bar__title">{title}</div>
		{/if}
		<svg
			viewBox="0 0 {width} {height}"
			width={width}
			height={height}
			role="img"
			aria-label={title ?? "bar chart"}
		>
			{#each bars as b, i (b.label + i)}
				{@const h = max === 0 ? 0 : (b.count / max) * (barAreaHeight - 2)}
				{@const x = i * slot + (slot - barWidth) / 2}
				{@const y = barAreaHeight - h}
				<rect x={x} y={y} width={barWidth} height={h} rx="1.5" fill={barColor}>
					<title>{b.label}: {b.count}</title>
				</rect>
				{#if showLabels}
					<text
						x={i * slot + slot / 2}
						y={height - 2}
						text-anchor="middle"
						font-size="9"
						fill="currentColor"
						opacity="0.65"
					>
						{b.label}
					</text>
				{/if}
			{/each}
		</svg>
	</div>
{:else}
	<span class="lt-bar__empty">no data</span>
{/if}

<style>
	.lt-bar {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.lt-bar__title {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.lt-bar__empty {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
</style>
