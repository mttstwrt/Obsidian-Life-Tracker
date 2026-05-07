<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import {
		type DashboardSummaries,
		type MaintenanceSummary,
		applyOrder,
	} from "../data/dashboard";
	import type { Event as TrackerEvent } from "../data/types";
	import FreshnessTimeline from "./charts/FreshnessTimeline.svelte";

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

	const sorted = $derived.by(() => {
		const urgency = [...summaries.maintenance].sort((a, b) => {
			if (a.urgency === b.urgency) return 0;
			if (!Number.isFinite(a.urgency)) return -1;
			if (!Number.isFinite(b.urgency)) return 1;
			return b.urgency - a.urgency;
		});
		return applyOrder(
			urgency,
			plugin.settings.definitionOrder.maintenance ?? [],
			(m) => m.definition.id,
		);
	});

	function relativeLabel(m: MaintenanceSummary): string {
		if (m.daysSince === null) return "never logged";
		if (m.daysSince === 0) return "logged today";
		if (m.daysSince === 1) return "1d ago";
		return `${m.daysSince}d ago`;
	}

	function intervalLabel(m: MaintenanceSummary): string {
		const interval = m.definition.intervalDays;
		if (m.status === "overdue" && m.daysSince !== null) {
			const over = m.daysSince - interval;
			return `${interval}d interval · ${over}d overdue`;
		}
		if (m.status === "approaching" && m.daysSince !== null) {
			const due = interval - m.daysSince;
			return `${interval}d interval · due in ${due}d`;
		}
		return `${interval}d interval`;
	}
</script>

<div class="lt-maint">
	{#if sorted.length === 0}
		<p class="lt-maint__empty">
			No maintenance items yet. Use “New definition” to create one.
		</p>
	{:else}
		<div class="lt-maint__toolbar">
			<button
				type="button"
				class="lt-reorder-trigger"
				title="Reorder maintenance"
				onclick={() => plugin.openReorderModal("maintenance")}
			>
				↕ Reorder
			</button>
		</div>
		<ul class="lt-maint__list">
			{#each sorted as m (m.definition.id)}
				<li
					class="lt-maint__row"
					class:overdue={m.status === "overdue"}
					class:approaching={m.status === "approaching"}
					class:never={m.status === "never"}
					class:ok={m.status === "ok"}
				>
					<button
						type="button"
						class="lt-maint__name"
						onclick={() => plugin.openLogModal(m.definition.id)}
					>
						{#if m.definition.emoji}
							<span class="lt-maint__emoji"
								>{m.definition.emoji}</span
							>
						{/if}
						<span class="lt-maint__name-stack">
							<span class="lt-maint__title"
								>{m.definition.displayName}</span
							>
							<span class="lt-maint__sub">
								{relativeLabel(m)}
							</span>
							<span class="lt-maint__sub-faint">
								{intervalLabel(m)}
							</span>
						</span>
					</button>
					<div class="lt-maint__timeline">
						<FreshnessTimeline
							events={eventsByDefinition.get(m.definition.id) ?? []}
							{now}
							intervalDays={m.definition.intervalDays}
							windowDays={Math.max(30, m.definition.intervalDays * 4)}
							status={m.status}
						/>
					</div>
					<button
						type="button"
						class="lt-maint__action"
						onclick={() => plugin.quickLog(m.definition.id)}
					>
						Did it
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.lt-maint {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-maint__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-maint__toolbar {
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
	.lt-maint__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-maint__row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.6rem;
		border-radius: 0.4rem;
		background: var(--background-secondary);
		border-left: 3px solid transparent;
	}
	.lt-maint__row.overdue {
		border-left-color: var(--text-error);
	}
	.lt-maint__row.approaching {
		border-left-color: var(--text-warning);
	}
	.lt-maint__row.never {
		border-left-color: var(--text-faint);
	}
	.lt-maint__row.ok {
		border-left-color: var(--text-success, var(--interactive-accent));
	}
	.lt-maint__name {
		flex: 0 0 auto;
		width: 12rem;
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		background: transparent;
		border: none;
		padding: 0.2rem 0.25rem;
		text-align: left;
		cursor: pointer;
		min-height: 2.5rem;
		font-size: inherit;
		color: inherit;
	}
	.lt-maint__name:hover {
		background: var(--background-modifier-hover);
		border-radius: 0.3rem;
	}
	.lt-maint__emoji {
		font-size: 1.25rem;
		line-height: 1.2;
		flex-shrink: 0;
	}
	.lt-maint__name-stack {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		gap: 0.05rem;
	}
	.lt-maint__title {
		font-weight: 500;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.lt-maint__sub {
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.2;
	}
	.lt-maint__sub-faint {
		font-size: 0.72rem;
		color: var(--text-faint);
		line-height: 1.2;
	}
	.lt-maint__timeline {
		flex: 1;
		min-width: 6rem;
	}
	.lt-maint__action {
		flex: 0 0 auto;
		min-height: 2.25rem;
		padding: 0.4rem 0.75rem;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	@media (max-width: 600px) {
		.lt-maint__row {
			flex-wrap: wrap;
			gap: 0.4rem;
		}
		.lt-maint__name {
			width: auto;
			flex: 1 1 60%;
		}
		.lt-maint__timeline {
			flex: 1 1 100%;
			order: 3;
		}
		.lt-maint__action {
			order: 2;
		}
	}
</style>
