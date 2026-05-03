<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import {
		type CounterSummary,
		type DashboardSummaries,
		applyOrder,
	} from "../data/dashboard";
	import type { Event as TrackerEvent } from "../data/types";
	import { eventsByWeek } from "../data/visualizations";
	import Sparkline from "./charts/Sparkline.svelte";

	let {
		summaries,
		plugin,
		eventsByDefinition,
		now,
	}: {
		summaries: DashboardSummaries;
		plugin: LifeTrackerPlugin;
		eventsByDefinition: Map<string, TrackerEvent[]>;
		now: Date;
	} = $props();

	function weeklyTotals(c: CounterSummary): number[] {
		const list = eventsByDefinition.get(c.definition.id) ?? [];
		return eventsByWeek(list, now, 12).map((b) => b.count);
	}

	function hasTrend(c: CounterSummary): boolean {
		return weeklyTotals(c).some((n) => n > 0);
	}

	const counters = $derived(
		applyOrder(
			summaries.counters,
			plugin.settings.definitionOrder.counters ?? [],
			(c) => c.definition.id,
		),
	);

	function unitLabel(c: CounterSummary): string {
		const unit = c.definition.unit?.trim();
		return unit && unit.length > 0 ? unit : "";
	}

	function formatNumber(n: number): string {
		if (Number.isInteger(n)) return String(n);
		return n.toFixed(2);
	}
</script>

<div class="lt-counter">
	{#if counters.length === 0}
		<p class="lt-counter__empty">No counters yet.</p>
	{:else}
		<div class="lt-counter__toolbar">
			<button
				type="button"
				class="lt-reorder-trigger"
				title="Reorder counters"
				onclick={() => plugin.openReorderModal("counters")}
			>
				↕ Reorder
			</button>
		</div>
		<ul class="lt-counter__list">
			{#each counters as c (c.definition.id)}
				<li class="lt-counter__row">
					<button
						type="button"
						class="lt-counter__name"
						onclick={() => plugin.openLogModal(c.definition.id)}
					>
						<span class="lt-counter__emoji"
							>{c.definition.emoji ?? "•"}</span
						>
						<div class="lt-counter__main">
							<div class="lt-counter__title">
								{c.definition.displayName}
							</div>
							<div class="lt-counter__meta">
								{c.periodLabel}
								{#if c.definition.resetCadence && c.definition.resetCadence !== "never"}
									· total {formatNumber(c.total)}{#if unitLabel(c)}
										{" "}{unitLabel(c)}{/if}
								{/if}
							</div>
							<div class="lt-counter__value">
								{formatNumber(c.periodTotal)}
								{#if unitLabel(c)}
									<span class="lt-counter__unit">{unitLabel(c)}</span>
								{/if}
								{#if c.goal !== undefined}
									<span class="lt-counter__goal">
										/ {formatNumber(c.goal)}
									</span>
								{/if}
							</div>
							{#if c.progress !== undefined}
								<div class="lt-counter__bar">
									<div
										class="lt-counter__bar-fill"
										style="width: {Math.min(100, c.progress * 100)}%"
									></div>
								</div>
							{/if}
							{#if hasTrend(c)}
								<div class="lt-counter__trend">
									<Sparkline
										values={weeklyTotals(c)}
										width={140}
										height={22}
										title="weekly activity"
									/>
									<span class="lt-counter__trend-label">last 12 wks</span>
								</div>
							{/if}
						</div>
					</button>
					<button
						type="button"
						class="lt-counter__action"
						onclick={() => plugin.openLogModal(c.definition.id)}
					>
						+ Add
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.lt-counter {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-counter__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-counter__toolbar {
		display: flex;
		justify-content: flex-end;
	}
	.lt-reorder-trigger {
		background: transparent;
		border: none;
		color: var(--text-faint);
		font-size: 0.75rem;
		padding: 0.2rem 0.4rem;
		cursor: pointer;
		border-radius: 0.25rem;
	}
	.lt-reorder-trigger:hover {
		color: var(--interactive-accent);
		background: var(--background-modifier-hover);
	}
	.lt-counter__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-counter__row {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		padding: 0.6rem;
		border-radius: 0.4rem;
		background: var(--background-secondary);
	}
	.lt-counter__name {
		flex: 1;
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-size: inherit;
		color: inherit;
		min-height: 2.5rem;
	}
	.lt-counter__emoji {
		font-size: 1.5rem;
	}
	.lt-counter__main {
		flex: 1;
		min-width: 0;
	}
	.lt-counter__title {
		font-weight: 500;
	}
	.lt-counter__meta {
		font-size: 0.75rem;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lt-counter__value {
		font-size: 1.4rem;
		font-weight: 600;
		margin-top: 0.15rem;
	}
	.lt-counter__unit {
		font-size: 0.85rem;
		font-weight: normal;
		color: var(--text-muted);
		margin-left: 0.25rem;
	}
	.lt-counter__goal {
		font-size: 0.85rem;
		font-weight: normal;
		color: var(--text-muted);
		margin-left: 0.25rem;
	}
	.lt-counter__bar {
		margin-top: 0.4rem;
		width: 100%;
		height: 0.5rem;
		background: var(--background-modifier-hover);
		border-radius: 0.25rem;
		overflow: hidden;
	}
	.lt-counter__bar-fill {
		height: 100%;
		background: var(--interactive-accent);
	}
	.lt-counter__action {
		min-height: 2.25rem;
		padding: 0.5rem 0.75rem;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-counter__trend {
		margin-top: 0.4rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.lt-counter__trend-label {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
</style>
