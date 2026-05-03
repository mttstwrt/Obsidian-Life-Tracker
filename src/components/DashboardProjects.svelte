<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import {
		type DashboardSummaries,
		type ProjectSummary,
		applyOrder,
	} from "../data/dashboard";
	import type {
		Event as TrackerEvent,
		FieldDef,
		ProjectDefinition,
	} from "../data/types";
	import { eventsByWeek } from "../data/visualizations";
	import Sparkline from "./charts/Sparkline.svelte";
	import FieldChart from "./charts/FieldChart.svelte";
	import FreshnessTimeline from "./charts/FreshnessTimeline.svelte";

	type Filter = "active" | "dormant" | "archived" | "all";

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

	let filter: Filter = $state("active");
	let openId: string | null = $state(null);

	const filtered = $derived(
		applyOrder(
			summaries.projects.filter((p) => {
				if (filter === "all") return true;
				if (filter === "archived") return p.definition.status === "archived";
				if (filter === "dormant")
					return p.isDormant && p.definition.status === "active";
				return p.definition.status === "active";
			}),
			plugin.settings.definitionOrder.projects ?? [],
			(p) => p.definition.id,
		),
	);

	function relativeLabel(daysSince: number | null): string {
		if (daysSince === null) return "no events";
		if (daysSince === 0) return "today";
		if (daysSince === 1) return "yesterday";
		return `${daysSince}d ago`;
	}

	function recentEvents(def: ProjectDefinition): TrackerEvent[] {
		const list = eventsByDefinition.get(def.id) ?? [];
		const sorted = [...list].sort((a, b) =>
			b.timestamp.localeCompare(a.timestamp),
		);
		return sorted.slice(0, 12);
	}

	function eventTotal(p: ProjectSummary): number {
		return p.totalEvents;
	}

	function formatTs(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleString();
	}

	function toggleOpen(id: string) {
		openId = openId === id ? null : id;
	}

	function weeklyCounts(def: ProjectDefinition): number[] {
		const list = eventsByDefinition.get(def.id) ?? [];
		return eventsByWeek(list, now, 12).map((b) => b.count);
	}

	function numericFields(def: ProjectDefinition): FieldDef[] {
		return (def.fieldSchema ?? []).filter(
			(f) => !f.retired && f.type === "number",
		);
	}

	function nonNumericFields(def: ProjectDefinition): FieldDef[] {
		return (def.fieldSchema ?? []).filter(
			(f) => !f.retired && (f.type === "enum" || f.type === "list"),
		);
	}

	function projectStatus(
		p: ProjectSummary,
	): "never" | "ok" | "approaching" | "overdue" {
		if (p.daysSince === null) return "never";
		if (p.isDormant) return "overdue";
		if (p.daysSince >= p.dormantAfterDays * 0.8) return "approaching";
		return "ok";
	}
</script>

