import { type App, FuzzySuggestModal, Notice } from "obsidian";
import type { DataLayer } from "../data/dataLayer";
import type { Definition } from "../data/types";

export class PickDefinitionModal extends FuzzySuggestModal<Definition> {
	private definitions: Definition[] = [];

	constructor(
		app: App,
		private data: DataLayer,
		private recentIds: string[],
		private onChoose: (def: Definition) => void,
	) {
		super(app);
		this.setPlaceholder("Search habits, maintenance, projects, counters…");
	}

	async load(): Promise<void> {
		const result = await this.data.loadDefinitions();
		this.definitions = result.definitions
			.filter((d) => d.status === "active")
			.sort(this.compare.bind(this));
		if (result.warnings.length > 0) {
			console.warn("[life-tracker] definition warnings:", result.warnings);
		}
		if (this.definitions.length === 0) {
			new Notice(
				"No active definitions found. Create one in LifeTracker/definitions/.",
			);
		}
	}

	private compare(a: Definition, b: Definition): number {
		const ai = this.recentIds.indexOf(a.id);
		const bi = this.recentIds.indexOf(b.id);
		if (ai !== bi) {
			if (ai < 0) return 1;
			if (bi < 0) return -1;
			return ai - bi;
		}
		return a.displayName.localeCompare(b.displayName);
	}

	getItems(): Definition[] {
		return this.definitions;
	}

	getItemText(item: Definition): string {
		const tags = item.tags.length ? ` ${item.tags.map((t) => `#${t}`).join(" ")}` : "";
		const emoji = item.emoji ? `${item.emoji} ` : "";
		return `${emoji}${item.displayName}${tags}`;
	}

	onChooseItem(item: Definition): void {
		this.onChoose(item);
	}
}
