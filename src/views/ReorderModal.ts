import { type App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import ReorderList from "../components/ReorderList.svelte";

export interface ReorderItem {
	id: string;
	label: string;
	emoji?: string;
	hint?: string;
}

export interface ReorderModalOpts {
	title: string;
	items: ReorderItem[];
	onSave: (orderedIds: string[]) => void | Promise<void>;
}

export class ReorderModal extends Modal {
	private component: ReturnType<typeof mount> | null = null;

	constructor(
		app: App,
		private opts: ReorderModalOpts,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.title);
		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-modal");

		this.component = mount(ReorderList, {
			target: this.contentEl,
			props: {
				items: this.opts.items,
				onSave: async (ids: string[]) => {
					await this.opts.onSave(ids);
					this.close();
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
