import { type App, Modal, Notice } from "obsidian";
import { mount, unmount } from "svelte";
import LogEventForm from "../components/LogEventForm.svelte";
import type { DataLayer } from "../data/dataLayer";
import type { LogFormSuccess } from "../data/logForm";
import type { PlanFormSuccess } from "../data/planForm";
import type { Definition, Event } from "../data/types";

export interface LogEventModalOpts {
	mode?: "create" | "edit";
	existingEvent?: Event;
	initialDate?: string;
	onLogged?: (definitionId: string) => void;
	onPlan?: (planned: PlanFormSuccess) => Promise<void> | void;
	findSlot?: (date: string, durationMin: number) => Promise<string | null>;
}

export class LogEventModal extends Modal {
	private component: ReturnType<typeof mount> | null = null;
	private mode: "create" | "edit";
	private existingEvent?: Event;
	private initialDate?: string;
	private onLogged?: (definitionId: string) => void;
	private onPlan?: (planned: PlanFormSuccess) => Promise<void> | void;
	private findSlot?: (
		date: string,
		durationMin: number,
	) => Promise<string | null>;

	constructor(
		app: App,
		private data: DataLayer,
		private definition: Definition,
		opts: LogEventModalOpts | ((definitionId: string) => void) = {},
	) {
		super(app);
		// Backwards-compatible: previous signature took an onLogged callback as 4th arg.
		if (typeof opts === "function") {
			this.mode = "create";
			this.onLogged = opts;
		} else {
			this.mode = opts.mode ?? "create";
			this.existingEvent = opts.existingEvent;
			this.initialDate = opts.initialDate;
			this.onLogged = opts.onLogged;
			this.onPlan = opts.onPlan;
			this.findSlot = opts.findSlot;
		}
	}

	onOpen(): void {
		this.titleEl.setText(
			`${this.mode === "edit" ? "Edit" : "Log"} ${this.definition.displayName}`,
		);
		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-modal");

		this.component = mount(LogEventForm, {
			target: this.contentEl,
			props: {
				definition: this.definition,
				mode: this.mode,
				existingEvent: this.existingEvent,
				initialDate: this.initialDate,
				findSlot: this.findSlot,
				onPlan: this.onPlan
					? async (planned: PlanFormSuccess) => {
							try {
								await this.onPlan?.(planned);
								this.close();
							} catch (err) {
								new Notice(
									`Failed: ${(err as Error).message ?? String(err)}`,
								);
								throw err;
							}
						}
					: undefined,
				onSubmit: async (submitted: LogFormSuccess) => {
					try {
						if (this.mode === "edit" && this.existingEvent) {
							await this.data.editEvent(
								this.definition.id,
								this.existingEvent.id,
								{
									timestamp: submitted.event.timestamp,
									value: submitted.event.value,
									note: submitted.event.note,
									fields: submitted.event.fields,
								},
							);
							new Notice(`Updated ${this.definition.displayName}`);
						} else {
							await this.data.appendEvent(this.definition.id, {
								id: "",
								timestamp: submitted.event.timestamp,
								value: submitted.event.value,
								note: submitted.event.note,
								fields: submitted.event.fields,
							});
							new Notice(`Logged ${this.definition.displayName}`);
						}
						this.onLogged?.(this.definition.id);
						this.close();
					} catch (err) {
						new Notice(
							`Failed: ${(err as Error).message ?? String(err)}`,
						);
						throw err;
					}
				},
				onCancel: () => this.close(),
			},
		});
	}

	onClose(): void {
		if (this.component) {
			unmount(this.component);
			this.component = null;
		}
		this.contentEl.empty();
	}
}
