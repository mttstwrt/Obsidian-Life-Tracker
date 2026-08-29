<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import {
		type DashboardSummaries,
		type FreshnessStatus,
		applyOrder,
		dateString,
		gridDates,
		projectFreshnessStatus,
		scoreTone,
	} from "../data/dashboard";
	import { eventsByDate, toneColor } from "../data/visualizations";
	import { TagDayModal, type TagDayEntry } from "../views/TagDayModal";
	import type { OrderTabKey } from "../data/definitionOrder";
	import { reorderable } from "./reorderable";

	let {
		summaries,
		plugin,
		definitions,
		eventsByDefinition,
		now,
	}: {
		summaries: DashboardSummaries;
		plugin: LifeTrackerPlugin;
		definitions: Definition[];
		eventsByDefinition: Map<string, TrackerEvent[]>;
		now: Date;
	} = $props();

	// The overview shows as much history as fits, up to this many days.
	const MAX_DAYS = 60;

	// svelte-ignore state_referenced_locally -- deliberate init-once read;
	// mode changes flow back into settings via setMode.
	let mode: "definitions" | "tags" = $state(
		plugin.settings.overviewMode ?? "definitions",
	);

	function setMode(m: "definitions" | "tags") {
		mode = m;
		plugin.settings.overviewMode = m;
		void plugin.saveSettings();
	}

	// Same measured-columns fit as the habits grid: the name + status header
	// cells are the fixed overhead, one day header gives the per-day width.
	let gridWidth: number = $state(0);
	let nameTh: HTMLTableCellElement | undefined = $state();
	let statusTh: HTMLTableCellElement | undefined = $state();
	let dayThs: HTMLTableCellElement[] = $state([]);

	let fixedColsWidth = $state(0);
	let dayColWidth = $state(0);

	$effect(() => {
		void gridWidth; // re-measure on container resize
		if (!nameTh || !statusTh) return;
		// Measure a *visible* day column. On mobile the older day columns are
		// hidden (display:none), so their offsetWidth reads 0 — measuring the
		// first column there would defeat the fit calc and freeze the grid at
		// the fallback width, overflowing the viewport. Walk from the end to
		// the first rendered day header.
		let dayTh: HTMLTableCellElement | undefined;
		for (let i = dayThs.length - 1; i >= 0; i--) {
			const th = dayThs[i];
			if (th && th.offsetWidth > 0) {
				dayTh = th;
				break;
			}
		}
		if (!dayTh) return;
		fixedColsWidth = nameTh.offsetWidth + statusTh.offsetWidth;
		dayColWidth = dayTh.offsetWidth;
	});

	const dayCount = $derived.by(() => {
		if (gridWidth <= 0 || dayColWidth <= 0) return 14;
		const buffer = dayColWidth * 0.5;
		const fit = Math.floor((gridWidth - fixedColsWidth - buffer) / dayColWidth);
		// Let the measured fit govern so the grid never overflows; a low floor
		// only guards against a degenerate view on very narrow screens.
		return Math.max(5, Math.min(MAX_DAYS, fit));
	});

	const dates = $derived(gridDates(now, dayCount));

	const countsByDefinition: Map<string, Map<string, number>> = $derived.by(
		() => {
			const out = new Map<string, Map<string, number>>();
			for (const [id, events] of eventsByDefinition) {
				out.set(id, eventsByDate(events));
			}
			return out;
		},
	);

	type StatusTone = "ok" | "warn" | "danger" | undefined;

	interface OverviewRow {
		definition: Definition;
		kindClass: "habit" | "reverse" | "maint" | "project" | "counter" | "score";
		status: string;
		statusTone: StatusTone;
		statusLabel: string;
		/** Drives the maintenance-style left-border indicator; omitted for counters. */
		freshness?: FreshnessStatus;
		/** Reverse habits use a continuous tone color instead of the 4-state freshness. */
		freshnessColor?: string;
		/**
		 * Score rows paint each cell by that day's *rating* rather than by how
		 * many events landed on it — the one place the grid means something
		 * other than a count. Absent for every other kind.
		 */
		dayValues?: Map<string, number>;
		/** Maps a day value to 0..1 for `toneColor`. Present iff `dayValues` is. */
		dayTone?: (value: number) => number;
	}

	/** At most one decimal, and no trailing ".0" — day values can be means. */
	function formatScore(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(1);
	}

	interface OverviewGroup {
		label: string;
		rows: OverviewRow[];
		/** Which order key a drag in this group commits to. */
		tab: OrderTabKey;
		/**
		 * Drag boundary. Habits and reverse habits share the `habits` order key
		 * but render as separate groups, so they need distinct boundaries to stay
		 * undraggable into one another.
		 */
		group: string;
	}

	const groups: OverviewGroup[] = $derived.by(() => {
		const order = plugin.settings.definitionOrder;
		const out: OverviewGroup[] = [];

		const habits: OverviewRow[] = applyOrder(
			summaries.habits,
			order.habits ?? [],
			(h) => h.definition.id,
		).map((h) => ({
			definition: h.definition,
			kindClass: "habit" as const,
			status: h.periodTarget > 0 ? `${h.periodCount}/${h.periodTarget}` : "—",
			statusTone: h.dueToday ? ("warn" as const) : undefined,
			statusLabel:
				h.currentStreak > 0 ? `streak ${h.currentStreak}` : h.periodLabel,
			freshness:
				h.totalEvents === 0
					? ("never" as const)
					: h.periodTarget <= 0
						? undefined
						: h.dueToday
							? ("approaching" as const)
							: ("ok" as const),
		}));
		if (habits.length)
			out.push({ label: "Habits", rows: habits, tab: "habits", group: "habits" });

		const reverse: OverviewRow[] = applyOrder(
			summaries.reverseHabits,
			order.habits ?? [],
			(r) => r.definition.id,
		).map((r) => ({
			definition: r.definition,
			kindClass: "reverse" as const,
			status:
				r.daysSince === null
					? "never"
					: r.daysSince === 0
						? "today"
						: `${r.daysSince}d`,
			statusTone: r.daysSince === 0 ? ("danger" as const) : undefined,
			statusLabel:
				r.nextMilestone !== undefined
					? `next ${r.nextMilestone}d`
					: `best ${r.personalBestDays}d`,
			freshness: r.daysSince === null ? ("never" as const) : undefined,
			freshnessColor: r.daysSince === null ? undefined : toneColor(r.tone),
		}));
		if (reverse.length)
			out.push({
				label: "Reverse habits",
				rows: reverse,
				tab: "habits",
				group: "reverse",
			});

		const maint: OverviewRow[] = applyOrder(
			summaries.maintenance,
			order.maintenance ?? [],
			(m) => m.definition.id,
		).map((m) => ({
			definition: m.definition,
			kindClass: "maint" as const,
			status: m.daysSince === null ? "never" : `${m.daysSince}d`,
			statusTone:
				m.status === "overdue" || m.status === "never"
					? ("danger" as const)
					: m.status === "approaching"
						? ("warn" as const)
						: ("ok" as const),
			statusLabel: `every ${m.definition.intervalDays}d`,
			freshness: m.status,
		}));
		if (maint.length)
			out.push({
				label: "Maintenance",
				rows: maint,
				tab: "maintenance",
				group: "maintenance",
			});

		const projects: OverviewRow[] = applyOrder(
			summaries.projects,
			order.projects ?? [],
			(p) => p.definition.id,
		).map((p) => ({
			definition: p.definition,
			kindClass: "project" as const,
			status:
				p.daysSince === null
					? "—"
					: p.isDormant
						? `${p.daysSince}d 💤`
						: p.daysSince === 0
							? "today"
							: `${p.daysSince}d ago`,
			statusTone: p.isDormant ? ("warn" as const) : undefined,
			statusLabel: `${p.eventsLast30} in 30d`,
			freshness: projectFreshnessStatus(p),
		}));
		if (projects.length)
			out.push({
				label: "Projects",
				rows: projects,
				tab: "projects",
				group: "projects",
			});

		const counters: OverviewRow[] = applyOrder(
			summaries.counters,
			order.counters ?? [],
			(c) => c.definition.id,
		).map((c) => ({
			definition: c.definition,
			kindClass: "counter" as const,
			status: c.goal ? `${c.periodTotal}/${c.goal}` : String(c.periodTotal),
			statusTone: undefined,
			statusLabel: c.periodLabel,
		}));
		if (counters.length)
			out.push({
				label: "Counters",
				rows: counters,
				tab: "counters",
				group: "counters",
			});

		const scores: OverviewRow[] = applyOrder(
			summaries.scores,
			order.scores ?? [],
			(s) => s.definition.id,
		).map((s) => ({
			definition: s.definition,
			kindClass: "score" as const,
			status:
				s.todayValue !== undefined
					? formatScore(s.todayValue)
					: s.latest
						? formatScore(s.latest.value)
						: "—",
			statusTone: undefined,
			statusLabel:
				s.count === 0
					? "never rated"
					: s.mean7 !== undefined
						? `7d avg ${formatScore(s.mean7)}`
						: s.daysSinceLast !== null
							? `${s.daysSinceLast}d ago`
							: "—",
			// The left border tracks staleness, not the rating: the value is
			// already in the status chip and every cell, while "you stopped
			// rating this" has nowhere else to show.
			freshness: s.status,
			dayValues: s.byDate,
			dayTone: (v: number) => scoreTone(s.definition, v),
		}));
		if (scores.length)
			out.push({
				label: "Scores",
				rows: scores,
				tab: "scores",
				group: "scores",
			});

		return out;
	});

	interface TagRow {
		tag: string;
		defs: Definition[];
		counts: Map<string, number>;
	}

	const tagRows: TagRow[] = $derived.by(() => {
		const active = definitions.filter((d) => d.status !== "archived");
		const byTag = new Map<string, Definition[]>();
		for (const d of active) {
			for (const t of d.tags) {
				const list = byTag.get(t) ?? [];
				list.push(d);
				byTag.set(t, list);
			}
		}
		return [...byTag.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([tag, defs]) => {
				const counts = new Map<string, number>();
				for (const d of defs) {
					for (const [date, c] of countsByDefinition.get(d.id) ?? []) {
						counts.set(date, (counts.get(date) ?? 0) + c);
					}
				}
				return { tag, defs, counts };
			});
	});

	function cellCount(counts: Map<string, number> | undefined, d: string): number {
		return counts?.get(d) ?? 0;
	}

	function shortDate(iso: string): string {
		const [_y, m, d] = iso.split("-");
		return `${m}/${d}`;
	}

	function dayOfWeek(iso: string): string {
		const d = new Date(`${iso}T12:00:00`);
		return d.toLocaleDateString(undefined, { weekday: "short" });
	}

	const todayIso = $derived(dateString(now));

	function eventsOn(definitionId: string, date: string): TrackerEvent[] {
		const events = eventsByDefinition.get(definitionId) ?? [];
		return events.filter((e) => {
			const d = new Date(e.timestamp);
			return !Number.isNaN(d.getTime()) && dateString(d) === date;
		});
	}

	function openTagDay(row: TagRow, date: string) {
		const entries: TagDayEntry[] = row.defs.map((definition) => ({
			definition,
			events: eventsOn(definition.id, date),
		}));
		new TagDayModal(plugin.app, row.tag, date, entries, {
			onLogDefinition: (def) =>
				void plugin.openLogModal(def.id, { initialDate: date }),
			onOpenEvent: (def, event) => void plugin.openEventDetail(def, event),
		}).open();
	}
