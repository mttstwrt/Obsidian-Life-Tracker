<script lang="ts">
	let {
		daysSince,
		milestones,
		personalBest,
	}: {
		daysSince: number | null;
		milestones: number[];
		personalBest: number;
	} = $props();

	const sorted = $derived(
		(milestones ?? [])
			.filter((m) => Number.isFinite(m) && m > 0)
			.slice()
			.sort((a, b) => a - b),
	);

	const scaleMax = $derived(
		Math.max(
			personalBest > 0 ? personalBest * 1.1 : 0,
			daysSince ?? 0,
			sorted[sorted.length - 1] ?? 0,
			1,
		),
	);

	function pct(n: number): number {
		return Math.min(100, Math.max(0, (n / scaleMax) * 100));
	}
</script>

<div class="lt-mile" role="img" aria-label="milestone progress">
	<div class="lt-mile__track">
		{#if daysSince !== null}
			<div class="lt-mile__fill" style="width: {pct(daysSince)}%"></div>
		{/if}
		{#each sorted as m (m)}
			<span
				class="lt-mile__mark"
				class:passed={daysSince !== null && daysSince >= m}
				style="left: {pct(m)}%"
				title="{m} day milestone"
			></span>
			<span class="lt-mile__mark-label" style="left: {pct(m)}%">{m}d</span>
		{/each}
		{#if personalBest > 0 && (daysSince === null || personalBest > daysSince)}
			<span
				class="lt-mile__pb"
				style="left: {pct(personalBest)}%"
				title="personal best"
			></span>
		{/if}
	</div>
</div>

<style>
	.lt-mile {
		width: 100%;
	}
	.lt-mile__track {
		position: relative;
		width: 100%;
		height: 22px;
		background: var(--background-modifier-hover);
		border-radius: 0.25rem;
		overflow: visible;
	}
	.lt-mile__fill {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		background: var(--interactive-accent);
		opacity: 0.55;
		border-radius: 0.25rem 0 0 0.25rem;
	}
	.lt-mile__mark {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--text-muted);
		transform: translateX(-1px);
	}
	.lt-mile__mark.passed {
		background: var(--text-success, var(--interactive-accent));
	}
	.lt-mile__mark-label {
		position: absolute;
		bottom: -14px;
		font-size: 0.65rem;
		color: var(--text-faint);
		transform: translateX(-50%);
	}
	.lt-mile__pb {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: var(--text-warning);
		transform: translateX(-1px);
	}
</style>
