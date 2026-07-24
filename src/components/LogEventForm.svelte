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
	import { buildPlanLine, type PlanFormSuccess } from "../data/planForm";

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
		linkToDefinition = false,
		onSubmit,
		onPlan,
		findSlot,
		onCancel,
	}: {
		definition: Definition;
		mode?: "create" | "edit";
		existingEvent?: TrackerEvent;
		initialDate?: string;
		initialTime?: string;
		linkToDefinition?: boolean;
		onSubmit: (
			submitted: Submitted,
		) => Promise<void> | void;
		onPlan?: (planned: PlanFormSuccess) => Promise<void> | void;
		findSlot?: (date: string, durationMin: number) => Promise<string | null>;
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

	const planEnabled = $derived(mode !== "edit" && !!onPlan);
	let activeTab: "log" | "plan" = $state("log");

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

	// Obsidian marks mobile with a body class. On mobile the on-screen keyboard
	// covers the lower half of the modal, so we reveal the focused field above
	// it (see revealOnFocus) and pad the form bottom to leave room to scroll.
	const isMobile =
		typeof document !== "undefined" &&
		document.body.classList.contains("is-mobile");

	function revealOnFocus(e: FocusEvent) {
		if (!isMobile) return;
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const tag = target.tagName;
		if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return;
		// Wait for the keyboard to finish animating in before scrolling, so we
		// measure against the shrunken viewport rather than the old one.
		window.setTimeout(() => {
			target.scrollIntoView({ block: "center", behavior: "smooth" });
		}, 250);
	}

	function addMinutesToTime(time: string, minutes: number): string {
		const m = /^(\d{2}):(\d{2})$/.exec(time);
		if (!m || !Number.isFinite(minutes) || minutes <= 0) return time;
		const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % (24 * 60);
		const h = Math.floor(total / 60);
		const mm = total % 60;
		return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
	}

	function initialPlanEnd(): string {
		if (definition.kind === "maintenance") return "";
		if (definition.defaultDuration && definition.defaultDuration > 0) {
			return addMinutesToTime(initialTime, definition.defaultDuration);
		}
		return "";
	}

	let planDate = $state(untrack(() => initialDate));
	let planStart = $state(untrack(() => initialTime));
	let planEnd = $state(untrack(() => initialPlanEnd()));
	let planEndTouched = $state(false);
	let planLabel = $state("");
	let planError = $state("");
	let planning = $state(false);
	let slotAuto = $state(false);
	let slotMessage = $state("");
	let slotSearching = $state(false);

	$effect(() => {
		if (planEndTouched) return;
		if (definition.kind === "maintenance") return;
		const dur = definition.defaultDuration;
		if (!dur || dur <= 0) return;
		planEnd = addMinutesToTime(planStart, dur);
	});

	function timeToMinutes(t: string): number | null {
		const m = /^(\d{2}):(\d{2})$/.exec(t);
		if (!m) return null;
		return Number(m[1]) * 60 + Number(m[2]);
	}

	function plannedDurationMin(): number | null {
		const startM = timeToMinutes(planStart);
		const endM = timeToMinutes(planEnd);
		if (startM !== null && endM !== null && endM > startM) {
			return endM - startM;
		}
		if (definition.defaultDuration && definition.defaultDuration > 0) {
			return definition.defaultDuration;
		}
		return null;
	}

	async function applyOpenSlot() {
		if (!findSlot) return;
		const dur = plannedDurationMin();
		if (dur === null) {
			slotMessage = "Set a default duration or end time first.";
			return;
		}
		slotSearching = true;
		try {
			const slot = await findSlot(planDate, dur);
			if (!slot) {
				slotMessage = "No open slot fits that duration today.";
				return;
			}
			planStart = slot;
			planEnd = addMinutesToTime(slot, dur);
			planEndTouched = true; // stop the defaultDuration auto-prefill from clobbering
			slotAuto = true;
			slotMessage = `Suggested ${slot} – ${planEnd}.`;
		} catch (err) {
			slotMessage = `Slot search failed: ${(err as Error).message ?? String(err)}`;
		} finally {
			slotSearching = false;
		}
	}

	function onPlanStartInput() {
		slotAuto = false;
		slotMessage = "";
	}

	function onPlanEndInput() {
		planEndTouched = true;
		if (slotAuto) void applyOpenSlot();
	}

	function onPlanDateInput() {
		if (slotAuto) void applyOpenSlot();
	}

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

	async function handlePlan(e?: Event) {
		e?.preventDefault();
		if (!onPlan || planning) return;
		planError = "";

		const result = buildPlanLine(definition, {
			date: planDate,
			startTime: planStart,
			endTime: planEnd,
			label: planLabel,
			linkToDefinition,
		});

		if (!result.ok) {
			planError = result.error;
			return;
		}

		planning = true;
		try {
			await onPlan(result);
		} catch (err) {
			planError = (err as Error).message ?? "Failed to plan";
			planning = false;
		}
	}
</script>

<div class="lt-form" class:lt-form--mobile={isMobile} onfocusin={revealOnFocus}>
	<header class="lt-form__header">
		<span class="lt-form__emoji" aria-hidden="true"
			>{definition.emoji ?? "•"}</span
		>
		<h2 class="lt-form__title">
			{mode === "edit" ? "Edit" : "Log"} {definition.displayName}
		</h2>
	</header>

	{#if planEnabled}
		<div class="lt-tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === "log"}
				class="lt-tabs__tab"
				class:lt-tabs__tab--active={activeTab === "log"}
				onclick={() => (activeTab = "log")}
			>
				Log
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === "plan"}
				class="lt-tabs__tab"
				class:lt-tabs__tab--active={activeTab === "plan"}
				onclick={() => (activeTab = "plan")}
			>
				Plan
			</button>
		</div>
	{/if}

	{#if activeTab === "log" || !planEnabled}
		<form class="lt-form__body" onsubmit={handleSubmit}>
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
	{:else}
		<form class="lt-form__body" onsubmit={handlePlan}>
			<p class="lt-form__hint">
				Adds a line to the daily note for the chosen date so the Day Planner plugin can pick it up.
			</p>

			<fieldset class="lt-form__row lt-form__row--datetime">
				<label class="lt-form__label">
					<span>Date</span>
					<input
						type="date"
						bind:value={planDate}
						oninput={onPlanDateInput}
					/>
				</label>
				<label class="lt-form__label">
					<span>Start</span>
					<input
						type="time"
						bind:value={planStart}
						oninput={onPlanStartInput}
					/>
				</label>
				<label class="lt-form__label">
					<span>End <small>(optional)</small></span>
					<input
						type="time"
						bind:value={planEnd}
						oninput={onPlanEndInput}
					/>
				</label>
			</fieldset>

			{#if findSlot}
				<div class="lt-form__slot">
					<button
						type="button"
						class="lt-form__slotbtn"
						class:lt-form__slotbtn--active={slotAuto}
						disabled={slotSearching}
						onclick={applyOpenSlot}
					>
						{slotSearching ? "Searching…" : slotAuto ? "Re-find open slot" : "Find open slot"}
					</button>
					{#if slotMessage}
						<small class="lt-form__slotmsg">{slotMessage}</small>
					{/if}
				</div>
			{/if}

			<label class="lt-form__label">
				<span>Label <small>(defaults to "{definition.displayName}")</small></span>
				<input type="text" bind:value={planLabel} placeholder={definition.displayName} />
			</label>

			{#if planError}
				<div class="lt-form__error" role="alert">{planError}</div>
			{/if}

			<div class="lt-form__actions">
				<button type="button" onclick={onCancel}>Cancel</button>
				<button type="submit" class="lt-form__primary" disabled={planning}>
					Plan
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.lt-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: min(420px, 90vw);
	}
	/* Leave room to scroll the focused field above the on-screen keyboard,
	   which otherwise covers the lower fields with no way to reveal them. */
	.lt-form--mobile {
		padding-bottom: 45vh;
	}
	.lt-form__body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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
	.lt-tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--background-modifier-border);
	}
	.lt-tabs__tab {
		flex: 1;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.4rem 0.5rem;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.95rem;
	}
	.lt-tabs__tab--active {
		color: var(--text-normal);
		border-bottom-color: var(--interactive-accent);
	}
	.lt-form__hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.lt-form__slot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.lt-form__slotbtn {
		font-size: 0.85rem;
	}
	.lt-form__slotbtn--active {
		background: var(--background-modifier-hover);
	}
	.lt-form__slotmsg {
		color: var(--text-muted);
		font-size: 0.8rem;
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
	.lt-form__label > span small {
		opacity: 0.7;
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
