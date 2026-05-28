<script lang="ts">
	import type {
		Definition,
		Event as TrackerEvent,
		FieldDef,
	} from "../data/types";
	import { eventContextStats } from "../data/visualizations";
	import FieldChart from "./charts/FieldChart.svelte";
	import EventTimeline from "./charts/EventTimeline.svelte";

	let {
		definition,
		event,
		definitionEvents = [],
		onEdit,
		onDelete,
		onClose,
	}: {
		definition: Definition;
		event: TrackerEvent;
		definitionEvents?: TrackerEvent[];
		onEdit: () => void;
		onDelete: () => Promise<void> | void;
		onClose: () => void;
	} = $props();

	const chartableFields = $derived(
		(definition.fieldSchema ?? []).filter((f) => {
			if (f.retired) return false;
			if (f.type === "number" || f.type === "enum" || f.type === "list")
				return true;
			return false;
		}),
	);

	const hasContext = $derived(definitionEvents.length > 1);

	const now = new Date();
	const stats = $derived(
		eventContextStats(definitionEvents, event.id, now),
	);

	function gapLabel(days: number | null): string {
		if (days === null) return "—";
		if (days === 0) return "same day";
		return `${days}d`;
	}

	function shortDate(ts: string | null): string {
		if (!ts) return "—";
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	}

	let confirming = $state(false);
	let working = $state(false);

	const schemaByKey = $derived(
		new Map((definition.fieldSchema ?? []).map((f) => [f.key, f])),
	);

	const orderedFieldKeys = $derived.by(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const f of definition.fieldSchema ?? []) {
			if (event.fields[f.key] !== undefined) {
				out.push(f.key);
				seen.add(f.key);
			}
		}
		const extras = Object.keys(event.fields)
			.filter((k) => !seen.has(k))
			.sort();
		return { ordered: out, extras };
	});

	function formatTimestamp(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleString();
	}

	function formatCoerced(v: unknown): string {
		if (Array.isArray(v)) return v.join(", ");
		if (v === undefined || v === null) return "";
		return String(v);
	}

	function fieldLabel(key: string): string {
		const f = schemaByKey.get(key);
		if (!f) return key;
		return f.prompt ?? f.key;
	}

	function fieldTypeLabel(f: FieldDef): string {
		if (f.type === "number" && f.range)
			return `number (${f.range[0]}–${f.range[1]})`;
		if (f.type === "enum") return `enum (${(f.options ?? []).join(", ")})`;
		if (f.type === "list") return `list of ${f.itemType ?? "string"}`;
		return f.type;
	}

	async function handleDelete() {
		if (working) return;
		if (!confirming) {
			confirming = true;
			return;
		}
		working = true;
		try {
			await onDelete();
		} finally {
			working = false;
		}
	}
</script>

