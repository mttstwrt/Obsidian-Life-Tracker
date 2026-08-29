<script lang="ts">
	import { onMount } from "svelte";
	import { parseYaml } from "obsidian";
	import type LifeTrackerPlugin from "../main";
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import { dateRange, eventsByDate, toneColor } from "../data/visualizations";
	import { dateString, scoreTone, summarizeScore } from "../data/dashboard";
	import CalendarHeatmap from "./charts/CalendarHeatmap.svelte";
	import Sparkline from "./charts/Sparkline.svelte";
	import StreakBar from "./charts/StreakBar.svelte";
	import EventTimeline from "./charts/EventTimeline.svelte";

	let {
		plugin,
		source,
	}: {
		plugin: LifeTrackerPlugin;
		source: string;
	} = $props();

	const VIEWS = ["heatmap", "sparkline", "streak", "events", "score"] as const;
	type ViewKind = (typeof VIEWS)[number];

	interface ViewSpec {
		view: ViewKind;
		ids: string[];
		byTags: string[];
		days?: number;
		title?: string;
	}

	function parseSpec(raw: string): { spec?: ViewSpec; error?: string } {
		let parsed: unknown;
		try {
			parsed = parseYaml(raw);
		} catch (e) {
			return { error: `Invalid YAML: ${(e as Error).message ?? String(e)}` };
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { error: "Expected a YAML mapping, e.g. `view: heatmap`." };
		}
		const o = parsed as Record<string, unknown>;
		const view = o.view;
		if (typeof view !== "string" || !VIEWS.includes(view as ViewKind)) {
			return {
				error: `Unknown view "${String(view ?? "")}". Available: ${VIEWS.join(", ")}.`,
			};
		}
		const ids: string[] = [];
		if (typeof o.definition === "string") ids.push(o.definition);
		if (Array.isArray(o.definitions)) {
			for (const d of o.definitions) if (typeof d === "string") ids.push(d);
		}
		const byTags = Array.isArray(o.tags)
			? o.tags.filter((t): t is string => typeof t === "string")
			: [];
		if (ids.length === 0 && byTags.length === 0) {
			return {
				error: "Specify what to show: `definition: <id>`, `definitions: [...]`, or `tags: [...]`.",
			};
		}
		const days =
			typeof o.days === "number" && Number.isFinite(o.days) && o.days > 0
				? Math.floor(o.days)
				: undefined;
		return {
			spec: {
				view: view as ViewKind,
				ids,
				byTags,
				days,
				title: typeof o.title === "string" ? o.title : undefined,
			},
		};
	}

	const parsed = $derived(parseSpec(source));

	let events: TrackerEvent[] = $state([]);
	let selectedDefs: Definition[] = $state([]);
	let resolvedNames: string[] = $state([]);
	let loadError = $state("");
	let loading = $state(true);
	let now = $state(new Date());

	async function load() {
		const spec = parsed.spec;
		if (!spec) return;
		try {
			const { definitions } = await plugin.data.loadDefinitions();
			const byId = new Map(definitions.map((d) => [d.id, d]));
			const selected = new Map<string, Definition>();
			for (const id of spec.ids) {
				const def = byId.get(id);
				if (!def) {
					loadError = `Definition not found: "${id}".`;
					loading = false;
					return;
				}
				selected.set(def.id, def);
			}
			for (const tag of spec.byTags) {
				for (const def of definitions) {
					if (def.status !== "archived" && def.tags.includes(tag)) {
						selected.set(def.id, def);
					}
				}
			}
			if (selected.size === 0) {
				loadError = "No definitions matched.";
				loading = false;
				return;
			}
			const all: TrackerEvent[] = [];
			for (const id of selected.keys()) {
				for (const e of await plugin.data.loadEvents(id)) all.push(e);
			}
			all.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
			events = all;
			selectedDefs = [...selected.values()];
			resolvedNames = selectedDefs.map((d) => d.displayName);
			now = new Date();
			loadError = "";
		} catch (e) {
			loadError = (e as Error).message ?? String(e);
		} finally {
			loading = false;
		}
	}

	const title = $derived(parsed.spec?.title ?? resolvedNames.join(", "));

	const sparkValues = $derived.by(() => {
		if (parsed.spec?.view !== "sparkline") return [];
		const counts = eventsByDate(events);
		return dateRange(now, parsed.spec.days ?? 30).map(
			(d) => counts.get(d) ?? 0,
		);
	});

	/**
	 * `view: score` needs exactly one score definition: merging ratings across
	 * definitions would average values from different scales, which means
	 * nothing. Returns an error string instead of a summary when that fails.
	 */
	const scoreView = $derived.by(() => {
		if (parsed.spec?.view !== "score") return null;
		if (selectedDefs.length !== 1) {
			return {
				error: `\`view: score\` needs exactly one definition, got ${selectedDefs.length}.`,
			};
		}
		const def = selectedDefs[0];
		if (def.kind !== "score") {
			return {
				error: `"${def.id}" is a ${def.kind}, not a score.`,
			};
		}
		const summary = summarizeScore(def, events, now);
		const days = parsed.spec.days ?? 30;
		const series: number[] = [];
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setDate(d.getDate() - i);
			const v = summary.byDate.get(dateString(d));
			if (v !== undefined) series.push(v);
		}
		const current = summary.todayValue ?? summary.latest?.value;
		return {
			def,
			summary,
			series,
			days,
			current,
			color:
				current === undefined ? undefined : toneColor(scoreTone(def, current)),
		};
	});

	function fmt(v: number | undefined): string {
		if (v === undefined) return "—";
		return Number.isInteger(v) ? String(v) : v.toFixed(1);
	}

	onMount(() => {
		void load();
		// Live-refresh when a definition file changes underneath the view.
		const ref = plugin.app.vault.on("modify", (f) => {
			if (f.path.startsWith(`${plugin.data.definitionsFolder}/`)) void load();
		});
		return () => plugin.app.vault.offref(ref);
	});
