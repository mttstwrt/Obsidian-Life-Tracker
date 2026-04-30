import { Plugin } from "obsidian";
import { DataLayer } from "./data/dataLayer";
import { ObsidianVaultAdapter } from "./data/vaultAdapter";
import { ExampleView, VIEW_TYPE_EXAMPLE } from "./views/ExampleView";
import "virtual:uno.css";

interface LifeTrackerSettings {
	rootFolder: string;
}

const DEFAULT_SETTINGS: LifeTrackerSettings = {
	rootFolder: "LifeTracker",
};

export default class LifeTrackerPlugin extends Plugin {
	settings!: LifeTrackerSettings;
	data!: DataLayer;

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onload() {
		await this.loadSettings();

		this.data = new DataLayer(
			new ObsidianVaultAdapter(this.app.vault),
			this.settings.rootFolder,
		);

		this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new ExampleView(leaf));

		this.addRibbonIcon("activity", "Open Life Tracker", () => {
			this.activateView();
		});
	}

	onunload() {
		this.data.clearCache();
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: VIEW_TYPE_EXAMPLE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)[0],
		);
	}
}
