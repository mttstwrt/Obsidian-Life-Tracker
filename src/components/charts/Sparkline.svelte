<script lang="ts">
	import { sparklinePath } from "../../data/visualizations";

	let {
		values,
		width = 120,
		height = 28,
		stroke = "var(--interactive-accent)",
		fill = "none",
		title,
	}: {
		values: number[];
		width?: number;
		height?: number;
		stroke?: string;
		fill?: string;
		title?: string;
	} = $props();

	const sp = $derived(sparklinePath(values, width, height));
</script>

{#if sp}
	<svg
		class="lt-spark"
		viewBox="0 0 {sp.width} {sp.height}"
		width={sp.width}
		height={sp.height}
		role="img"
		aria-label={title ?? "trend"}
	>
		<path d={sp.d} fill={fill} stroke={stroke} stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
	</svg>
{:else}
	<span class="lt-spark__empty">no data</span>
{/if}

<style>
	.lt-spark {
		display: block;
	}
	.lt-spark__empty {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
</style>
