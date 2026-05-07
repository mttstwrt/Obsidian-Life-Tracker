<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import type {
		DashboardSummaries,
		HabitSummary,
		MaintenanceSummary,
		ProjectSummary,
		ReverseHabitSummary,
	} from "../data/dashboard";

	let {
		summaries,
		plugin,
		now: _now,
	}: {
		summaries: DashboardSummaries;
		plugin: LifeTrackerPlugin;
		now: Date;
	} = $props();

	type Row =
		| {
				kind: "maint-overdue";
				tier: 1;
				sortKey: number;
				id: string;
				summary: MaintenanceSummary;
		  }
		| {
				kind: "habit-due";
				tier: 2;
				sortKey: number;
				id: string;
				summary: HabitSummary;
		  }
		| {
				kind: "maint-approaching";
				tier: 3;
				sortKey: number;
				id: string;
				summary: MaintenanceSummary;
		  }
		| {
				kind: "reverse-milestone";
				tier: 4;
				sortKey: number;
				id: string;
				summary: ReverseHabitSummary;
		  }
		| {
				kind: "project-dormant";
				tier: 5;
				sortKey: number;
				id: string;
				summary: ProjectSummary;
		  }
		| {
				kind: "habit-done";
				tier: 6;
				sortKey: number;
				id: string;
				summary: HabitSummary;
		  };

	const rows: Row[] = $derived.by(() => {
		const out: Row[] = [];

		for (const m of summaries.maintenance) {
			if (m.status === "overdue" || m.status === "never") {
				out.push({
					kind: "maint-overdue",
					tier: 1,
					sortKey: -m.urgency,
					id: m.definition.id,
					summary: m,
				});
			} else if (m.status === "approaching") {
				out.push({
					kind: "maint-approaching",
					tier: 3,
					sortKey: -m.freshness,
					id: m.definition.id,
					summary: m,
				});
			}
		}

		for (const h of summaries.habits) {
			if (h.periodTarget <= 0) continue;
			if (h.dueToday) {
				const remaining =
					(h.periodTarget - h.periodCount) / h.periodTarget;
				out.push({
					kind: "habit-due",
					tier: 2,
					sortKey: -remaining,
					id: h.definition.id,
					summary: h,
				});
			} else {
				out.push({
					kind: "habit-done",
					tier: 6,
					sortKey: 0,
					id: h.definition.id,
					summary: h,
				});
			}
		}

		for (const r of summaries.reverseHabits) {
			if (r.inMilestoneRange) {
				out.push({
					kind: "reverse-milestone",
					tier: 4,
					sortKey: r.daysSince ?? 0,
					id: r.definition.id,
					summary: r,
				});
			}
		}

		for (const p of summaries.projects) {
			if (p.isDormant && p.definition.status === "active") {
				out.push({
					kind: "project-dormant",
					tier: 5,
					sortKey: -(p.daysSince ?? 0),
					id: p.definition.id,
					summary: p,
				});
			}
		}

		out.sort((a, b) => {
			if (a.tier !== b.tier) return a.tier - b.tier;
			if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
			const an =
				"summary" in a ? a.summary.definition.displayName : "";
			const bn =
				"summary" in b ? b.summary.definition.displayName : "";
			return an.localeCompare(bn);
		});

		return out;
	});

	const isEmpty = $derived(rows.length === 0);
	const hasUrgent = $derived(
		rows.some((r) => r.tier !== 6),
	);

	function periodAbbr(label: HabitSummary["periodLabel"]): string {
		if (label === "today") return "/d";
		if (label === "this week" || label === "past 7 days") return "/wk";
		if (label === "this month" || label === "past 30 days") return "/mo";
		return "";
	}

	function dotsProgress(count: number, target: number): {
		filled: number;
		empty: number;
	} {
		const cap = Math.min(target, 7);
		const ratio = target > 0 ? Math.min(1, count / target) : 0;
		const filled = Math.round(ratio * cap);
		return { filled, empty: cap - filled };
	}

	function maintBarPct(daysSince: number | null, intervalDays: number): number {
		if (daysSince === null) return 100;
		if (intervalDays <= 0) return 100;
		return Math.min(150, (daysSince / intervalDays) * 100);
	}

	function reverseSegment(s: ReverseHabitSummary): {
		lo: number;
		hi: number;
		marker: number;
	} {
		const days = s.daysSince ?? 0;
		const lo = s.lastMilestone ?? 0;
		const hi = s.nextMilestone ?? Math.max(days, lo + 1);
		return { lo, hi, marker: days };
	}

	function reverseMarkerPct(seg: { lo: number; hi: number; marker: number }): number {
		const span = seg.hi - seg.lo;
		if (span <= 0) return 100;
		return Math.max(0, Math.min(100, ((seg.marker - seg.lo) / span) * 100));
	}