</script>

<div class="lt-ov">
	<div class="lt-ov__toolbar">
		<div class="lt-ov__mode" role="group" aria-label="Overview mode">
			<button
				type="button"
				class="lt-ov__mode-button"
				class:active={mode === "definitions"}
				onclick={() => setMode("definitions")}
			>
				Definitions
			</button>
			<button
				type="button"
				class="lt-ov__mode-button"
				class:active={mode === "tags"}
				onclick={() => setMode("tags")}
			>
				Tags
			</button>
		</div>
	</div>

	{#if groups.length === 0}
		<p class="lt-ov__empty">
			Nothing to show yet. Use “New definition” to start tracking something.
		</p>
	{:else}
		<div class="lt-ov__scroll" bind:clientWidth={gridWidth}>
			<table class="lt-ov__grid">
				<thead>
					<tr>
						<th class="lt-ov__name-col" bind:this={nameTh}>
							{mode === "definitions" ? "Item" : "Tag"}
						</th>
						<th class="lt-ov__status-col" bind:this={statusTh}>Status</th>
						{#each dates as d, i (d)}
							<th
								class="lt-ov__day-col"
								class:lt-ov__day-col--old={i < dates.length - 7}
								class:today={d === todayIso}
								title={d}
								bind:this={dayThs[i]}
							>
								<div class="lt-ov__dow">{dayOfWeek(d)}</div>
								<div class="lt-ov__date">{shortDate(d)}</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody
					use:reorderable={{
						onReorder: (tab, ids) => plugin.reorderDefinitions(tab, ids),
						disabled: mode !== "definitions",
					}}
				>
					{#if mode === "definitions"}
						{#each groups as group (group.label)}
							<tr class="lt-ov__group-row">
								<th
									scope="rowgroup"
									colspan={dates.length + 2}
									class="lt-ov__group-label"
								>
									{group.label}
								</th>
							</tr>
							{#each group.rows as row (row.definition.id)}
								{@const counts = countsByDefinition.get(row.definition.id)}
								<tr
									data-lt-id={row.definition.id}
									data-lt-tab={group.tab}
									data-lt-group={group.group}
								>
									<th
										scope="row"
										data-lt-handle
										class="lt-ov__name-cell"
										class:lt-ov__name-cell--never={row.freshness === "never"}
										class:lt-ov__name-cell--approaching={row.freshness ===
											"approaching"}
										class:lt-ov__name-cell--overdue={row.freshness ===
											"overdue"}
										class:lt-ov__name-cell--ok={row.freshness === "ok"}
										style:border-left-color={row.freshnessColor}
									>
										<button
											type="button"
											class="lt-ov__name-button"
											onclick={() =>
												plugin.openLogModal(row.definition.id)}
										>
											{#if row.definition.emoji}
												<span class="lt-ov__emoji"
													>{row.definition.emoji}</span
												>
											{/if}
											<span class="lt-ov__name-text"
												>{row.definition.displayName}</span
											>
										</button>
									</th>
									<td class="lt-ov__status-cell">
										<span
											class="lt-ov__status"
											class:warn={row.statusTone === "warn"}
											class:danger={row.statusTone === "danger"}
											class:ok={row.statusTone === "ok"}>{row.status}</span
										>
										<div class="lt-ov__status-label">
											{row.statusLabel}
										</div>
									</td>
									{#each dates as d, i (d)}
										{@const c = cellCount(counts, d)}
										{@const rating = row.dayValues?.get(d)}
										{@const rated = rating !== undefined}
										<td
											class="lt-ov__cell"
											class:lt-ov__day-col--old={i < dates.length - 7}
											class:today={d === todayIso}
										>
											<button
												type="button"
												class="lt-ov__cell-button lt-ov__cell-button--{row.kindClass}"
												class:has={row.dayValues ? rated : c > 0}
												style:background-color={rating !== undefined &&
												row.dayTone
													? toneColor(row.dayTone(rating))
													: undefined}
												title={row.dayValues
													? rating !== undefined
														? `${formatScore(rating)} on ${d}`
														: `Rate on ${d}`
													: c > 0
														? `${c} on ${d}`
														: `Log on ${d}`}
												aria-label={row.dayValues
													? rating !== undefined
														? `${row.definition.displayName} rated ${formatScore(rating)} on ${d}`
														: `Rate ${row.definition.displayName} on ${d}`
													: c > 0
														? `${c} events on ${d}`
														: `Log ${row.definition.displayName} on ${d}`}
												onclick={() =>
													plugin.openLogModal(row.definition.id, {
														initialDate: d,
													})}
											>
												{#if row.dayValues}
													{#if rating !== undefined}
														<span class="lt-ov__cell-score"
															>{formatScore(rating)}</span
														>
													{/if}
												{:else if c > 1}
													<span class="lt-ov__cell-count">{c}</span>
												{:else if c === 1}
													<span class="lt-ov__cell-dot"
														>{row.kindClass === "reverse"
															? "✕"
															: "●"}</span
													>
												{/if}
											</button>
										</td>
									{/each}
								</tr>
							{/each}
						{/each}
					{:else}
						{#each tagRows as row (row.tag)}
							<tr>
								<th scope="row" class="lt-ov__name-cell">
									<span class="lt-ov__tag-name">#{row.tag}</span>
								</th>
								<td class="lt-ov__status-cell">
									<span class="lt-ov__status"
										>{row.defs.length}</span
									>
									<div class="lt-ov__status-label">
										item{row.defs.length === 1 ? "" : "s"}
									</div>
								</td>
								{#each dates as d, i (d)}
									{@const c = cellCount(row.counts, d)}
									<td
										class="lt-ov__cell"
										class:lt-ov__day-col--old={i < dates.length - 7}
										class:today={d === todayIso}
									>
										<button
											type="button"
											class="lt-ov__cell-button lt-ov__cell-button--tag"
											class:has={c > 0}
											title={c > 0
												? `${c} on ${d} — click for details`
												: `#${row.tag} on ${d}`}
											aria-label={`${c} events for #${row.tag} on ${d}`}
											onclick={() => openTagDay(row, d)}
										>
											{#if c > 1}
												<span class="lt-ov__cell-count">{c}</span>
											{:else if c === 1}
												<span class="lt-ov__cell-dot">●</span>
											{/if}
										</button>
									</td>
								{/each}
							</tr>
						{:else}
							<tr>
								<td colspan={dates.length + 2} class="lt-ov__empty">
									No tags yet — add tags to your definitions to use
									this view.
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.lt-ov {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.lt-ov__toolbar {
		display: flex;
		justify-content: flex-end;
	}
	.lt-ov__mode {
		display: inline-flex;
		border: 1px solid var(--background-modifier-border);
		border-radius: 0.4rem;
		overflow: hidden;
	}
	.lt-ov__mode-button {
		background: transparent;
		border: none;
		padding: 0.3rem 0.7rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.lt-ov__mode-button.active {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-ov__empty {
		color: var(--text-muted);
		font-style: italic;
		padding: 0.5rem;
	}
	.lt-ov__scroll {
		overflow-x: auto;
		max-width: 100%;
	}
	.lt-ov__grid {
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.lt-ov__grid th,
	.lt-ov__grid td {
		padding: 0.25rem 0.15rem;
		text-align: center;
		vertical-align: middle;
	}
	.lt-ov__name-col {
		text-align: left;
		min-width: 9rem;
		padding-right: 0.4rem;
	}
	.lt-ov__status-col {
		min-width: 3.4rem;
		padding-right: 0.4rem;
	}
	.lt-ov__day-col {
		min-width: 1.9rem;
		font-weight: normal;
		color: var(--text-muted);
	}
	.lt-ov__day-col.today {
		color: var(--interactive-accent);
		font-weight: 600;
	}
	.lt-ov__dow,
	.lt-ov__date {
		font-size: 0.7rem;
	}
	.lt-ov__group-row .lt-ov__group-label {
		text-align: left;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		padding-top: 0.6rem;
		border-bottom: 1px solid var(--background-modifier-border);
	}
	.lt-ov__name-cell {
		text-align: left;
		border-left: 3px solid transparent;
	}
	.lt-ov__name-cell--overdue {
		border-left-color: var(--text-error);
	}
	.lt-ov__name-cell--approaching {
		border-left-color: var(--text-warning);
	}
	.lt-ov__name-cell--never {
		border-left-color: var(--text-faint);
	}
	.lt-ov__name-cell--ok {
		border-left-color: var(--text-success, var(--interactive-accent));
	}
	.lt-ov__name-button {
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
	.lt-ov__name-button:hover {
		background: var(--background-modifier-hover);
		border-radius: 0.3rem;
	}
	.lt-ov__emoji {
		font-size: 1.1rem;
		line-height: 1.2;
		flex-shrink: 0;
	}
	.lt-ov__name-text {
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
	.lt-ov__tag-name {
		font-weight: 600;
		padding-left: 0.25rem;
	}
	.lt-ov__status-cell {
		font-size: 0.85rem;
	}
	.lt-ov__status.warn {
		color: var(--text-warning);
		font-weight: 600;
	}
	.lt-ov__status.danger {
		color: var(--text-error);
		font-weight: 600;
	}
	.lt-ov__status.ok {
		color: var(--text-success, var(--text-muted));
	}
	.lt-ov__status-label {
		font-size: 0.7rem;
		color: var(--text-faint);
	}
	.lt-ov__cell {
		padding: 0;
	}
	.lt-ov__cell.today {
		background: var(--background-modifier-active-hover);
	}
	.lt-ov__cell-button {
		width: 1.7rem;
		height: 1.7rem;
		margin: 0 auto;
		border-radius: 0.25rem;
		background: var(--background-modifier-hover);
		border: 1px solid transparent;
		cursor: pointer;
		font-size: 0.7rem;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.lt-ov__cell-button:hover {
		border-color: var(--interactive-accent);
	}
	.lt-ov__cell-button.has {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-ov__cell-button--reverse.has {
		background: var(--color-red, #e93147);
		color: var(--text-on-accent);
	}
	.lt-ov__cell-button--maint.has {
		background: var(--color-green, #08b94e);
		color: var(--text-on-accent);
	}
	.lt-ov__cell-button--project.has {
		background: var(--color-purple, #7852ee);
		color: var(--text-on-accent);
	}
	.lt-ov__cell-button--counter.has {
		background: var(--color-cyan, #00bfbc);
		color: var(--text-on-accent);
	}
	/*
	 * Scores take their fill from an inline toneColor() rather than a fixed
	 * per-kind color, so `.has` only supplies the text color that sits on it.
	 */
	.lt-ov__cell-button--score.has {
		color: var(--text-on-accent);
	}
	.lt-ov__cell-score {
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.lt-ov__cell-dot {
		font-size: 0.5rem;
	}
	.lt-ov__cell-button--reverse .lt-ov__cell-dot {
		font-size: 0.75rem;
	}
	@media (max-width: 600px) {
		.lt-ov__day-col--old {
			display: none;
		}
		.lt-ov__name-col {
			min-width: 0;
			width: 5.5rem;
			max-width: 5.5rem;
		}
		.lt-ov__name-cell {
			max-width: 5.5rem;
		}
		.lt-ov__name-button {
			gap: 0.25rem;
			padding: 0.2rem;
			font-size: 0.78rem;
		}
		.lt-ov__emoji {
			font-size: 0.95rem;
		}
		.lt-ov__cell-button {
			width: 1.5rem;
			height: 1.5rem;
		}
		.lt-ov__day-col {
			min-width: 1.7rem;
		}
	}
</style>
