<script lang="ts">
	import { untrack } from "svelte";
	import type {
		Definition,
		Event as TrackerEvent,
		FieldDef,
	} from "../data/types";
	import {
		buildLogEvent,
		localDateString,
		localTimeString,
		valueExpected,
	} from "../data/logForm";

	type Submitted = Extract<
		ReturnType<typeof buildLogEvent>,
		{ ok: true }
	>;

	let {
		definition,
		mode = "create",
		existingEvent,
		initialDate: initialDateProp,
		initialTime: initialTimeProp,
		onSubmit,
		onCancel,
	}: {
		definition: Definition;
		mode?: "create" | "edit";
		existingEvent?: TrackerEvent;
		initialDate?: string;
		initialTime?: string;
		onSubmit: (
			submitted: Submitted,
		) => Promise<void> | void;
		onCancel: () => void;
	} = $props();

	function pickInitialDate(): string {
		if (initialDateProp) return initialDateProp;
		if (existingEvent) {
			const d = new Date(existingEvent.timestamp);
			if (!Number.isNaN(d.getTime())) return localDateString(d);
		}
		return localDateString();
	}
	function pickInitialTime(): string {
		if (initialTimeProp) return initialTimeProp;
		if (existingEvent) {
			const d = new Date(existingEvent.timestamp);
			if (!Number.isNaN(d.getTime())) return localTimeString(d);
		}
		return localTimeString();
	}

	const initialDate = untrack(() => pickInitialDate());
	const initialTime = untrack(() => pickInitialTime());

	let date = $state(untrack(() => initialDate));
	let time = $state(untrack(() => initialTime));
	let valueRaw = $state(
		untrack(() =>
			existingEvent?.value !== undefined ? String(existingEvent.value) : "",
		),
	);
	let note = $state(untrack(() => existingEvent?.note ?? ""));
	let fieldRaws: Record<string, string> = $state(
		untrack(() => {
			const out: Record<string, string> = {};
			if (existingEvent) {
				for (const [k, v] of Object.entries(existingEvent.fields)) {
					out[k] = v.raw;
				}
			}
			return out;
		}),
	);
	let error = $state("");
	let submitting = $state(false);
	let confirmStage = $state(false);

	const activeFields = $derived(
		(definition.fieldSchema ?? []).filter(
			(f) => !f.retired || (existingEvent && existingEvent.fields[f.key] !== undefined),
		),
	);
	const expected = $derived(valueExpected(definition));
	const isReverseHabit = $derived(definition.kind === "reverse-habit");
	const noteRequired = $derived(
		definition.kind === "reverse-habit" && definition.noteRequired === true,
	);
	const valueLabel = $derived(unitLabel(definition));

	function toRawString(v: unknown): string {
		if (v === null || v === undefined) return "";
		return String(v);
	}

	function unitLabel(def: Definition): string {
		if (def.kind === "habit") {
			if (def.valueType === "boolean") return "";
			return def.unit ?? "value";
		}
		if (def.kind === "counter") return def.unit ?? "value";
		return "";
	}

	function fieldId(f: FieldDef) {
		return `lt-field-${f.key}`;
	}

	async function handleSubmit(e?: Event) {
		e?.preventDefault();
		if (submitting) return;
		error = "";

		const result = buildLogEvent(definition, {
			date,
			time,
			initialDate,
			initialTime,
			valueRaw: toRawString(valueRaw),
			note,
			fieldRaws: Object.fromEntries(
				Object.entries(fieldRaws).map(([k, v]) => [k, toRawString(v)]),
			),
			mode,
		});

		if (!result.ok) {
			error = result.error;
			return;
		}

		if (isReverseHabit && !confirmStage) {
			confirmStage = true;
			return;
		}

		submitting = true;
		try {
			await onSubmit(result);
		} catch (err) {
			error = (err as Error).message ?? "Failed to log event";
			submitting = false;
		}
	}
</script>

