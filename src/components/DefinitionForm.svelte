<script lang="ts">
	import { untrack } from "svelte";
	import {
		type DefinitionFormInput,
		type FieldSchemaRowInput,
		buildDefinitionFromInput,
		emptyFormInput,
	} from "../data/definitionForm";
	import type {
		Definition,
		DefinitionKind,
		FieldItemType,
		FieldType,
	} from "../data/types";

	let {
		mode,
		initial,
		existingIds,
		existing,
		onSubmit,
		onCancel,
	}: {
		mode: "create" | "edit";
		initial?: DefinitionFormInput;
		existingIds: Set<string>;
		existing?: Definition;
		onSubmit: (
			def: Definition,
			warnings: string[],
		) => Promise<void> | void;
		onCancel: () => void;
	} = $props();

	let form: DefinitionFormInput = $state(
		untrack(() => initial ?? emptyFormInput("habit")),
	);
	let kindPicked = $state(
		untrack(() => mode === "edit" || initial !== undefined),
	);
	let error = $state("");
	let submitting = $state(false);
	let confirmWarnings: string[] | null = $state(null);

	const kindOptions: Array<{
		kind: DefinitionKind;
		label: string;
		emoji: string;
		desc: string;
	}> = [
		{
			kind: "habit",
			label: "Habit",
			emoji: "🔁",
			desc: "Hit a cadence target",
		},
		{
			kind: "maintenance",
			label: "Maintenance",
			emoji: "🛠",
			desc: "Stay within an interval",
		},
		{
			kind: "reverse-habit",
			label: "Reverse habit",
			emoji: "🚫",
			desc: "Maximize the gap since last event",
		},
		{
			kind: "project",
			label: "Project",
			emoji: "📁",
			desc: "Track effort, no target",
		},
		{
			kind: "counter",
			label: "Counter",
			emoji: "🔢",
			desc: "Accumulate, optionally toward a goal",
		},
	];

	const fieldTypes: FieldType[] = [
		"string",
		"number",
		"boolean",
		"enum",
		"list",
	];
	const itemTypes: FieldItemType[] = ["string", "number", "boolean"];

	function pickKind(kind: DefinitionKind) {
		form = emptyFormInput(kind);
		kindPicked = true;
	}

	function addFieldRow() {
		form.fieldSchema = [
			...form.fieldSchema,
			{
				key: "",
				type: "string",
				rangeMin: "",
				rangeMax: "",
				optionsCsv: "",
				itemType: "string",
				required: false,
				prompt: "",
				retired: false,
			},
		];
	}

	function removeFieldRow(i: number) {
		form.fieldSchema = form.fieldSchema.filter((_, idx) => idx !== i);
	}

	function moveFieldRow(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= form.fieldSchema.length) return;
		const next = [...form.fieldSchema];
		[next[i], next[j]] = [next[j], next[i]];
		form.fieldSchema = next;
	}

	function changeFieldType(row: FieldSchemaRowInput, t: FieldType) {
		row.type = t;
		if (t !== "number") {
			row.rangeMin = "";
			row.rangeMax = "";
		}
		if (t !== "enum") {
			row.optionsCsv = "";
		}
		if (t !== "list") {
			row.itemType = "string";
		}
	}

	async function handleSubmit(e?: Event) {
		e?.preventDefault();
		if (submitting) return;
		error = "";

		const result = buildDefinitionFromInput(form, {
			existingIds,
			existing,
		});
		if (!result.ok) {
			error = result.error;
			return;
		}

		if (result.warnings.length > 0 && confirmWarnings === null) {
			confirmWarnings = result.warnings;
			return;
		}

		submitting = true;
		try {
			await onSubmit(result.definition, result.warnings);
		} catch (err) {
			error = (err as Error).message ?? "Failed to save";
			submitting = false;
			confirmWarnings = null;
		}
	}

	function backToKindPicker() {
		if (mode === "edit") return;
		kindPicked = false;
	}
</script>

