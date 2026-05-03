<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import {
		type DashboardSummaries,
		type HabitSummary,
		type ReverseHabitSummary,
		applyOrder,
		gridDates,
	} from "../data/dashboard";
	import MilestoneTimeline from "./charts/MilestoneTimeline.svelte";

	let {
		summaries,
		plugin,
		now,
	}: {
		summaries: DashboardSummaries;
		plugin: LifeTrackerPlugin;
		now: Date;
	} = $props();

	let tagFilter: string = $state("");

	const allTags = $derived.by(() => {
		const tags = new Set<string>();
		for (const h of summaries.habits) for (const t of h.definition.tags) tags.add(t);
		for (const r of summaries.reverseHabits)
			for (const t of r.definition.tags) tags.add(t);
		return [...tags].sort();
	});

	const dates = $derived(gridDates(now, 14));

	const order = $derived(plugin.settings.definitionOrder.habits ?? []);

	const filteredHabits = $derived(
		applyOrder(
			summaries.habits.filter(
				(h) => tagFilter === "" || h.definition.tags.includes(tagFilter),
			),
			order,
			(h) => h.definition.id,
		),
	);

	const filteredReverse = $derived(
		applyOrder(
			summaries.reverseHabits.filter(
				(r) => tagFilter === "" || r.definition.tags.includes(tagFilter),
			),
			order,
			(r) => r.definition.id,
		),
	);

	function cellCount(h: HabitSummary, d: string): number {
		return h.recentByDate.get(d) ?? 0;
	}

	function shortDate(iso: string): string {
		const [_y, m, d] = iso.split("-");
		return `${m}/${d}`;
	}

	function dayOfWeek(iso: string): string {
		const d = new Date(`${iso}T12:00:00`);
		return d.toLocaleDateString(undefined, { weekday: "short" });
	}

	function isToday(iso: string): boolean {
		const t = new Date(now);
		const y = t.getFullYear();
		const m = String(t.getMonth() + 1).padStart(2, "0");
		const d = String(t.getDate()).padStart(2, "0");
		return iso === `${y}-${m}-${d}`;
	}

	function logForDate(definitionId: string, isoDate: string) {
		plugin.openLogModal(definitionId, { initialDate: isoDate });
	}

	function reverseDaysSinceLabel(r: ReverseHabitSummary): string {
		if (r.daysSince === null) return "never";
		if (r.daysSince === 0) return "today";
		return `${r.daysSince}d`;
	}
</script>