</script>

<div class="lt-block">
	{#if parsed.error}
		<div class="lt-block__error">Life Tracker view: {parsed.error}</div>
	{:else if loading}
		<div class="lt-block__loading">Loading…</div>
	{:else if loadError}
		<div class="lt-block__error">Life Tracker view: {loadError}</div>
	{:else}
		{#if title}
			<div class="lt-block__title">{title}</div>
		{/if}
		{#if parsed.spec?.view === "heatmap"}
			<CalendarHeatmap {events} {now} days={parsed.spec.days ?? 90} />
		{:else if parsed.spec?.view === "streak"}
			<StreakBar {events} {now} days={parsed.spec.days ?? 21} />
		{:else if parsed.spec?.view === "sparkline"}
			<Sparkline values={sparkValues} width={240} height={40} />
		{:else if parsed.spec?.view === "events"}
			<EventTimeline {events} {now} />
		{:else if parsed.spec?.view === "score"}
			{#if scoreView && "error" in scoreView}
				<div class="lt-block__error">Life Tracker view: {scoreView.error}</div>
			{:else if scoreView}
				<div class="lt-block__score">
					<div class="lt-block__score-value">
						<span class="lt-block__score-current" style:color={scoreView.color}
							>{fmt(scoreView.current)}</span
						>
						<span class="lt-block__score-scale"
							>/ {scoreView.def.scale[1]}</span
						>
					</div>
					<div class="lt-block__score-side">
						{#if scoreView.series.length > 1}
							<Sparkline
								values={scoreView.series}
								width={180}
								height={28}
								title="recent ratings"
							/>
						{/if}
						<div class="lt-block__score-stats">
							{#if scoreView.summary.mean7 !== undefined}
								<span>7d {fmt(scoreView.summary.mean7)}</span>
							{/if}
							{#if scoreView.summary.mean30 !== undefined}
								<span>30d {fmt(scoreView.summary.mean30)}</span>
							{/if}
							<span>
								{scoreView.series.length} rated in {scoreView.days}d
							</span>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.lt-block {
		padding: 0.4rem 0;
	}
	.lt-block__title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}
	.lt-block__loading {
		color: var(--text-faint);
		font-size: 0.85rem;
	}
	.lt-block__score {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.lt-block__score-value {
		display: flex;
		align-items: baseline;
		gap: 0.2rem;
	}
	.lt-block__score-current {
		font-size: 1.8rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.lt-block__score-scale {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.lt-block__score-side {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.lt-block__score-stats {
		display: flex;
		gap: 0.6rem;
		font-size: 0.7rem;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}
	.lt-block__error {
		border-left: 3px solid var(--text-error);
		background: var(--background-modifier-hover);
		color: var(--text-error);
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		border-radius: 0 0.3rem 0.3rem 0;
	}
</style>