<div class="lt-proj">
	<div class="lt-proj__filter">
		<label>
			<span>Show</span>
			<select bind:value={filter}>
				<option value="active">Active</option>
				<option value="dormant">Dormant</option>
				<option value="archived">Archived</option>
				<option value="all">All</option>
			</select>
		</label>
		<button
			type="button"
			class="lt-reorder-trigger"
			title="Reorder projects"
			onclick={() => plugin.openReorderModal("projects")}
		>
			↕ Reorder
		</button>
	</div>

	{#if filtered.length === 0}
		<p class="lt-proj__empty">No projects to show.</p>
	{:else}
		<ul class="lt-proj__list">
			{#each filtered as p (p.definition.id)}
				<li class="lt-proj__row" class:dormant={p.isDormant}>
					<div class="lt-proj__head">
						<button
							type="button"
							class="lt-proj__name"
							onclick={() => toggleOpen(p.definition.id)}
							aria-expanded={openId === p.definition.id}
						>
							<span class="lt-proj__emoji"
								>{p.definition.emoji ?? "•"}</span
							>
							<div class="lt-proj__main">
								<div class="lt-proj__title">
									{p.definition.displayName}
									{#if p.definition.status === "archived"}
										<span class="lt-proj__badge">archived</span>
									{:else if p.isDormant}
										<span class="lt-proj__badge">dormant</span>
									{/if}
								</div>
								<div class="lt-proj__meta">
									{relativeLabel(p.daysSince)} · {p.eventsLast30} in last 30d
									· {eventTotal(p)} total
								</div>
							</div>
						</button>
						<button
							type="button"
							class="lt-proj__action"
							onclick={() => plugin.openLogModal(p.definition.id)}
						>
							Log
						</button>
					</div>
					<div class="lt-proj__timeline">
						<FreshnessTimeline
							events={eventsByDefinition.get(p.definition.id) ?? []}
							{now}
							intervalDays={p.dormantAfterDays}
							windowDays={Math.max(30, p.dormantAfterDays * 4)}
							status={projectStatus(p)}
						/>
					</div>

					{#if openId === p.definition.id}
						{@const events = recentEvents(p.definition)}
						{@const allEvents = eventsByDefinition.get(p.definition.id) ?? []}
						{@const weekly = weeklyCounts(p.definition)}
						{@const numFields = numericFields(p.definition)}
						{@const otherFields = nonNumericFields(p.definition)}
						<div class="lt-proj__detail">
							{#if allEvents.length > 0}
								<div class="lt-proj__chart">
									<div class="lt-proj__chart-label">
										events per week (last 12)
									</div>
									<Sparkline
										values={weekly}
										width={220}
										height={36}
										title="weekly events"
									/>
								</div>
							{/if}

							{#if numFields.length > 0 || otherFields.length > 0}
								<div class="lt-proj__fields">
									{#each numFields as f (f.key)}
										<FieldChart events={allEvents} field={f} />
									{/each}
									{#each otherFields as f (f.key)}
										<FieldChart events={allEvents} field={f} />
									{/each}
								</div>
							{/if}

							{#if events.length === 0}
								<p class="lt-proj__empty">No events yet.</p>
							{:else}
								<ul class="lt-proj__events">
									{#each events as ev (ev.id)}
										<li>
											<button
												type="button"
												class="lt-proj__event"
												onclick={() =>
													plugin.openEventDetail(
														p.definition,
														ev,
													)}
											>
												<span class="lt-proj__event-time"
													>{formatTs(ev.timestamp)}</span
												>
												{#if ev.value !== undefined}
													<span class="lt-proj__event-value"
														>{ev.value}</span
													>
												{/if}
												{#if ev.note}
													<span class="lt-proj__event-note"
														>{ev.note}</span
													>
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
							<div class="lt-proj__detail-actions">
								<button
									type="button"
									onclick={() =>
										plugin.openEditDefinition(p.definition.id)}
								>
									Edit definition
								</button>
								{#if p.definition.status === "archived"}
									<button
										type="button"
										onclick={() =>
											plugin.unarchiveAndRefresh(
												p.definition.id,
											)}
									>
										Unarchive
									</button>
								{:else}
									<button
										type="button"
										onclick={() =>
											plugin.archiveAndRefresh(
												p.definition.id,
											)}
									>
										Archive
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.lt-proj {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-proj__filter {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.lt-proj__filter label {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		font-size: 0.85rem;
	}
	.lt-proj__filter span {
		color: var(--text-muted);
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
	.lt-proj__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-proj__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-proj__row {
		background: var(--background-secondary);
		border-radius: 0.4rem;
		overflow: hidden;
	}
	.lt-proj__row.dormant {
		opacity: 0.85;
	}
	.lt-proj__head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
	}
	.lt-proj__name {
		flex: 1;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		background: transparent;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font-size: inherit;
		color: inherit;
		min-height: 2.5rem;
	}
	.lt-proj__timeline {
		padding: 0 0.6rem 0.5rem;
	}
	.lt-proj__emoji {
		font-size: 1.4rem;
	}
	.lt-proj__main {
		flex: 1;
		min-width: 0;
	}
	.lt-proj__title {
		font-weight: 500;
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.lt-proj__badge {
		font-size: 0.65rem;
		text-transform: uppercase;
		color: var(--text-faint);
		border: 1px solid var(--background-modifier-border);
		border-radius: 0.25rem;
		padding: 0 0.3rem;
	}
	.lt-proj__meta {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.lt-proj__action {
		min-height: 2.25rem;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-proj__detail {
		padding: 0.5rem 0.6rem 0.6rem;
		border-top: 1px solid var(--background-modifier-border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-proj__events {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		max-height: 18rem;
		overflow-y: auto;
	}
	.lt-proj__event {
		display: flex;
		gap: 0.6rem;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		padding: 0.3rem 0.4rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: inherit;
		border-radius: 0.25rem;
	}
	.lt-proj__event:hover {
		background: var(--background-modifier-hover);
	}
	.lt-proj__event-time {
		color: var(--text-muted);
		min-width: 11rem;
	}
	.lt-proj__event-value {
		font-weight: 500;
	}
	.lt-proj__event-note {
		color: var(--text-muted);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lt-proj__detail-actions {
		display: flex;
		gap: 0.4rem;
		justify-content: flex-end;
	}
	.lt-proj__chart {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.lt-proj__chart-label {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.lt-proj__fields {
		display: grid;
		gap: 0.4rem;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
	}
</style>