<div class="lt-detail">
	<header class="lt-detail__header">
		<span class="lt-detail__emoji" aria-hidden="true"
			>{definition.emoji ?? "•"}</span
		>
		<div class="lt-detail__heading">
			<h2 class="lt-detail__title">{definition.displayName}</h2>
			<div class="lt-detail__sub">{formatTimestamp(event.timestamp)}</div>
		</div>
	</header>

	<dl class="lt-detail__grid">
		{#if event.value !== undefined}
			<dt>Value</dt>
			<dd>{event.value}</dd>
		{/if}
		{#if event.note}
			<dt>Note</dt>
			<dd>{event.note}</dd>
		{/if}

		{#each orderedFieldKeys.ordered as key (key)}
			{@const f = schemaByKey.get(key)}
			{@const v = event.fields[key]}
			<dt>
				{fieldLabel(key)}
				{#if f}<span class="lt-detail__type">· {fieldTypeLabel(f)}</span>{/if}
				{#if f?.retired}<span class="lt-detail__retired">retired</span>{/if}
			</dt>
			<dd>
				{#if v.coercionError}
					<span class="lt-detail__warn" title={v.coercionError}>
						⚠ {v.raw}
					</span>
					<div class="lt-detail__warn-msg">{v.coercionError}</div>
				{:else}
					{formatCoerced(v.coerced)}
					{#if v.rangeWarning}
						<span class="lt-detail__range" title={v.rangeWarning}>
							⚠
						</span>
						<div class="lt-detail__warn-msg">{v.rangeWarning}</div>
					{/if}
				{/if}
			</dd>
		{/each}
	</dl>

	{#if orderedFieldKeys.extras.length > 0}
		<section class="lt-detail__extras">
			<h3>Extra fields</h3>
			<dl class="lt-detail__grid">
				{#each orderedFieldKeys.extras as key (key)}
					{@const v = event.fields[key]}
					<dt>{key}</dt>
					<dd>
						{#if v.coercionError}
							<span class="lt-detail__warn">⚠ {v.raw}</span>
							<div class="lt-detail__warn-msg">{v.coercionError}</div>
						{:else}
							{formatCoerced(v.coerced)}
						{/if}
					</dd>
				{/each}
			</dl>
		</section>
	{/if}

	<section class="lt-detail__history">
		<h3>History</h3>
		{#if hasContext}
			<EventTimeline
				events={definitionEvents}
				{now}
				highlightId={event.id}
			/>
		{/if}
		<dl class="lt-detail__stats">
			<div class="lt-detail__stat">
				<dt>Event</dt>
				<dd>{stats.index || "?"} of {stats.total}</dd>
			</div>
			<div class="lt-detail__stat">
				<dt>Since previous</dt>
				<dd>{gapLabel(stats.sincePrevDays)}</dd>
			</div>
			<div class="lt-detail__stat">
				<dt>Until next</dt>
				<dd>{gapLabel(stats.untilNextDays)}</dd>
			</div>
			{#if stats.avgGapDays !== null}
				<div class="lt-detail__stat">
					<dt>Typical gap</dt>
					<dd>~{stats.avgGapDays}d</dd>
				</div>
			{/if}
			<div class="lt-detail__stat">
				<dt>Last 30 days</dt>
				<dd>{stats.last30}</dd>
			</div>
			{#if hasContext}
				<div class="lt-detail__stat">
					<dt>Span</dt>
					<dd>{shortDate(stats.firstTimestamp)} → {shortDate(stats.lastTimestamp)}</dd>
				</div>
			{/if}
		</dl>
	</section>

	{#if hasContext && chartableFields.length > 0}
		<section class="lt-detail__charts">
			<h3>Across all events</h3>
			<div class="lt-detail__charts-grid">
				{#each chartableFields as f (f.key)}
					<FieldChart events={definitionEvents} field={f} />
				{/each}
			</div>
		</section>
	{/if}

	{#if event.id}
		<div class="lt-detail__id">id: {event.id}</div>
	{/if}

	<div class="lt-detail__actions">
		<button type="button" onclick={onClose}>Close</button>
		<button type="button" onclick={onEdit} disabled={working}>Edit</button>
		<button
			type="button"
			class="lt-detail__danger"
			onclick={handleDelete}
			disabled={working}
		>
			{confirming ? "Confirm delete" : "Delete"}
		</button>
	</div>
</div>

<style>
	.lt-detail {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: min(440px, 92vw);
	}
	.lt-detail__header {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
	}
	.lt-detail__emoji {
		font-size: 1.6rem;
	}
	.lt-detail__title {
		margin: 0;
		font-size: 1.1rem;
	}
	.lt-detail__sub {
		color: var(--text-muted);
		font-size: 0.85rem;
	}
	.lt-detail__grid {
		display: grid;
		grid-template-columns: max-content 1fr;
		row-gap: 0.35rem;
		column-gap: 0.75rem;
		margin: 0;
	}
	.lt-detail__grid dt {
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 500;
	}
	.lt-detail__grid dd {
		margin: 0;
		font-size: 0.95rem;
	}
	.lt-detail__type {
		color: var(--text-faint);
		font-weight: 400;
	}
	.lt-detail__retired {
		margin-left: 0.4rem;
		font-size: 0.7rem;
		color: var(--text-faint);
		text-transform: uppercase;
	}
	.lt-detail__extras {
		margin-top: 0.25rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--background-modifier-border);
	}
	.lt-detail__extras h3 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		margin: 0 0 0.35rem;
	}
	.lt-detail__id {
		font-family: var(--font-monospace);
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.lt-detail__warn {
		color: var(--text-warning);
	}
	.lt-detail__range {
		color: var(--text-warning);
		margin-left: 0.25rem;
	}
	.lt-detail__warn-msg {
		font-size: 0.75rem;
		color: var(--text-warning);
	}
	.lt-detail__actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.lt-detail__danger {
		color: var(--text-on-accent);
		background: var(--background-modifier-error);
	}
	.lt-detail__history {
		margin-top: 0.25rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--background-modifier-border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-detail__history h3 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		margin: 0;
	}
	.lt-detail__stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.4rem;
		margin: 0;
	}
	.lt-detail__stat {
		background: var(--background-secondary);
		border-radius: 0.35rem;
		padding: 0.35rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.lt-detail__stat dt {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-faint);
	}
	.lt-detail__stat dd {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.lt-detail__charts {
		margin-top: 0.25rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--background-modifier-border);
	}
	.lt-detail__charts h3 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		margin: 0 0 0.4rem;
	}
	.lt-detail__charts-grid {
		display: grid;
		gap: 0.4rem;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
	}
</style>
