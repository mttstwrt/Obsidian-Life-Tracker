<script lang="ts">
	import type LifeTrackerPlugin from "../main";
	import type { Definition } from "../data/types";

	let {
		plugin,
		definitions,
	}: {
		plugin: LifeTrackerPlugin;
		definitions: Definition[];
	} = $props();

	const sorted = $derived(
		[...definitions].sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		),
	);
</script>

<div class="lt-set">
	<section>
		<h3 class="lt-set__heading">Definitions</h3>
		<div class="lt-set__cta-row">
			<button
				type="button"
				class="lt-set__cta"
				onclick={() => plugin.openNewDefinition()}
			>
				+ New definition
			</button>
			<button
				type="button"
				onclick={() => plugin.openPluginSettings()}
			>
				Open plugin settings
			</button>
		</div>
		{#if sorted.length === 0}
			<p class="lt-set__empty">No definitions yet.</p>
		{:else}
			<ul class="lt-set__list">
				{#each sorted as def (def.id)}
					<li class="lt-set__row">
						<span class="lt-set__emoji">{def.emoji ?? "•"}</span>
						<div class="lt-set__main">
							<div class="lt-set__title">{def.displayName}</div>
							<div class="lt-set__meta">
								{def.kind} · {def.id}
								{#if def.status !== "active"}· {def.status}{/if}
							</div>
						</div>
						<button
							type="button"
							onclick={() => plugin.openEditDefinition(def.id)}
						>
							Edit
						</button>
						{#if def.status === "archived"}
							<button
								type="button"
								onclick={() =>
									plugin.unarchiveAndRefresh(def.id)}
							>
								Unarchive
							</button>
						{:else}
							<button
								type="button"
								onclick={() =>
									plugin.archiveAndRefresh(def.id)}
							>
								Archive
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h3 class="lt-set__heading">About</h3>
		<p class="lt-set__about">
			Life Tracker stores everything as plain markdown under
			<code>{plugin.data.definitionsFolder}/</code>. Quick-log commands and
			the root folder are configured in plugin settings.
		</p>
	</section>
</div>

<style>
	.lt-set {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.lt-set__heading {
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin: 0 0 0.4rem;
	}
	.lt-set__cta-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.lt-set__cta {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-set__empty {
		color: var(--text-muted);
		font-style: italic;
	}
	.lt-set__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.lt-set__row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		background: var(--background-secondary);
		border-radius: 0.4rem;
	}
	.lt-set__emoji {
		font-size: 1.3rem;
	}
	.lt-set__main {
		flex: 1;
		min-width: 0;
	}
	.lt-set__title {
		font-weight: 500;
	}
	.lt-set__meta {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.lt-set__about {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.lt-set__about code {
		font-family: var(--font-monospace);
	}
</style>