{#if !kindPicked}
	<div class="lt-defform">
		<h2 class="lt-defform__title">Pick a kind</h2>
		<div class="lt-kind-grid">
			{#each kindOptions as opt (opt.kind)}
				<button
					type="button"
					class="lt-kind-card"
					onclick={() => pickKind(opt.kind)}
				>
					<span class="lt-kind-card__emoji">{opt.emoji}</span>
					<span class="lt-kind-card__label">{opt.label}</span>
					<span class="lt-kind-card__desc">{opt.desc}</span>
				</button>
			{/each}
		</div>
		<div class="lt-defform__actions">
			<button type="button" onclick={onCancel}>Cancel</button>
		</div>
	</div>
{:else if confirmWarnings !== null}
	<div class="lt-defform__confirm">
		<h2>Heads up</h2>
		<ul>
			{#each confirmWarnings as w (w)}
				<li>{w}</li>
			{/each}
		</ul>
		<p>Save anyway?</p>
		<div class="lt-defform__actions">
			<button type="button" onclick={() => (confirmWarnings = null)}
				>Back</button
			>
			<button
				type="button"
				class="lt-defform__primary"
				disabled={submitting}
				onclick={() => handleSubmit()}
			>
				Save anyway
			</button>
		</div>
	</div>
{:else}
	<form class="lt-defform" onsubmit={handleSubmit}>
		<header class="lt-defform__header">
			<div>
				<span class="lt-defform__kindlabel">{form.kind}</span>
				{#if mode === "create"}
					<button
						type="button"
						class="lt-defform__changekind"
						onclick={backToKindPicker}>change…</button
					>
				{/if}
			</div>
		</header>

		<fieldset class="lt-defform__section">
			<legend>Basics</legend>
			<label class="lt-defform__label">
				<span>Name <em class="lt-defform__req">*</em></span>
				<input type="text" bind:value={form.displayName} required />
			</label>
			<label class="lt-defform__label">
				<span>Emoji</span>
				<input
					type="text"
					bind:value={form.emoji}
					placeholder="🏃"
					maxlength="4"
				/>
			</label>
			<label class="lt-defform__label">
				<span>Tags</span>
				<input
					type="text"
					bind:value={form.tagsCsv}
					placeholder="exercise, cardio"
				/>
			</label>
			<label class="lt-defform__label">
				<span>Default plan duration <small>(minutes, optional)</small></span>
				<input
					type="text"
					inputmode="numeric"
					bind:value={form.defaultDurationMinutes}
					placeholder="30"
				/>
				<small>Plan tab will prefill the end time from this.</small>
			</label>
		</fieldset>

		{#if form.kind === "habit"}
			<fieldset class="lt-defform__section">
				<legend>Habit</legend>
				<label class="lt-defform__label">
					<span>Value type</span>
					<select bind:value={form.valueType}>
						<option value="boolean">boolean</option>
						<option value="count">count</option>
						<option value="duration">duration</option>
						<option value="custom">custom</option>
					</select>
				</label>
				<label class="lt-defform__label">
					<span>Unit</span>
					<input
						type="text"
						bind:value={form.unit}
						placeholder="minutes"
					/>
				</label>
				<label class="lt-defform__label">
					<span>Target cadence <em class="lt-defform__req">*</em></span>
					<input
						type="text"
						bind:value={form.targetCadence}
						placeholder="4/week"
					/>
					<small>Format: <code>count/day|week|month</code></small>
				</label>
			</fieldset>
		{:else if form.kind === "maintenance"}
			<fieldset class="lt-defform__section">
				<legend>Maintenance</legend>
				<label class="lt-defform__label">
					<span>Interval days <em class="lt-defform__req">*</em></span>
					<input
						type="text"
						inputmode="numeric"
						bind:value={form.intervalDays}
						placeholder="14"
					/>
				</label>
				<label class="lt-defform__label">
					<span>Warning threshold days</span>
					<input
						type="text"
						inputmode="numeric"
						bind:value={form.warningThresholdDays}
						placeholder="0"
					/>
				</label>
			</fieldset>
		{:else if form.kind === "reverse-habit"}
			<fieldset class="lt-defform__section">
				<legend>Reverse habit</legend>
				<label class="lt-defform__check">
					<input type="checkbox" bind:checked={form.noteRequired} />
					<span>Note required when logging</span>
				</label>
				<label class="lt-defform__label">
					<span>Milestones (days)</span>
					<input
						type="text"
						bind:value={form.milestonesCsv}
						placeholder="1, 7, 30, 100"
					/>
				</label>
			</fieldset>
		{:else if form.kind === "project"}
			<fieldset class="lt-defform__section">
				<legend>Project</legend>
				<label class="lt-defform__label">
					<span>Dormant after days</span>
					<input
						type="text"
						inputmode="numeric"
						bind:value={form.dormantAfterDays}
						placeholder="optional"
					/>
				</label>
			</fieldset>
		{:else if form.kind === "counter"}
			<fieldset class="lt-defform__section">
				<legend>Counter</legend>
				<label class="lt-defform__label">
					<span>Unit</span>
					<input
						type="text"
						bind:value={form.unit}
						placeholder="books"
					/>
				</label>
				<label class="lt-defform__label">
					<span>Goal</span>
					<input
						type="text"
						inputmode="decimal"
						bind:value={form.goal}
						placeholder="optional"
					/>
				</label>
				<label class="lt-defform__label">
					<span>Reset</span>
					<select bind:value={form.resetCadence}>
						<option value="">— unset —</option>
						<option value="never">never</option>
						<option value="monthly">monthly</option>
						<option value="yearly">yearly</option>
					</select>
				</label>
			</fieldset>
		{/if}

		<fieldset class="lt-defform__section">
			<legend>Custom fields</legend>
			{#if form.fieldSchema.length === 0}
				<p class="lt-defform__hint">
					No custom fields. Add per-event fields like quality, route, mood…
				</p>
			{/if}
			{#each form.fieldSchema as row, i (i)}
				<div class="lt-defform__field">
					<div class="lt-defform__field-row">
						<label class="lt-defform__label lt-defform__field-key">
							<span>Key</span>
							<input
								type="text"
								bind:value={row.key}
								placeholder="quality"
							/>
						</label>
						<label class="lt-defform__label lt-defform__field-type">
							<span>Type</span>
							<select
								value={row.type}
								onchange={(e) =>
									changeFieldType(
										row,
										(e.currentTarget as HTMLSelectElement)
											.value as FieldType,
									)}
							>
								{#each fieldTypes as t (t)}
									<option value={t}>{t}</option>
								{/each}
							</select>
						</label>
						<div class="lt-defform__field-actions">
							<button
								type="button"
								title="move up"
								disabled={i === 0}
								onclick={() => moveFieldRow(i, -1)}>↑</button
							>
							<button
								type="button"
								title="move down"
								disabled={i === form.fieldSchema.length - 1}
								onclick={() => moveFieldRow(i, 1)}>↓</button
							>
							<button
								type="button"
								title="remove"
								onclick={() => removeFieldRow(i)}>×</button
							>
						</div>
					</div>

					{#if row.type === "number"}
						<div class="lt-defform__field-row lt-defform__field-row--narrow">
							<label class="lt-defform__label">
								<span>Range min</span>
								<input
									type="text"
									inputmode="decimal"
									bind:value={row.rangeMin}
								/>
							</label>
							<label class="lt-defform__label">
								<span>Range max</span>
								<input
									type="text"
									inputmode="decimal"
									bind:value={row.rangeMax}
								/>
							</label>
						</div>
					{:else if row.type === "enum"}
						<label class="lt-defform__label">
							<span>Options (comma-separated)</span>
							<input
								type="text"
								bind:value={row.optionsCsv}
								placeholder="good, ok, bad"
							/>
						</label>
					{:else if row.type === "list"}
						<label class="lt-defform__label">
							<span>Item type</span>
							<select bind:value={row.itemType}>
								{#each itemTypes as t (t)}
									<option value={t}>{t}</option>
								{/each}
							</select>
						</label>
					{/if}

					<label class="lt-defform__label">
						<span>Prompt</span>
						<input
							type="text"
							bind:value={row.prompt}
							placeholder="How did it feel?"
						/>
					</label>

					<div class="lt-defform__field-row lt-defform__field-row--narrow">
						<label class="lt-defform__check">
							<input type="checkbox" bind:checked={row.required} />
							<span>Required</span>
						</label>
						{#if mode === "edit"}
							<label class="lt-defform__check">
								<input
									type="checkbox"
									bind:checked={row.retired}
								/>
								<span>Retired (hide from logging UI)</span>
							</label>
						{/if}
					</div>
				</div>
			{/each}
			<button type="button" class="lt-defform__add" onclick={addFieldRow}>
				+ Add field
			</button>
		</fieldset>

		{#if error}
			<div class="lt-defform__error" role="alert">{error}</div>
		{/if}

		<div class="lt-defform__actions">
			<button type="button" onclick={onCancel}>Cancel</button>
			<button
				type="submit"
				class="lt-defform__primary"
				disabled={submitting}
			>
				{mode === "edit" ? "Save changes" : "Create"}
			</button>
		</div>
	</form>
{/if}

<style>
	.lt-defform {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: min(520px, 92vw);
		max-width: 720px;
	}
	.lt-defform__title {
		margin: 0 0 0.25rem;
		font-size: 1.1rem;
	}
	.lt-defform__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.lt-defform__kindlabel {
		text-transform: capitalize;
		font-weight: 600;
		color: var(--text-muted);
		margin-right: 0.5rem;
	}
	.lt-defform__changekind {
		font-size: 0.85rem;
		background: transparent;
		border: none;
		color: var(--text-accent);
		cursor: pointer;
		padding: 0;
	}
	.lt-defform__section {
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lt-defform__section legend {
		padding: 0 0.4rem;
		font-weight: 600;
	}
	.lt-defform__label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
	}
	.lt-defform__label > span {
		color: var(--text-muted);
	}
	.lt-defform__label small {
		color: var(--text-muted);
		font-size: 0.75rem;
	}
	.lt-defform__label input,
	.lt-defform__label select {
		min-height: 2rem;
		font-size: 0.95rem;
	}
	.lt-defform__check {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
	}
	.lt-defform__req {
		color: var(--text-error);
		font-style: normal;
	}
	.lt-defform__error {
		color: var(--text-error);
		font-size: 0.85rem;
	}
	.lt-defform__hint {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0;
	}
	.lt-defform__actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.lt-defform__primary {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-defform__field {
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background: var(--background-secondary);
	}
	.lt-defform__field-row {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}
	.lt-defform__field-row--narrow > * {
		flex: 1;
	}
	.lt-defform__field-key {
		flex: 2;
	}
	.lt-defform__field-type {
		flex: 1;
	}
	.lt-defform__field-actions {
		display: flex;
		gap: 0.25rem;
	}
	.lt-defform__field-actions button {
		min-width: 2rem;
	}
	.lt-defform__add {
		align-self: flex-start;
	}
	.lt-kind-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 0.5rem;
	}
	.lt-kind-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding: 0.75rem;
		background: var(--background-secondary);
		border: 1px solid var(--background-modifier-border);
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		min-height: 88px;
	}
	.lt-kind-card:hover {
		background: var(--background-modifier-hover);
	}
	.lt-kind-card__emoji {
		font-size: 1.4rem;
	}
	.lt-kind-card__label {
		font-weight: 600;
	}
	.lt-kind-card__desc {
		color: var(--text-muted);
		font-size: 0.8rem;
	}
	.lt-defform__confirm ul {
		margin: 0.25rem 0;
		padding-left: 1.25rem;
	}
</style>
