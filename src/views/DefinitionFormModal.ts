import { type App, Modal, Notice } from "obsidian";
import { mount, unmount } from "svelte";
import DefinitionForm from "../components/DefinitionForm.svelte";
import type { DataLayer } from "../data/dataLayer";
import {
	type DefinitionFormInput,
	definitionToFormInput,
} from "../data/definitionForm";
import type { Definition } from "../data/types";

export interface DefinitionFormModalOpts {
	mode: "create" | "edit";
	existing?: Definition;
	existingIds: Set<string>;
	onSaved?: (def: Definition) => void;
}

export class DefinitionFormModal extends Modal {
	private component: ReturnType<typeof mount> | null = null;
	private mode: "create" | "edit";
	private existing?: Definition;
	private existingIds: Set<string>;
	private onSaved?: (def: Definition) => void;

	constructor(
		app: App,
		private data: DataLayer,
		opts: DefinitionFormModalOpts,
	) {
		super(app);
		this.mode = opts.mode;
		this.existing = opts.existing;
		this.existingIds = opts.existingIds;
		this.onSaved = opts.onSaved;
	}

	onOpen(): void {
		this.titleEl.setText(
			this.mode === "edit" && this.existing
				? `Edit ${this.existing.displayName}`
				: "New definition",
		);
		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-modal");

		const initial: DefinitionFormInput | undefined = this.existing
			? definitionToFormInput(this.existing)
			: undefined;

		this.component = mount(DefinitionForm, {
			target: this.contentEl,
			props: {
				mode: this.mode,
				initial,
				existingIds: this.existingIds,
				existing: this.existing,
				onSubmit: async (def: Definition, warnings: string[]) => {
					try {
						if (this.mode === "edit") {
							await this.data.updateDefinition(def);
							new Notice(`Saved ${def.displayName}`);
						} else {
							await this.data.createDefinition(def);
							new Notice(`Created ${def.displayName}`);
						}
						for (const w of warnings) {
							new Notice(w, 8000);
						}
						this.onSaved?.(def);
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