<form class="lt-form" onsubmit={handleSubmit}>
	<header class="lt-form__header">
		<span class="lt-form__emoji" aria-hidden="true"
			>{definition.emoji ?? "•"}</span
		>
		<h2 class="lt-form__title">
			{mode === "edit" ? "Edit" : "Log"} {definition.displayName}
		</h2>
	</header>

	{#if confirmStage}
		<div class="lt-confirm">
			<p>
				Logging a <strong>reverse habit</strong> resets the time-since
				counter. Are you sure?
			</p>
			<div class="lt-confirm__actions">
				<button type="button" onclick={() => (confirmStage = false)}
					>Back</button
				>
				<button type="submit" class="lt-form__primary" disabled={submitting}
					>Yes, log it</button
				>
			</div>
		</div>
	{:else}
		<fieldset class="lt-form__row lt-form__row--datetime">
			<label class="lt-form__label">
				<span>Date</span>
				<input type="date" bind:value={date} />
			</label>
			<label class="lt-form__label">
				<span>Time</span>
				<input type="time" bind:value={time} />
			</label>
		</fieldset>

		{#if expected === "number"}
			<label class="lt-form__label">
				<span>{valueLabel || "Value"}</span>
				<input
					type="number"
					inputmode="decimal"
					bind:value={valueRaw}
				/>
			</label>
		{/if}

		<label class="lt-form__label">
			<span>Note{noteRequired ? " *" : ""}</span>
			<textarea
				rows="2"
				placeholder="Optional"
				bind:value={note}
			></textarea>
		</label>

		{#each activeFields as field (field.key)}
			<label class="lt-form__label" for={fieldId(field)}>
				<span>
					{field.prompt ?? field.key}
					{#if field.required}<em class="lt-form__req">*</em>{/if}
				</span>
				{#if field.type === "boolean"}
					<select id={fieldId(field)} bind:value={fieldRaws[field.key]}>
						<option value="">—</option>
						<option value="true">true</option>
						<option value="false">false</option>
					</select>
				{:else if field.type === "enum"}
					<select id={fieldId(field)} bind:value={fieldRaws[field.key]}>
						<option value="">—</option>
						{#each field.options ?? [] as opt (opt)}
							<option value={opt}>{opt}</option>
						{/each}
					</select>
				{:else if field.type === "number"}
					{#if field.range}
						<div class="lt-form__range">
							<input
								id={fieldId(field)}
								type="range"
								min={field.range[0]}
								max={field.range[1]}
								step="1"
								bind:value={fieldRaws[field.key]}
							/>
							<output>{fieldRaws[field.key] ?? ""}</output>
						</div>
					{:else}
						<input
							id={fieldId(field)}
							type="number"
							inputmode="decimal"
							bind:value={fieldRaws[field.key]}
						/>
					{/if}
				{:else if field.type === "list"}
					<input
						id={fieldId(field)}
						type="text"
						placeholder="comma,separated"
						bind:value={fieldRaws[field.key]}
					/>
				{:else}
					<input
						id={fieldId(field)}
						type="text"
						bind:value={fieldRaws[field.key]}
					/>
				{/if}
			</label>
		{/each}

		{#if error}
			<div class="lt-form__error" role="alert">{error}</div>
		{/if}

		<div class="lt-form__actions">
			<button type="button" onclick={onCancel}>Cancel</button>
			<button type="submit" class="lt-form__primary" disabled={submitting}>
				{mode === "edit" ? "Save" : expected === "boolean" ? "Log" : "Save"}
			</button>
		</div>
	{/if}
</form>

<style>
	.lt-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: min(420px, 90vw);
	}
	.lt-form__header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.lt-form__emoji {
		font-size: 1.5rem;
	}
	.lt-form__title {
		margin: 0;
		font-size: 1.1rem;
	}
	.lt-form__row {
		display: flex;
		gap: 0.5rem;
		border: none;
		padding: 0;
		margin: 0;
	}
	.lt-form__row--datetime > label {
		flex: 1;
	}
	.lt-form__label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
	}
	.lt-form__label > span {
		color: var(--text-muted);
	}
	.lt-form__label input,
	.lt-form__label select,
	.lt-form__label textarea {
		min-height: 2.25rem;
		font-size: 1rem;
	}
	.lt-form__range {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.lt-form__range input[type="range"] {
		flex: 1;
	}
	.lt-form__range output {
		min-width: 2ch;
		text-align: right;
		color: var(--text-muted);
	}
	.lt-form__req {
		color: var(--text-error);
		font-style: normal;
	}
	.lt-form__error {
		color: var(--text-error);
		font-size: 0.85rem;
	}
	.lt-form__actions,
	.lt-confirm__actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.lt-form__primary {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
	}
	.lt-confirm p {
		margin: 0 0 0.5rem;
	}
</style>
