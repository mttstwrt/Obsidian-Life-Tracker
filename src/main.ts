import { Plugin } from "obsidian";
import { DataLayer } from "./data/dataLayer";
import { ObsidianVaultAdapter } from "./data/vaultAdapter";
import { ExampleView, VIEW_TYPE_EXAMPLE } from "./views/ExampleView";
import { LogEventModal } from "./views/LogEventModal";
import { PickDefinitionModal } from "./views/PickDefinitionModal";
import { LifeTrackerSettingTab } from "./views/SettingsTab";
import "virtual:uno.css";

interface LifeTrackerSettings {
	rootFolder: string;
	recentDefinitionIds: string[];
	quickLogIds: string[];
}

const DEFAULT_SETTINGS: LifeTrackerSettings = {
	rootFolder: "LifeTracker",
	recentDefinitionIds: [],
	quickLogIds: [],
};

const RECENT_LIMIT = 20;

export default class LifeTrackerPlugin extends Plugin {
	settings!: LifeTrackerSettings;
	data!: DataLayer;

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	rebuildDataLayer(): void {
		this.data = new DataLayer(
			new ObsidianVaultAdapter(this.app.vault),
			this.settings.rootFolder,
		);
	}

	async onload() {
		await this.loadSettings();
		this.rebuildDataLayer();

		this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new ExampleView(leaf));

		this.addRibbonIcon("plus-circle", "Log Life Tracker event", () => {
			this.openPicker();
		});

		this.addCommand({
			id: "log-event",
			name: "Log event",
			callback: () => this.openPicker(),
		});

		await this.registerQuickLogCommands();

		this.addSettingTab(new LifeTrackerSettingTab(this.app, this));
	}

	onunload() {
		this.data?.clearCache();
	}

	private async registerQuickLogCommands(): Promise<void> {
		if (this.settings.quickLogIds.length === 0) return;
		const { definitions } = await this.data.loadDefinitions();
		const byId = new Map(definitions.map((d) => [d.id, d]));
		for (const id of this.settings.quickLogIds) {
			const def = byId.get(id);
			if (!def) continue;
			this.addCommand({
				id: `log-${def.id}`,
				name: `Log ${def.displayName}`,
				callback: () => this.openLogModal(def.id),
			});
		}
	}

	async openPicker(): Promise<void> {
		const modal = new PickDefinitionModal(
			this.app,
			this.data,
			this.settings.recentDefinitionIds,
			(def) => {
				new LogEventModal(this.app, this.data, def, (id) =>
					this.recordRecent(id),
				).open();
			},
		);
		await modal.load();
		modal.open();
	}

	async openLogModal(definitionId: string): Promise<void> {
		const def = await this.data.getDefinition(definitionId);
		if (!def) return;
		new LogEventModal(this.app, this.data, def, (id) =>
			this.recordRecent(id),
		).open();
	}

	private async recordRecent(id: string): Promise<void> {
		const list = [id, ...this.settings.recentDefinitionIds.filter((x) => x !== id)];
		this.settings.recentDefinitionIds = list.slice(0, RECENT_LIMIT);
		await this.saveSettings();
	}
}
