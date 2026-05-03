import { type App, PluginSettingTab, Setting } from "obsidian";
import type LifeTrackerPlugin from "../main";

export class LifeTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: LifeTrackerPlugin) {
		super(app, plugin);
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Root folder")
			.setDesc(
				"Folder under your vault where definitions live. Definitions sit in <root>/definitions/.",
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.rootFolder)
					.setPlaceholder("LifeTracker")
					.onChange(async (v) => {
						this.plugin.settings.rootFolder = v.trim() || "LifeTracker";
						await this.plugin.saveSettings();
						this.plugin.rebuildDataLayer();
					}),
			);

		new Setting(containerEl).setName("Definitions").setHeading();

		new Setting(containerEl)
			.setName("New definition")
			.setDesc("Create a habit, maintenance task, reverse habit, project, or counter.")
			.addButton((b) =>
				b
					.setButtonText("+ New")
					.setCta()
					.onClick(() => {
						this.plugin.openNewDefinition();
					}),
			);

		const { definitions, warnings } = await this.plugin.data.loadDefinitions();
		if (warnings.length > 0) {
			console.warn("[life-tracker] definition warnings:", warnings);
		}

		const sorted = [...definitions].sort((a, b) =>
			a.displayName.localeCompare(b.displayName),
		);
		if (sorted.length === 0) {
			containerEl.createEl("p", {
				text: "No definitions yet. Use \"+ New\" above or run the \"Life Tracker: New definition\" command.",
				cls: "setting-item-description",
			});
		} else {
			for (const def of sorted) {
				const setting = new Setting(containerEl)
					.setName(`${def.emoji ? `${def.emoji} ` : ""}${def.displayName}`)
					.setDesc(
						`${def.kind} · ${def.id}${def.status !== "active" ? ` · ${def.status}` : ""}`,
					);

				setting.addExtraButton((b) =>
					b
						.setIcon("pencil")
						.setTooltip("Edit")
						.onClick(() => {
							this.plugin.openEditDefinition(def.id);
						}),
				);

				if (def.status === "archived") {
					setting.addExtraButton((b) =>
						b
							.setIcon("rotate-ccw")
							.setTooltip("Unarchive")
							.onClick(async () => {
								await this.plugin.data.unarchiveDefinition(def.id);
								await this.display();
							}),
					);
				} else {
					setting.addExtraButton((b) =>
						b
							.setIcon("archive")
							.setTooltip("Archive")
							.onClick(async () => {
								await this.plugin.data.archiveDefinition(def.id);
								await this.display();
							}),
					);
				}
			}
		}

		new Setting(containerEl).setName("Quick-log commands").setHeading();
		containerEl.createEl("p", {
			text: "Toggle a definition on to register a dedicated 'Life Tracker: Log <name>' command. Commands are registered at plugin load — toggle changes take effect after disabling/re-enabling the plugin (or relaunching Obsidian).",
			cls: "setting-item-description",
		});

		if (sorted.length === 0) return;

		for (const def of sorted) {
			new Setting(containerEl)
				.setName(`${def.emoji ? `${def.emoji} ` : ""}${def.displayName}`)
				.setDesc(`${def.kind} · ${def.id}`)
				.addToggle((t) =>
					t
						.setValue(this.plugin.settings.quickLogIds.includes(def.id))
						.onChange(async (enabled) => {
							const set = new Set(this.plugin.settings.quickLogIds);
							if (enabled) set.add(def.id);
							else set.delete(def.id);
							this.plugin.settings.quickLogIds = [...set];
							await this.plugin.saveSettings();
						}),
				);
		}
	}
}
