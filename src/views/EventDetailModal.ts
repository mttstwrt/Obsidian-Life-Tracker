import { type App, Modal, Notice } from "obsidian";
import { mount, unmount } from "svelte";
import EventDetail from "../components/EventDetail.svelte";
import type { DataLayer } from "../data/dataLayer";
import type { Definition, Event } from "../data/types";

export interface EventDetailModalOpts {
	onEdit?: (definition: Definition, event: Event) => void;
	onChanged?: (definitionId: string) => void;
}

export class EventDetailModal extends Modal {
	private component: ReturnType<typeof mount> | null = null;

	constructor(
		app: App,
		private data: DataLayer,
		private definition: Definition,
		private event: Event,
		private opts: EventDetailModalOpts = {},
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.titleEl.setText(`Event · ${this.definition.displayName}`);
		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-modal");

		let definitionEvents: Event[] = [];
		try {
			definitionEvents = await this.data.loadEvents(this.definition.id);
		} catch {
			/* non-fatal: charts just won't load */
		}

		this.component = mount(EventDetail, {
			target: this.contentEl,
			props: {
				definition: this.definition,
				event: this.event,
				definitionEvents,
				onEdit: () => {
					this.opts.onEdit?.(this.definition, this.event);
					this.close();
				},
				onDelete: async () => {
					try {
						await this.data.deleteEvent(this.definition.id, this.event.id);
						new Notice("Deleted event");
						this.opts.onChanged?.(this.definition.id);
						this.close();
					} catch (err) {
						new Notice(
							`Failed: ${(err as Error).message ?? String(err)}`,
						);
					}
				},
				onClose: () => this.close(),
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
