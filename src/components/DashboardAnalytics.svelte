<script lang="ts">
	import type { DashboardSummaries } from "../data/dashboard";
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import {
		eventsByDayOfWeek,
		eventsByWeek,
		fieldCorrelations,
	} from "../data/visualizations";
	import BarChart from "./charts/BarChart.svelte";
	import CalendarHeatmap from "./charts/CalendarHeatmap.svelte";
	import Sparkline from "./charts/Sparkline.svelte";

	let {
		summaries,
		eventsByDefinition,
		definitions,
		warnings,
	}: {
		summaries: DashboardSummaries;
		eventsByDefinition: Map<string, TrackerEvent[]>;
		definitions: Definition[];
		warnings: string[];
	} = $props();

	let selectedDefId: string = $state("");

	const now = new Date();

	const totalDefs = $derived(definitions.length);
	const activeDefs = $derived(
		definitions.filter((d) => d.status === "active").length,
	);

	const totalEvents = $derived.by(() => {
		let n = 0;
		for (const list of eventsByDefinition.values()) n += list.length;
		return n;
	});

	const eventsLast7 = $derived.by(() => {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - 7);
		const iso = cutoff.toISOString();
		let n = 0;
		for (const list of eventsByDefinition.values()) {
			for (const e of list) if (e.timestamp >= iso) n += 1;
		}
		return n;
	});

	const allEvents = $derived.by(() => {
		const out: TrackerEvent[] = [];
		for (const list of eventsByDefinition.values()) out.push(...list);
		return out;
	});

	const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const dowBuckets = $derived(eventsByDayOfWeek(allEvents));
	// Reorder Mon-first so weekend sits on the right.
	const dowBars = $derived([
		{ label: "Mon", count: dowBuckets[1] },
		{ label: "Tue", count: dowBuckets[2] },
		{ label: "Wed", count: dowBuckets[3] },
		{ label: "Thu", count: dowBuckets[4] },
		{ label: "Fri", count: dowBuckets[5] },
		{ label: "Sat", count: dowBuckets[6] },
		{ label: "Sun", count: dowBuckets[0] },
	]);

	const weeklyAll = $derived(eventsByWeek(allEvents, now, 26));

	const habitsBehind = $derived(
		summaries.habits.filter((h) => h.dueToday).length,
	);
	const maintenanceOverdue = $derived(
		summaries.maintenance.filter((m) => m.status === "overdue").length,
	);

	const dataQuality = $derived.by(() => {
		const errors: { def: Definition; eventId: string; key: string; msg: string }[] = [];
		const rangeWarns: { def: Definition; eventId: string; key: string; msg: string }[] = [];
		const defById = new Map(definitions.map((d) => [d.id, d]));
		for (const [defId, list] of eventsByDefinition) {
			const def = defById.get(defId);
			if (!def) continue;
			for (const e of list) {
				for (const [k, v] of Object.entries(e.fields)) {
					if (v.coercionError) {
						errors.push({
							def,
							eventId: e.id,
							key: k,
							msg: v.coercionError,
						});
					}
					if (v.rangeWarning) {
						rangeWarns.push({
							def,
							eventId: e.id,
							key: k,
							msg: v.rangeWarning,
						});
					}
				}
			}
		}
		return { errors, rangeWarns };
	});

	const definitionsWithEvents = $derived(
		definitions
			.filter(
				(d) =>
					d.status !== "archived" &&
					(eventsByDefinition.get(d.id)?.length ?? 0) > 0,
			)
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	);

	const selected = $derived(
		definitionsWithEvents.find((d) => d.id === selectedDefId) ??
			definitionsWithEvents[0],
	);

	const selectedEvents = $derived(
		selected ? (eventsByDefinition.get(selected.id) ?? []) : [],
	);

	const selectedNumericFieldKeys = $derived(
		selected
			? (selected.fieldSchema ?? [])
					.filter((f) => !f.retired && f.type === "number")
					.map((f) => f.key)
			: [],
	);

	const correlationHints = $derived(
		selectedNumericFieldKeys.length >= 2
			? fieldCorrelations(selectedEvents, selectedNumericFieldKeys, 0.5)
			: [],
	);

	const selectedWeekly = $derived(eventsByWeek(selectedEvents, now, 26));
</script>