<div class="lt-habits">
	{#if allTags.length > 0}
		<div class="lt-habits__filter">
			<label>
				<span>Filter by tag</span>
				<select bind:value={tagFilter}>
					<option value="">All</option>
					{#each allTags as t (t)}
						<option value={t}>{t}</option>
					{/each}
				</select>
			</label>
		</div>
	{/if}

	{#if filteredHabits.length === 0 && filteredReverse.length === 0}
		<p class="lt-habits__empty">
			No habits yet. Use “New definition” to create one.
		</p>
	{:else}
		<div class="lt-habits__scroll">
			<table class="lt-habits__grid">
				<thead>
					<tr>
						<th class="lt-habits__name-col">
							<button
								type="button"
								class="lt-habits__header-button"
								title="Reorder habits"
								onclick={() => plugin.openReorderModal("habits")}
							>
								Habit
							</button>
						</th>
						<th class="lt-habits__period-col">Period</th>
						{#each dates as d, i (d)}
							<th
								class="lt-habits__day-col"
								class:lt-habits__day-col--old={i < dates.length - 7}
								class:today={isToday(d)}
								title={d}
							>
								<div class="lt-habits__dow">{dayOfWeek(d)}</div>
								<div class="lt-habits__date">{shortDate(d)}</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each filteredHabits as h (h.definition.id)}
						<tr>
							<th scope="row" class="lt-habits__name-cell">
								<button
									type="button"
									class="lt-habits__name-button"
									onclick={() => plugin.openLogModal(h.definition.id)}
								>
									{#if h.definition.emoji}
										<span class="lt-habits__emoji"
											>{h.definition.emoji}</span
										>
									{/if}
									<span class="lt-habits__name-stack">
										<span class="lt-habits__name-text"
											>{h.definition.displayName}</span
										>
									</span>
								</button>
							</th>
							<td class="lt-habits__period-cell">
								{#if h.periodTarget > 0}
									<span class:behind={h.dueToday}>
										{h.periodCount}/{h.periodTarget}
									</span>
									<div class="lt-habits__period-label">
										{h.periodLabel}
									</div>
								{:else}
									<span class="lt-habits__period-none">—</span>
								{/if}
							</td>
							{#each dates as d, i (d)}
								{@const c = cellCount(h, d)}
								<td
									class="lt-habits__cell"
									class:lt-habits__day-col--old={i < dates.length - 7}
									class:today={isToday(d)}
								>
									<button
										type="button"
										class="lt-habits__cell-button"
										class:has={c > 0}
										title={c > 0
											? `${c} on ${d}`
											: `Log on ${d}`}
										aria-label={c > 0
											? `${c} events on ${d}`
											: `Log ${h.definition.displayName} on ${d}`}
										onclick={() => logForDate(h.definition.id, d)}
									>
										{#if c > 1}
											<span class="lt-habits__cell-count">{c}</span>
										{:else if c === 1}
											<span class="lt-habits__cell-dot">●</span>
										{/if}
									</button>
								</td>
							{/each}
						</tr>
					{/each}

					{#each filteredReverse as r (r.definition.id)}
						<tr class="lt-habits__row--reverse">
							<th scope="row" class="lt-habits__name-cell">
								<button
									type="button"
									class="lt-habits__name-button"
									onclick={() => plugin.openLogModal(r.definition.id)}
								>
									{#if r.definition.emoji}
										<span class="lt-habits__emoji"
											>{r.definition.emoji}</span
										>
									{/if}
									<span class="lt-habits__name-stack">
										<span class="lt-habits__name-text"
											>{r.definition.displayName}</span
										>
										<span class="lt-habits__badge">reverse</span>
									</span>
								</button>
							</th>
							<td class="lt-habits__period-cell">
								<span>{reverseDaysSinceLabel(r)}</span>
								<div class="lt-habits__period-label">
									{#if r.nextMilestone !== undefined}
										next {r.nextMilestone}d
									{:else}
										best {r.personalBestDays}d
									{/if}
								</div>
							</td>
							<td
								class="lt-habits__cell lt-habits__cell--reverse"
								colspan={dates.length}
							>
								{#if r.daysSince !== null}
									<MilestoneTimeline
										daysSince={r.daysSince}
										milestones={r.definition.milestones ?? []}
										personalBest={r.personalBestDays}
									/>
								{:else}
									<span class="lt-habits__reverse-empty"
										>no events yet</span
									>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.lt-habits {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.lt-habits__filter label {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		font-size: 0.85rem;
	}
	.lt-habits__filter span {
		color: var(--text-muted);
	}
	.lt-habits__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-habits__scroll {
		overflow-x: auto;
		max-width: 100%;
	}
	.lt-habits__grid {
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.lt-habits__grid th,
	.lt-habits__grid td {
		padding: 0.25rem 0.15rem;
		text-align: center;
		vertical-align: middle;
	}
	.lt-habits__name-col {
		text-align: left;
		min-width: 9rem;
		padding-right: 0.4rem;
	}
	.lt-habits__header-button {
		background: transparent;
		border: none;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}
	.lt-habits__header-button:hover {
		color: var(--interactive-accent);
	}
	.lt-habits__period-col {
		min-width: 3rem;
		padding-right: 0.4rem;
	}
	.lt-habits__day-col {
		min-width: 1.9rem;
		font-weight: normal;
		color: var(--text-muted);
	}
	.lt-habits__day-col.today {
		color: var(--interactive-accent);
		font-weight: 600;
	}
	.lt-habits__dow {
		font-size: 0.7rem;
	}
	.lt-habits__date {
		font-size: 0.7rem;
	}
	.lt-habits__name-cell {
		text-align: left;
	}
	.lt-habits__name-button {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		background: transparent;
		border: none;
		padding: 0.25rem;
		text-align: left;
		font-size: inherit;
		color: inherit;
		cursor: pointer;
		width: 100%;
	}
	.lt-habits__name-button:hover {
		background: var(--background-modifier-hover);
		border-radius: 0.3rem;
	}
	.lt-habits__emoji {
		font-size: 1.1rem;
		line-height: 1.2;
		flex-shrink: 0;
	}
	.lt-habits__name-stack {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}
	.lt-habits__name-text {
		min-width: 0;
		overflow-wrap: anywhere;
		word-break: break-word;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		line-height: 1.2;
	}
	.lt-habits__badge {
		font-size: 0.6rem;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.lt-habits__period-cell {
		font-size: 0.85rem;
	}
	.lt-habits__period-cell .behind {
		color: var(--text-warning);
		font-weight: 600;
	}
	.lt-habits__period-label {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
	.lt-habits__period-none {
		color: var(--text-faint);
	}
	.lt-habits__cell {
		padding: 0;
	}
	.lt-habits__cell.today {
		background: var(--background-modifier-active-hover);
	}
	.lt-habits__cell-button {
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 0.25rem;
		background: var(--background-modifier-hover);
		border: 1px solid transparent;
		cursor: pointer;
		font-size: 0.7rem;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.lt-habits__cell-button:hover {
		border-color: var(--interactive-accent);
	}
	.lt-habits__cell-button.has {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-habits__cell-dot {
		font-size: 0.5rem;
	}
	.lt-habits__row--reverse .lt-habits__cell--reverse {
		text-align: left;
		padding: 0 0.4rem;
	}
	.lt-habits__reverse-empty {
		color: var(--text-faint);
		font-size: 0.75rem;
	}
	@media (max-width: 600px) {
		.lt-habits__day-col--old {
			display: none;
		}
		.lt-habits__name-col {
			min-width: 0;
			width: 5.5rem;
			max-width: 5.5rem;
		}
		.lt-habits__name-cell {
			max-width: 5.5rem;
		}
		.lt-habits__name-button {
			gap: 0.25rem;
			padding: 0.2rem;
			font-size: 0.78rem;
		}
		.lt-habits__emoji {
			font-size: 0.95rem;
		}
		.lt-habits__cell-button {
			width: 1.5rem;
			height: 1.5rem;
		}
		.lt-habits__day-col {
			min-width: 1.7rem;
		}
	}
</style>
