<script lang="ts">
	import { onMount } from "svelte";
	import type LifeTrackerPlugin from "../main";
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import {
		type DashboardSummaries,
		summarizeAll,
	} from "../data/dashboard";
	import DashboardOverview from "./DashboardOverview.svelte";
	import DashboardHabits from "./DashboardHabits.svelte";
	import DashboardMaintenance from "./DashboardMaintenance.svelte";
	import DashboardProjects from "./DashboardProjects.svelte";
	import DashboardCounters from "./DashboardCounters.svelte";
	import DashboardScores from "./DashboardScores.svelte";
	import DashboardTags from "./DashboardTags.svelte";
	import DashboardAnalytics from "./DashboardAnalytics.svelte";
	import DashboardSettings from "./DashboardSettings.svelte";

	let {
		plugin,
		registerApi,
	}: {
		plugin: LifeTrackerPlugin;
		registerApi?: (api: { refresh: () => void }) => void;
	} = $props();

	type TabKey =
		| "overview"
		| "habits"
		| "maintenance"
		| "projects"
		| "counters"
		| "scores"
		| "tags"
		| "analytics"
		| "settings";

	const tabs: { key: TabKey; label: string; emoji: string }[] = [
		{ key: "overview", label: "Overview", emoji: "🌅" },
		{ key: "habits", label: "Habits", emoji: "🔁" },
		{ key: "maintenance", label: "Maintenance", emoji: "🛠" },
		{ key: "projects", label: "Projects", emoji: "📁" },
		{ key: "counters", label: "Counters", emoji: "🔢" },
		{ key: "scores", label: "Scores", emoji: "📈" },
		{ key: "tags", label: "Tags", emoji: "🏷" },
		{ key: "analytics", label: "Analytics", emoji: "📊" },
		{ key: "settings", label: "Settings", emoji: "⚙" },
	];

	let activeTab: TabKey = $state("overview");
	let definitions: Definition[] = $state([]);
	let eventsByDefinition: Map<string, TrackerEvent[]> = $state(new Map());
	let warnings: string[] = $state([]);
	let now: Date = $state(new Date());
	let loading = $state(true);
	let loadError = $state("");

	const summaries: DashboardSummaries = $derived(
		summarizeAll({
			definitions,
			eventsByDefinitionId: eventsByDefinition,
			now,
			habitWindowMode: plugin.settings.habitWindowMode,
		}),
	);

	async function load() {
		try {
			const d = await plugin.data.loadDefinitions();
			definitions = d.definitions;
			warnings = d.warnings;
			eventsByDefinition = await plugin.data.loadEventsByDefinitionId();
			now = new Date();
			loadError = "";
		} catch (e) {
			loadError = (e as Error).message ?? String(e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		registerApi?.({
			refresh: () => {
				void load();
			},
		});
		void load();
	});
</script>

<div class="lt-dash">
	<header class="lt-dash__header">
		<h1 class="lt-dash__title">Life Tracker</h1>
		<div class="lt-dash__header-actions">
			<button
				type="button"
				class="lt-dash__cta"
				onclick={() => plugin.openPicker()}
			>
				+ Log
			</button>
			<button
				type="button"
				class="lt-dash__secondary"
				onclick={() => plugin.openNewDefinition()}
			>
				New definition
			</button>
		</div>
	</header>

	<nav class="lt-dash__tabs" aria-label="Dashboard sections">
		{#each tabs as t (t.key)}
			<button
				type="button"
				class="lt-dash__tab"
				class:active={activeTab === t.key}
				aria-pressed={activeTab === t.key}
				onclick={() => (activeTab = t.key)}
			>
				<span class="lt-dash__tab-emoji" aria-hidden="true">{t.emoji}</span>
				<span class="lt-dash__tab-label">{t.label}</span>
			</button>
		{/each}
	</nav>

	{#if loading}
		<div class="lt-dash__loading">Loading…</div>
	{:else if loadError}
		<div class="lt-dash__error">Failed to load: {loadError}</div>
	{:else}
		{#if warnings.length > 0}
			<div class="lt-dash__warnings">
				<strong>
					{warnings.length} parsing warning{warnings.length === 1
						? ""
						: "s"}
				</strong>
				<details>
					<summary>Details</summary>
					<ul>
						{#each warnings as w (w)}
							<li>{w}</li>
						{/each}
					</ul>
				</details>
			</div>
		{/if}

		<div class="lt-dash__panel">
			{#if activeTab === "overview"}
				<DashboardOverview
					{summaries}
					{plugin}
					{definitions}
					{eventsByDefinition}
					{now}
				/>
			{:else if activeTab === "habits"}
				<DashboardHabits {summaries} {plugin} {now} />
			{:else if activeTab === "maintenance"}
				<DashboardMaintenance
					{summaries}
					{plugin}
					{eventsByDefinition}
					{now}
				/>
			{:else if activeTab === "projects"}
				<DashboardProjects
					{summaries}
					{plugin}
					{eventsByDefinition}
					{now}
				/>
			{:else if activeTab === "counters"}
				<DashboardCounters
					{summaries}
					{plugin}
					{eventsByDefinition}
					{now}
				/>
			{:else if activeTab === "scores"}
				<DashboardScores {summaries} {plugin} {now} />
			{:else if activeTab === "tags"}
				<DashboardTags {definitions} {eventsByDefinition} {now} {plugin} />
			{:else if activeTab === "analytics"}
				<DashboardAnalytics
					{summaries}
					{eventsByDefinition}
					{definitions}
					{warnings}
					{plugin}
				/>
			{:else if activeTab === "settings"}
				<DashboardSettings {plugin} {definitions} />
			{/if}
		</div>
	{/if}
</div>

<style>
	.lt-dash {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.5rem;
		max-width: 1100px;
		margin: 0 auto;
	}
	.lt-dash__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.lt-dash__title {
		margin: 0;
		font-size: 1.3rem;
	}
	.lt-dash__header-actions {
		display: flex;
		gap: 0.5rem;
	}
	.lt-dash__cta {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-dash__tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		border-bottom: 1px solid var(--background-modifier-border);
		padding-bottom: 0.25rem;
	}
	.lt-dash__tab {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.4rem 0.75rem;
		border-radius: 0.4rem;
		background: transparent;
		border: 1px solid transparent;
		font-size: 0.9rem;
		cursor: pointer;
		min-height: 2.25rem;
	}
	.lt-dash__tab:hover {
		background: var(--background-modifier-hover);
	}
	.lt-dash__tab.active {
		background: var(--background-modifier-active-hover);
		border-color: var(--background-modifier-border);
		font-weight: 600;
	}
	.lt-dash__loading,
	.lt-dash__error {
		padding: 1rem;
		color: var(--text-muted);
	}
	.lt-dash__error {
		color: var(--text-error);
	}
	.lt-dash__warnings {
		background: var(--background-modifier-hover);
		border-left: 3px solid var(--text-warning);
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
	}
	.lt-dash__warnings ul {
		margin: 0.4rem 0 0;
		padding-left: 1.2rem;
		font-family: var(--font-monospace);
		font-size: 0.8rem;
	}
	.lt-dash__panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	@media (max-width: 600px) {
		.lt-dash__tab-label {
			display: none;
		}
		.lt-dash__tab {
			padding: 0.4rem 0.55rem;
		}
	}
</style>