</script>

<div class="lt-today">
	{#if isEmpty}
		<p class="lt-today__empty">
			Nothing to track today. Log something to keep things moving.
		</p>
	{:else if !hasUrgent}
		<p class="lt-today__empty lt-today__empty--soft">
			All caught up — habits below are already done for the period.
		</p>
	{/if}

	{#each rows as r (r.kind + ":" + r.id)}
		<button
			type="button"
			class="lt-row lt-row--{r.kind}"
			onclick={() => plugin.openLogModal(r.summary.definition.id)}
		>
			<div class="lt-row__head">
				{#if r.summary.definition.emoji}
					<span class="lt-row__emoji" aria-hidden="true">
						{r.summary.definition.emoji}
					</span>
				{/if}
				<span class="lt-row__name">{r.summary.definition.displayName}</span>
				<span class="lt-row__chip">
					{#if r.kind === "habit-due"}
						{r.summary.periodCount}/{r.summary.periodTarget}{periodAbbr(r.summary.periodLabel)}
						{#if r.summary.currentStreak > 0}
							<span class="lt-row__streak">🔥 {r.summary.currentStreak}</span>
						{/if}
					{:else if r.kind === "habit-done"}
						<span class="lt-row__check">✓</span>
						{r.summary.periodCount}/{r.summary.periodTarget}{periodAbbr(r.summary.periodLabel)}
						{#if r.summary.currentStreak > 0}
							<span class="lt-row__streak">🔥 {r.summary.currentStreak}</span>
						{/if}
					{:else if r.kind === "maint-overdue"}
						{#if r.summary.daysSince === null}
							never logged
						{:else}
							{Math.max(
								1,
								r.summary.daysSince - r.summary.definition.intervalDays,
							)}d over
						{/if}
					{:else if r.kind === "maint-approaching"}
						due in {r.summary.definition.intervalDays - (r.summary.daysSince ?? 0)}d
					{:else if r.kind === "reverse-milestone"}
						{#if r.summary.daysSince !== null}
							day {r.summary.daysSince}
						{/if}
					{:else if r.kind === "project-dormant"}
						{r.summary.daysSince ?? 0}d quiet
					{/if}
				</span>
			</div>

			<div class="lt-row__viz">
				{#if r.kind === "habit-due" || r.kind === "habit-done"}
					{@const dots = dotsProgress(
						r.summary.periodCount,
						r.summary.periodTarget,
					)}
					<span class="lt-row__dots" aria-hidden="true">
						{#each { length: dots.filled } as _, i (i)}
							<span class="lt-row__dot lt-row__dot--filled"></span>
						{/each}
						{#each { length: dots.empty } as _, i (i)}
							<span class="lt-row__dot"></span>
						{/each}
					</span>
				{:else if r.kind === "maint-overdue" || r.kind === "maint-approaching"}
					{@const pct = maintBarPct(
						r.summary.daysSince,
						r.summary.definition.intervalDays,
					)}
					<span class="lt-row__bar">
						<span
							class="lt-row__bar-fill"
							style="width: {Math.min(100, pct)}%"
						></span>
						{#if pct > 100}
							<span
								class="lt-row__bar-over"
								style="width: {Math.min(50, pct - 100)}%"
							></span>
						{/if}
					</span>
					<span class="lt-row__sub">
						{r.summary.daysSince ?? 0}d / {r.summary.definition.intervalDays}d
					</span>
				{:else if r.kind === "reverse-milestone"}
					{@const seg = reverseSegment(r.summary)}
					<span class="lt-row__segment">
						<span class="lt-row__seg-end">{seg.lo}d</span>
						<span class="lt-row__seg-track">
							<span
								class="lt-row__seg-marker"
								style="left: {reverseMarkerPct(seg)}%"
							></span>
						</span>
						<span class="lt-row__seg-end">{seg.hi}d</span>
					</span>
				{:else if r.kind === "project-dormant"}
					<span class="lt-row__sub">
						{r.summary.eventsLast30} in last 30d
					</span>
				{/if}
			</div>
		</button>
	{/each}
</div>

<style>
	.lt-today {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.lt-today__empty {
		color: var(--text-muted);
		font-style: italic;
		margin: 0.5rem 0;
	}
	.lt-today__empty--soft {
		font-style: normal;
	}

	.lt-row {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 1.7rem 1.75rem;
		border-radius: 0.4rem;
		border: 1px solid transparent;
		background: var(--background-secondary);
		text-align: left;
		cursor: pointer;
		font: inherit;
		color: inherit;
		width: 100%;
	}
	.lt-row:hover {
		background: var(--background-modifier-hover);
	}
	.lt-row:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 1px;
	}

	.lt-row--maint-overdue {
		border-left: 3px solid var(--text-error);
	}
	.lt-row--maint-approaching {
		border-left: 3px solid var(--text-warning);
	}
	.lt-row--reverse-milestone {
		border-left: 3px solid var(--interactive-accent);
	}
	.lt-row--habit-done {
		opacity: 0.55;
	}
	.lt-row--habit-done:hover {
		opacity: 1;
	}

	.lt-row__head {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}
	.lt-row__emoji {
		font-size: 1.05rem;
		flex-shrink: 0;
	}
	.lt-row__name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}
	.lt-row__chip {
		color: var(--text-muted);
		font-size: 0.78rem;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
	}
	.lt-row__streak {
		color: var(--text-normal);
	}
	.lt-row__check {
		color: var(--text-success, var(--interactive-accent));
	}

	.lt-row__viz {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.lt-row__sub {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.lt-row__dots {
		display: inline-flex;
		gap: 0.2rem;
	}
	.lt-row__dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--background-primary);
		border: 1.5px solid var(--background-modifier-border-hover, var(--text-faint));
	}
	.lt-row__dot--filled {
		background: var(--interactive-accent);
		border-color: var(--interactive-accent);
	}

	.lt-row__bar {
		position: relative;
		flex: 1;
		height: 0.4rem;
		background: var(--background-modifier-border);
		border-radius: 0.2rem;
		overflow: hidden;
		min-width: 60px;
	}
	.lt-row__bar-fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: var(--interactive-accent);
	}
	.lt-row--maint-overdue .lt-row__bar-fill {
		background: var(--text-error);
	}
	.lt-row--maint-approaching .lt-row__bar-fill {
		background: var(--text-warning);
	}
	.lt-row__bar-over {
		position: absolute;
		left: 100%;
		top: 0;
		bottom: 0;
		background: var(--text-error);
		opacity: 0.5;
	}

	.lt-row__segment {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex: 1;
	}
	.lt-row__seg-end {
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.lt-row__seg-track {
		position: relative;
		flex: 1;
		height: 0.25rem;
		background: var(--background-modifier-border);
		border-radius: 0.15rem;
		min-width: 60px;
	}
	.lt-row__seg-marker {
		position: absolute;
		top: -0.18rem;
		width: 0.6rem;
		height: 0.6rem;
		margin-left: -0.3rem;
		border-radius: 50%;
		background: var(--interactive-accent);
	}
</style>