<div class="lt-an">
	<div class="lt-an__cards">
		<div class="lt-an__card">
			<div class="lt-an__num">{totalDefs}</div>
			<div class="lt-an__label">
				definitions ({activeDefs} active)
			</div>
		</div>
		<div class="lt-an__card">
			<div class="lt-an__num">{totalEvents}</div>
			<div class="lt-an__label">events tracked</div>
		</div>
		<div class="lt-an__card">
			<div class="lt-an__num">{eventsLast7}</div>
			<div class="lt-an__label">in last 7 days</div>
		</div>
		<div class="lt-an__card" class:warn={habitsBehind > 0}>
			<div class="lt-an__num">{habitsBehind}</div>
			<div class="lt-an__label">habits behind today</div>
		</div>
		<div class="lt-an__card" class:warn={maintenanceOverdue > 0}>
			<div class="lt-an__num">{maintenanceOverdue}</div>
			<div class="lt-an__label">maintenance overdue</div>
		</div>
	</div>

	{#if allEvents.length > 0}
		<section class="lt-an__panel">
			<h3 class="lt-an__heading">Activity, last 90 days</h3>
			<CalendarHeatmap events={allEvents} now={now} days={90} />
		</section>

		<section class="lt-an__panel">
			<h3 class="lt-an__heading">Day-of-week pattern</h3>
			<BarChart bars={dowBars} width={280} height={90} />
			<p class="lt-an__hint">
				Counts every event across all definitions by weekday.
			</p>
		</section>

		<section class="lt-an__panel">
			<h3 class="lt-an__heading">Weekly trend, last 26 weeks</h3>
			<Sparkline
				values={weeklyAll.map((b) => b.count)}
				width={420}
				height={48}
				title="weekly events"
			/>
			<div class="lt-an__weekly-meta">
				{weeklyAll[weeklyAll.length - 1]?.count ?? 0} this week ·
				{weeklyAll.reduce((s, b) => s + b.count, 0)} in window
			</div>
		</section>
	{/if}

	{#if definitionsWithEvents.length > 0}
		<section class="lt-an__panel">
			<div class="lt-an__panel-head">
				<h3 class="lt-an__heading">Per-definition</h3>
				<label class="lt-an__select">
					<span>Definition</span>
					<select bind:value={selectedDefId}>
						{#each definitionsWithEvents as d (d.id)}
							<option value={d.id}>
								{d.emoji ?? ""} {d.displayName}
							</option>
						{/each}
					</select>
				</label>
			</div>

			{#if selected}
				<div class="lt-an__per-def">
					<div>
						<div class="lt-an__sublabel">activity, last 90 days</div>
						<CalendarHeatmap
							events={selectedEvents}
							now={now}
							days={90}
						/>
					</div>
					<div>
						<div class="lt-an__sublabel">weekly events, last 26 weeks</div>
						<Sparkline
							values={selectedWeekly.map((b) => b.count)}
							width={260}
							height={36}
							title="weekly events"
						/>
					</div>
					{#if correlationHints.length > 0}
						<div>
							<div class="lt-an__sublabel">field correlations (|r| ≥ 0.5)</div>
							<ul class="lt-an__corr">
								{#each correlationHints as h (h.keyA + h.keyB)}
									<li>
										<code>{h.keyA}</code> ↔ <code>{h.keyB}</code>
										: r = {h.r.toFixed(2)} (n={h.n})
										<span class="lt-an__caution">
											· correlation, not causation
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{:else if selectedNumericFieldKeys.length >= 2}
						<div class="lt-an__muted">
							No strong correlations among numeric fields.
						</div>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<section class="lt-an__panel">
		<h3 class="lt-an__heading">Data quality</h3>
		{#if dataQuality.errors.length === 0 && dataQuality.rangeWarns.length === 0 && warnings.length === 0}
			<p class="lt-an__ok">Looks clean.</p>
		{:else}
			{#if dataQuality.errors.length > 0}
				<details>
					<summary>
						<strong>{dataQuality.errors.length}</strong> coercion error{dataQuality.errors.length === 1 ? "" : "s"}
					</summary>
					<ul class="lt-an__issues">
						{#each dataQuality.errors as err (err.def.id + err.eventId + err.key)}
							<li>
								<code>{err.def.displayName}</code> · {err.key}: {err.msg}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
			{#if dataQuality.rangeWarns.length > 0}
				<details>
					<summary>
						<strong>{dataQuality.rangeWarns.length}</strong> range warning{dataQuality.rangeWarns.length === 1 ? "" : "s"}
					</summary>
					<ul class="lt-an__issues">
						{#each dataQuality.rangeWarns as w (w.def.id + w.eventId + w.key)}
							<li>
								<code>{w.def.displayName}</code> · {w.key}: {w.msg}
							</li>
						{/each}
					</ul>
				</details>
			{/if}
			{#if warnings.length > 0}
				<details>
					<summary>
						<strong>{warnings.length}</strong> parse warning{warnings.length === 1 ? "" : "s"}
					</summary>
					<ul class="lt-an__issues">
						{#each warnings as w (w)}
							<li>{w}</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}
	</section>

	{#if allEvents.length === 0}
		<p class="lt-an__muted">
			No events yet — visualizations will populate as you log activity.
		</p>
	{/if}
</div>

<style>
	.lt-an {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.lt-an__cards {
		display: grid;
		gap: 0.5rem;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
	}
	.lt-an__card {
		padding: 0.75rem;
		background: var(--background-secondary);
		border-radius: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.lt-an__card.warn {
		border-left: 3px solid var(--text-warning);
	}
	.lt-an__num {
		font-size: 1.6rem;
		font-weight: 600;
	}
	.lt-an__label {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.lt-an__panel {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem 0.75rem;
		background: var(--background-secondary);
		border-radius: 0.4rem;
	}
	.lt-an__panel-head {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.lt-an__heading {
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin: 0;
	}
	.lt-an__select {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		font-size: 0.85rem;
	}
	.lt-an__select span {
		color: var(--text-muted);
	}
	.lt-an__sublabel {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 0.25rem;
	}
	.lt-an__per-def {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.lt-an__weekly-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.lt-an__hint {
		font-size: 0.75rem;
		color: var(--text-faint);
		margin: 0;
	}
	.lt-an__corr {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.lt-an__caution {
		color: var(--text-faint);
		font-size: 0.75rem;
	}
	.lt-an__issues {
		font-size: 0.85rem;
		font-family: var(--font-monospace);
		margin: 0.4rem 0 0;
		padding-left: 1.2rem;
	}
	.lt-an__ok {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-an__muted {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
</style>
