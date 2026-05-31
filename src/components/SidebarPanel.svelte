<script lang="ts">
	import { onMount } from "svelte";
	import type LifeTrackerPlugin from "../main";
	import type { Definition, Event as TrackerEvent } from "../data/types";
	import {
		type DashboardSummaries,
		summarizeAll,
	} from "../data/dashboard";
	import DashboardToday from "./DashboardToday.svelte";

	let {
		plugin,
		registerApi,
	}: {
		plugin: LifeTrackerPlugin;
		registerApi?: (api: { refresh: () => void }) => void;
	} = $props();

	let definitions: Definition[] = $state([]);
	let eventsByDefinition: Map<string, TrackerEvent[]> = $state(new Map());
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

<div class="lt-sidebar">
	<header class="lt-sidebar__header">
		<h2 class="lt-sidebar__title">Life Tracker</h2>
		<button
			type="button"
			class="lt-sidebar__cta"
			onclick={() => plugin.openPicker()}
		>
			+ Log
		</button>
	</header>

	{#if loading}
		<div class="lt-sidebar__loading">Loading…</div>
	{:else if loadError}
		<div class="lt-sidebar__error">Failed to load: {loadError}</div>
	{:else}
		<DashboardToday
			{summaries}
			{plugin}
			{definitions}
			{eventsByDefinition}
			{now}
		/>
	{/if}
</div>

<style>
	.lt-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.5rem;
	}
	.lt-sidebar__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.lt-sidebar__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.lt-sidebar__cta {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		padding: 0.3rem 0.65rem;
		font-size: 0.85rem;
	}
	.lt-sidebar__loading,
	.lt-sidebar__error {
		padding: 0.5rem;
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.lt-sidebar__error {
		color: var(--text-error);
	}
</style>
