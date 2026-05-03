<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import type { DashboardSummaries } from "../data/dashboard";

	let {
		summaries,
		plugin,
		now,
	}: {
		summaries: DashboardSummaries;
		plugin: LifeTrackerPlugin;
		now: Date;
	} = $props();

	const habitsDue = $derived(summaries.habits.filter((h) => h.dueToday));

	const maintenanceUrgent = $derived(
		summaries.maintenance
			.filter((m) => m.status === "overdue" || m.status === "approaching")
			.sort((a, b) => b.urgency - a.urgency),
	);

	const dormantProjects = $derived(
		summaries.projects.filter(
			(p) => p.isDormant && p.definition.status === "active",
		),
	);

	const milestoneReverseHabits = $derived(
		summaries.reverseHabits.filter((r) => r.inMilestoneRange),
	);

	const isEmpty = $derived(
		habitsDue.length === 0 &&
			maintenanceUrgent.length === 0 &&
			dormantProjects.length === 0 &&
			milestoneReverseHabits.length === 0,
	);

	function emoji(e?: string): string {
		return e ?? "•";
	}

	function relativeDays(ts: string | undefined, anchor: Date): string {
		if (!ts) return "never";
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		const diff = Math.floor(
			(anchor.getTime() - d.getTime()) / 86_400_000,
		);
		if (diff <= 0) return "today";
		if (diff === 1) return "yesterday";
		if (diff < 7) return `${diff} days ago`;
		return d.toLocaleDateString();
	}
</script>

<div class="lt-today">
	{#if isEmpty}
		<p class="lt-today__empty">
			Nothing pressing today. Nice work — log something to keep the streak.
		</p>
	{/if}

	{#if habitsDue.length > 0}
		<section class="lt-today__section">
			<h2 class="lt-today__heading">Habits due today</h2>
			<ul class="lt-today__list">
				{#each habitsDue as h (h.definition.id)}
					<li class="lt-today__item">
						<span class="lt-today__emoji">{emoji(h.definition.emoji)}</span>
						<div class="lt-today__main">
							<div class="lt-today__name">
								{h.definition.displayName}
							</div>
							<div class="lt-today__meta">
								{h.periodCount} / {h.periodTarget}
								{h.periodLabel}
								{#if h.currentStreak > 0}
									· streak {h.currentStreak}d
								{/if}
							</div>
						</div>
						<button
							type="button"
							class="lt-today__action"
							onclick={() => plugin.quickLog(h.definition.id)}
						>
							Log
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if maintenanceUrgent.length > 0}
		<section class="lt-today__section">
			<h2 class="lt-today__heading">Maintenance</h2>
			<ul class="lt-today__list">
				{#each maintenanceUrgent as m (m.definition.id)}
					<li
						class="lt-today__item lt-today__item--maint"
						class:overdue={m.status === "overdue"}
						class:approaching={m.status === "approaching"}
					>
						<span class="lt-today__emoji">{emoji(m.definition.emoji)}</span>
						<div class="lt-today__main">
							<div class="lt-today__name">
								{m.definition.displayName}
							</div>
							<div class="lt-today__meta">
								{#if m.daysSince === null}
									never logged
								{:else if m.status === "overdue"}
									{m.daysSince}d since · {Math.max(
										1,
										m.daysSince - m.definition.intervalDays,
									)}d overdue
								{:else}
									{m.daysSince}d since · due in {m.definition.intervalDays - m.daysSince}d
								{/if}
							</div>
						</div>
						<button
							type="button"
							class="lt-today__action"
							onclick={() => plugin.quickLog(m.definition.id)}
						>
							Did it
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if milestoneReverseHabits.length > 0}
		<section class="lt-today__section">
			<h2 class="lt-today__heading">Reverse habits — milestone</h2>
			<ul class="lt-today__list">
				{#each milestoneReverseHabits as r (r.definition.id)}
					<li class="lt-today__item lt-today__item--milestone">
						<span class="lt-today__emoji">{emoji(r.definition.emoji)}</span>
						<div class="lt-today__main">
							<div class="lt-today__name">{r.definition.displayName}</div>
							<div class="lt-today__meta">
								{#if r.daysSince !== null}
									{r.daysSince}d since
								{/if}
								{#if r.lastMilestone !== undefined}
									· crossed {r.lastMilestone}d
								{/if}
								{#if r.nextMilestone !== undefined}
									· next {r.nextMilestone}d
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if dormantProjects.length > 0}
		<section class="lt-today__section">
			<h2 class="lt-today__heading">Projects without recent activity</h2>
			<ul class="lt-today__list">
				{#each dormantProjects as p (p.definition.id)}
					<li class="lt-today__item">
						<span class="lt-today__emoji">{emoji(p.definition.emoji)}</span>
						<div class="lt-today__main">
							<div class="lt-today__name">{p.definition.displayName}</div>
							<div class="lt-today__meta">
								{#if p.daysSince === null}
									no activity yet
								{:else}
									{p.daysSince}d since · {p.eventsLast30} in last 30d
								{/if}
							</div>
						</div>
						<button
							type="button"
							class="lt-today__action"
							onclick={() => plugin.openLogModal(p.definition.id)}
						>
							Log
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.lt-today {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.lt-today__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-today__heading {
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin: 0 0 0.4rem;
	}
	.lt-today__list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.lt-today__item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem;
		border-radius: 0.4rem;
		background: var(--background-secondary);
	}
	.lt-today__item--maint.overdue {
		border-left: 3px solid var(--text-error);
	}
	.lt-today__item--maint.approaching {
		border-left: 3px solid var(--text-warning);
	}
	.lt-today__item--milestone {
		border-left: 3px solid var(--interactive-accent);
	}
	.lt-today__emoji {
		font-size: 1.4rem;
	}
	.lt-today__main {
		flex: 1;
		min-width: 0;
	}
	.lt-today__name {
		font-weight: 500;
	}
	.lt-today__meta {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.lt-today__action {
		padding: 0.4rem 0.75rem;
		min-height: 2.25rem;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
</style>
