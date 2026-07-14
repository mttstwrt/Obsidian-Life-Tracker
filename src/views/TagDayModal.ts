import { type App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import TagDayList from "../components/TagDayList.svelte";
import type { Definition, Event } from "../data/types";

export interface TagDayEntry {
	definition: Definition;
	/** Events for this definition on the modal's date. */
	events: Event[];
}

/**
 * Drill-in for a tag-mode overview cell: lists the tag's definitions and the
 * day's logged events under each, so the user can pick a definition to
 * log/plan or an event to inspect.
 */
export class TagDayModal extends Modal {
	private component: ReturnType<typeof mount> | null = null;

	constructor(
		app: App,
		private tag: string,
		private date: string,
		private entries: TagDayEntry[],
		private callbacks: {
			onLogDefinition: (def: Definition) => void;
			onOpenEvent: (def: Definition, event: Event) => void;
		},
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(`#${this.tag} — ${this.date}`);
		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-modal");

		this.component = mount(TagDayList, {
			target: this.contentEl,
			props: {
				entries: this.entries,
				onLogDefinition: (def: Definition) => {
					this.close();
					this.callbacks.onLogDefinition(def);
				},
				onOpenEvent: (def: Definition, event: Event) => {
					this.close();
					this.callbacks.onOpenEvent(def, event);
				},
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
