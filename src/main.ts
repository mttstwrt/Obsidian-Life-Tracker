import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { DataLayer } from "./data/dataLayer";
import { ObsidianVaultAdapter } from "./data/vaultAdapter";
import type { Definition, Event } from "./data/types";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./views/DashboardView";
import { DefinitionFormModal } from "./views/DefinitionFormModal";
import { EventDetailModal } from "./views/EventDetailModal";
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

		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this),
		);

		this.addRibbonIcon("activity", "Open Life Tracker dashboard", () => {
			this.openDashboard();
		});

		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: () => this.openDashboard(),
		});

		this.addCommand({
			id: "log-event",
			name: "Log event",
			callback: () => this.openPicker(),
		});

		this.addCommand({
			id: "new-definition",
			name: "New definition",
			callback: () => this.openNewDefinition(),
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

	async openDashboard(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_DASHBOARD,
				active: true,
			});
		}
		workspace.revealLeaf(leaf);
	}

	async openPicker(): Promise<void> {
		const modal = new PickDefinitionModal(
			this.app,
			this.data,
			this.settings.recentDefinitionIds,
			(def) => {
				new LogEventModal(this.app, this.data, def, {
					onLogged: (id) => this.recordRecent(id),
				}).open();
			},
		);
		await modal.load();
		modal.open();
	}

	async openLogModal(
		definitionId: string,
		opts: { initialDate?: string } = {},
	): Promise<void> {
		const def = await this.data.getDefinition(definitionId);
		if (!def) {
			new Notice(`Definition not found: ${definitionId}`);
			return;
		}
		new LogEventModal(this.app, this.data, def, {
			initialDate: opts.initialDate,
			onLogged: (id) => this.recordRecent(id),
		}).open();
	}

	async quickLog(definitionId: string): Promise<void> {
		const def = await this.data.getDefinition(definitionId);
		if (!def) {
			new Notice(`Definition not found: ${definitionId}`);
			return;
		}
		const required = (def.fieldSchema ?? []).filter(
			(f) => f.required && !f.retired,
		);
		const isBoolean =
			def.kind === "maintenance" ||
			(def.kind === "habit" && def.valueType === "boolean");
		if (!isBoolean || required.length > 0) {
			return this.openLogModal(definitionId);
		}
		try {
			await this.data.appendEvent(definitionId, {
				id: "",
				timestamp: new Date().toISOString(),
				value: 1,
				fields: {},
			});
			await this.recordRecent(definitionId);
			new Notice(`Logged ${def.displayName}`);
		} catch (err) {
			new Notice(`Failed: ${(err as Error).message ?? String(err)}`);
		}
	}

	async openEventDetail(definition: Definition, event: Event): Promise<void> {
		new EventDetailModal(this.app, this.data, definition, event, {
			onEdit: (def, ev) => {
				new LogEventModal(this.app, this.data, def, {
					mode: "edit",
					existingEvent: ev,
				}).open();
			},
		}).open();
	}

	async openNewDefinition(): Promise<void> {
		const { definitions } = await this.data.loadDefinitions();
		const existingIds = new Set(definitions.map((d) => d.id));
		new DefinitionFormModal(this.app, this.data, {
			mode: "create",
			existingIds,
		}).open();
	}

	async openEditDefinition(definitionId: string): Promise<void> {
		const { definitions } = await this.data.loadDefinitions();
		const existing = definitions.find((d) => d.id === definitionId);
		if (!existing) return;
		const existingIds = new Set(definitions.map((d) => d.id));
		new DefinitionFormModal(this.app, this.data, {
			mode: "edit",
			existing,
			existingIds,
		}).open();
	}

	async archiveAndRefresh(definitionId: string): Promise<void> {
		try {
			await this.data.archiveDefinition(definitionId);
			new Notice("Archived");
		} catch (err) {
			new Notice(`Failed: ${(err as Error).message ?? String(err)}`);
		}
	}

	async unarchiveAndRefresh(definitionId: string): Promise<void> {
		try {
			await this.data.unarchiveDefinition(definitionId);
			new Notice("Unarchived");
		} catch (err) {
			new Notice(`Failed: ${(err as Error).message ?? String(err)}`);
		}
	}

	openPluginSettings(): void {
		const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
		if (!setting) {
			new Notice("Settings API unavailable");
			return;
		}
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	private async recordRecent(id: string): Promise<void> {
		const list = [id, ...this.settings.recentDefinitionIds.filter((x) => x !== id)];
		this.settings.recentDefinitionIds = list.slice(0, RECENT_LIMIT);
		await this.saveSettings();
	}
}
