<script lang="ts">
	import type LifeTrackerPlugin from "../main";
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
		plugin,
	}: {
		summaries: DashboardSummaries;
		eventsByDefinition: Map<string, TrackerEvent[]>;
		definitions: Definition[];
		warnings: string[];
		plugin: LifeTrackerPlugin;
	} = $props();

	type ActivityWindow = "1" | "7" | "14" | "30";
	let activityWindow: ActivityWindow = $state("7");
	const activityWindowOptions: { value: ActivityWindow; label: string }[] = [
		{ value: "1", label: "Yesterday" },
		{ value: "7", label: "Past 7 days" },
		{ value: "14", label: "Past 2 weeks" },
		{ value: "30", label: "Past month" },
	];

	function startOfLocalDay(d: Date): Date {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate());
	}

	function dayKey(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	const DAY_MS = 24 * 60 * 60 * 1000;

	function dayLabel(d: Date, todayStart: Date): string {
		const daysAgo = Math.round((todayStart.getTime() - d.getTime()) / DAY_MS);
		if (daysAgo === 0) return "Today";
		if (daysAgo === 1) return "Yesterday";
		const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
		const monthDay = d.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});
		return `${weekday}, ${monthDay}`;
	}

	function eventTime(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return "";
		return d.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
	}

	function formatEventValue(def: Definition, ev: TrackerEvent): string {
		if (def.kind === "maintenance") return "✓";
		if (ev.value === undefined || ev.value === null) return "";
		if (def.kind === "habit") {
			if (def.valueType === "boolean") return "✓";
			const unit =
				def.unit ?? (def.valueType === "duration" ? "min" : "");
			return unit ? `${ev.value} ${unit}` : `${ev.value}`;
		}
		if (def.kind === "counter") {
			return def.unit ? `${ev.value} ${def.unit}` : `${ev.value}`;
		}
		if (def.kind === "project") {
			return `${ev.value}`;
		}
		// reverse-habit: value rare; show if present
		return `${ev.value}`;
	}

	type DayGroup = {
		key: string;
		date: Date;
		entries: { event: TrackerEvent; definition: Definition }[];
	};

	const dailyActivity = $derived.by((): {
		days: DayGroup[];
		totalEvents: number;
		earliest: Date;
		latest: Date;
	} => {
		const today = startOfLocalDay(new Date());
		let earliest: Date;
		let latest: Date;
		if (activityWindow === "1") {
			earliest = new Date(today);
			earliest.setDate(earliest.getDate() - 1);
			latest = earliest;
		} else {
			const n = parseInt(activityWindow, 10);
			earliest = new Date(today);
			earliest.setDate(earliest.getDate() - (n - 1));
			latest = today;
		}

		const defById = new Map(definitions.map((d) => [d.id, d]));
		const byDay = new Map<string, DayGroup>();
		let totalEvents = 0;

		for (const [defId, list] of eventsByDefinition) {
			const def = defById.get(defId);
			if (!def) continue;
			for (const ev of list) {
				const evDate = new Date(ev.timestamp);
				if (Number.isNaN(evDate.getTime())) continue;
				const evDayStart = startOfLocalDay(evDate);
				if (evDayStart < earliest || evDayStart > latest) continue;
				const key = dayKey(evDayStart);
				let group = byDay.get(key);
				if (!group) {
					group = { key, date: evDayStart, entries: [] };
					byDay.set(key, group);
				}
				group.entries.push({ event: ev, definition: def });
				totalEvents += 1;
			}
		}

		const days = Array.from(byDay.values())
			.map((g) => ({
				...g,
				entries: g.entries.sort((a, b) =>
					b.event.timestamp.localeCompare(a.event.timestamp),
				),
			}))
			.sort((a, b) => b.key.localeCompare(a.key));

		return { days, totalEvents, earliest, latest };
	});

	const todayStart = $derived(startOfLocalDay(new Date()));

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

	<section class="lt-an__panel">
		<div class="lt-an__panel-head">
			<h3 class="lt-an__heading">Recent activity</h3>
			<div class="lt-an__seg" role="tablist" aria-label="Activity window">
				{#each activityWindowOptions as opt (opt.value)}
					<button
						type="button"
						role="tab"
						aria-selected={activityWindow === opt.value}
						class="lt-an__seg-btn"
						class:active={activityWindow === opt.value}
						onclick={() => (activityWindow = opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		{#if dailyActivity.totalEvents === 0}
			<p class="lt-an__muted">
				{#if activityWindow === "1"}
					Nothing logged yesterday.
				{:else}
					No events in this window.
				{/if}
			</p>
		{:else}
			<div class="lt-an__activity-meta">
				{dailyActivity.totalEvents} event{dailyActivity.totalEvents === 1 ? "" : "s"}
				across {dailyActivity.days.length} day{dailyActivity.days.length === 1 ? "" : "s"}
			</div>
			<div class="lt-an__days">
				{#each dailyActivity.days as day (day.key)}
					<div class="lt-an__day">
						<div class="lt-an__day-head">
							<span class="lt-an__day-label">
								{dayLabel(day.date, todayStart)}
							</span>
							<span class="lt-an__day-count">
								{day.entries.length}
								{day.entries.length === 1 ? "entry" : "entries"}
							</span>
						</div>
						<ul class="lt-an__entries">
							{#each day.entries as entry (entry.event.id)}
								{@const valStr = formatEventValue(
									entry.definition,
									entry.event,
								)}
								<li>
									<button
										type="button"
										class="lt-an__entry"
										onclick={() =>
											plugin.openEventDetail(
												entry.definition,
												entry.event,
											)}
									>
										<span class="lt-an__entry-time">
											{eventTime(entry.event.timestamp)}
										</span>
										{#if entry.definition.emoji}
											<span
												class="lt-an__entry-emoji"
												aria-hidden="true"
											>
												{entry.definition.emoji}
											</span>
										{/if}
										<span class="lt-an__entry-name">
											{entry.definition.displayName}
										</span>
										{#if valStr}
											<span class="lt-an__entry-value">
												{valStr}
											</span>
										{/if}
										{#if entry.event.note}
											<span class="lt-an__entry-note">
												{entry.event.note}
											</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	</section>

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

	.lt-an__seg {
		display: inline-flex;
		gap: 0.15rem;
		padding: 0.15rem;
		background: var(--background-primary);
		border-radius: 0.35rem;
		flex-wrap: wrap;
	}
	.lt-an__seg-btn {
		padding: 0.25rem 0.55rem;
		font-size: 0.75rem;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.lt-an__seg-btn:hover {
		color: var(--text-normal);
		background: var(--background-modifier-hover);
	}
	.lt-an__seg-btn.active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.lt-an__activity-meta {
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.lt-an__days {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}
	.lt-an__day {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.lt-an__day-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.15rem;
	}
	.lt-an__day-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-normal);
	}
	.lt-an__day-count {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
	.lt-an__entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.lt-an__entry {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		padding: 0.3rem 0.5rem;
		background: var(--background-primary);
		border: 1px solid transparent;
		border-radius: 0.3rem;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.lt-an__entry:hover {
		background: var(--background-modifier-hover);
	}
	.lt-an__entry:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 1px;
	}
	.lt-an__entry-time {
		font-family: var(--font-monospace);
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
		min-width: 3.2rem;
	}
	.lt-an__entry-emoji {
		font-size: 0.95rem;
		flex-shrink: 0;
	}
	.lt-an__entry-name {
		font-size: 0.85rem;
		font-weight: 500;
		flex-shrink: 0;
	}
	.lt-an__entry-value {
		font-size: 0.75rem;
		color: var(--text-muted);
		padding: 0.05rem 0.35rem;
		background: var(--background-secondary);
		border-radius: 0.25rem;
		flex-shrink: 0;
	}
	.lt-an__entry-note {
		font-size: 0.75rem;
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		flex: 1;
	}
</style>
