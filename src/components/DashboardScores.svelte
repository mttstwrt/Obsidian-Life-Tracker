<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import {
		type DashboardSummaries,
		type ScoreSummary,
		applyOrder,
		dateString,
		scoreTone,
	} from "../data/dashboard";
	import { toneColor } from "../data/visualizations";
	import BarChart from "./charts/BarChart.svelte";
	import Sparkline from "./charts/Sparkline.svelte";
	import { reorderable } from "./reorderable";

	let {
		summaries,
		plugin,
		now,
	}: {
		summaries: DashboardSummaries;
		plugin: LifeTrackerPlugin;
		now: Date;
	} = $props();

	const scores = $derived(
		applyOrder(
			summaries.scores,
			plugin.settings.definitionOrder.scores ?? [],
			(s) => s.definition.id,
		),
	);

	/** At most one decimal, and no trailing ".0" — day values can be means. */
	function formatScore(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(1);
	}

	/** Today's rating if there is one, else the most recent. */
	function currentValue(s: ScoreSummary): number | undefined {
		return s.todayValue ?? s.latest?.value;
	}

	function currentColor(s: ScoreSummary): string | undefined {
		const v = currentValue(s);
		if (v === undefined) return undefined;
		return toneColor(scoreTone(s.definition, v));
	}

	/**
	 * The trailing 30 days of *rated* day values, oldest first. Unrated days are
	 * left out rather than interpolated — the label says "rated days" so the
	 * collapsed gaps don't read as a continuous daily line.
	 */
	function recentSeries(s: ScoreSummary): number[] {
		const out: number[] = [];
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		for (let i = 29; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const v = s.byDate.get(dateString(d));
			if (v !== undefined) out.push(v);
		}
		return out;
	}

	/**
	 * Whether the trend is movement in the good direction, which is not the same
	 * as movement up: for stress or pain a falling score is the improvement.
	 */
	function trendGoodness(s: ScoreSummary): number | undefined {
		if (s.trend === undefined) return undefined;
		return s.definition.higherIsBetter === false ? -s.trend : s.trend;
	}

	const TREND_FLAT = 0.1;

	function trendArrow(s: ScoreSummary): string {
		if (s.trend === undefined) return "";
		if (Math.abs(s.trend) < TREND_FLAT) return "→";
		return s.trend > 0 ? "↑" : "↓";
	}

	function trendClass(s: ScoreSummary): string {
		const goodness = trendGoodness(s);
		if (goodness === undefined || Math.abs(goodness) < TREND_FLAT) return "";
		return goodness > 0 ? "good" : "bad";
	}

	function coverageLabel(s: ScoreSummary): string {
		return `${Math.round(s.coverage7 * 7)}/7 days rated`;
	}

	function distributionBars(s: ScoreSummary) {
		return s.distribution.map((d) => ({
			label: String(d.value),
			count: d.count,
		}));
	}

	function hasDistribution(s: ScoreSummary): boolean {
		return s.distribution.some((d) => d.count > 0);
	}
</script>

<div class="lt-score">
	{#if scores.length === 0}
		<p class="lt-score__empty">No scores yet.</p>
	{:else}
		<ul
			class="lt-score__list"
			use:reorderable={{
				onReorder: (tab, ids) => plugin.reorderDefinitions(tab, ids),
			}}
		>
			{#each scores as s (s.definition.id)}
				{@const current = currentValue(s)}
				{@const series = recentSeries(s)}
				<li
					data-lt-id={s.definition.id}
					data-lt-tab="scores"
					class="lt-score__row"
					class:lt-score__row--stale={s.status === "overdue"}
				>
					<button
						type="button"
						class="lt-score__name"
						onclick={() => plugin.openLogModal(s.definition.id)}
					>
						<span class="lt-score__emoji">{s.definition.emoji ?? "•"}</span>
						<div class="lt-score__main">
							<div class="lt-score__title">{s.definition.displayName}</div>
							<div class="lt-score__meta">
								{#if s.count === 0}
									never rated
								{:else}
									{s.todayValue !== undefined
										? "today"
										: s.daysSinceLast === 1
											? "yesterday"
											: `${s.daysSinceLast}d ago`}
									· {coverageLabel(s)}
								{/if}
							</div>

							<div class="lt-score__value">
								{#if current !== undefined}
									<span
										class="lt-score__current"
										style:color={currentColor(s)}
									>
										{formatScore(current)}
									</span>
									<span class="lt-score__scale">
										/ {s.definition.scale[1]}
									</span>
								{:else}
									<span class="lt-score__current lt-score__current--none"
										>—</span
									>
								{/if}
								{#if s.trend !== undefined}
									<span class="lt-score__trend {trendClass(s)}">
										{trendArrow(s)}
										{formatScore(Math.abs(s.trend))}
									</span>
								{/if}
							</div>

							{#if s.count > 0}
								<div class="lt-score__stats">
									{#if s.mean7 !== undefined}
										<span>7d {formatScore(s.mean7)}</span>
									{/if}
									{#if s.mean30 !== undefined}
										<span>30d {formatScore(s.mean30)}</span>
									{/if}
									{#if s.definition.target !== undefined}
										<span>target {formatScore(s.definition.target)}</span>
									{/if}
									{#if s.min !== undefined && s.max !== undefined}
										<span>range {formatScore(s.min)}–{formatScore(s.max)}</span>
									{/if}
								</div>
							{/if}

							{#if series.length > 1}
								<div class="lt-score__chart">
									<Sparkline
										values={series}
										width={140}
										height={22}
										title="recent ratings"
									/>
									<span class="lt-score__chart-label">
										last {series.length} rated days
									</span>
								</div>
							{/if}

							{#if hasDistribution(s)}
								<div class="lt-score__dist">
									<BarChart
										bars={distributionBars(s)}
										width={200}
										height={54}
										title="distribution"
									/>
								</div>
							{/if}
						</div>
					</button>
					<button
						type="button"
						class="lt-score__action"
						onclick={() => plugin.openLogModal(s.definition.id)}
					>
						Rate
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.lt-score {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-score__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-score__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-score__row {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		padding: 0.6rem;
		border-radius: 0.4rem;
		background: var(--background-secondary);
		border-left: 3px solid transparent;
	}
	.lt-score__row--stale {
		border-left-color: var(--text-warning);
	}
	.lt-score__name {
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
	.lt-score__emoji {
		font-size: 1.5rem;
	}
	.lt-score__main {
		flex: 1;
		min-width: 0;
	}
	.lt-score__title {
		font-weight: 500;
	}
	.lt-score__meta {
		font-size: 0.75rem;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.lt-score__value {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		margin-top: 0.15rem;
	}
	.lt-score__current {
		font-size: 1.6rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.lt-score__current--none {
		color: var(--text-faint);
	}
	.lt-score__scale {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.lt-score__trend {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-left: 0.25rem;
		font-variant-numeric: tabular-nums;
	}
	.lt-score__trend.good {
		color: var(--text-success, var(--interactive-accent));
	}
	.lt-score__trend.bad {
		color: var(--text-error);
	}
	.lt-score__stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 0.2rem;
		font-size: 0.75rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.lt-score__chart {
		margin-top: 0.4rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.lt-score__chart-label {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
	.lt-score__dist {
		margin-top: 0.3rem;
	}
	.lt-score__action {
		min-height: 2.25rem;
		padding: 0.5rem 0.75rem;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
</style>
