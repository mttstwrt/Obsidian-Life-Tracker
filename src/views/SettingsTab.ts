import { type App, PluginSettingTab, Setting } from "obsidian";
import type LifeTrackerPlugin from "../main";
import type { Definition } from "../data/types";

export class LifeTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: LifeTrackerPlugin) {
		super(app, plugin);
	}

	private renderDefinitionRow(containerEl: HTMLElement, def: Definition): void {
		const setting = new Setting(containerEl)
			.setName(`${def.emoji ? `${def.emoji} ` : ""}${def.displayName}`)
			.setDesc(
				`${def.kind} · ${def.id}${
					def.status !== "active" ? ` · ${def.status}` : ""
				}`,
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

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Root folder")
			.setDesc(
				"Folder under your vault where definitions live. Definitions sit in <root>/definitions/. Created automatically if missing.",
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

		new Setting(containerEl)
			.setName("Rolling habit window")
			.setDesc(
				"When on, weekly/monthly habit progress counts events from the past 7 or 30 days (rolling) instead of the current calendar week/month. Daily habits are unaffected.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.habitWindowMode === "rolling")
					.onChange(async (rolling) => {
						this.plugin.settings.habitWindowMode = rolling
							? "rolling"
							: "calendar";
						await this.plugin.saveSettings();
						this.plugin.refreshDashboards();
					}),
			);

		new Setting(containerEl).setName("Daily-note integration").setHeading();

		new Setting(containerEl)
			.setName("Plan heading")
			.setDesc(
				'Level-2 heading inside the daily note that planned lines are appended under. The Day Planner plugin reads any HH:mm lines below this heading. Default: "Timeline".',
			)
			.addText((t) =>
				t
					.setValue(this.plugin.settings.planHeading)
					.setPlaceholder("Timeline")
					.onChange(async (v) => {
						this.plugin.settings.planHeading = v.trim() || "Timeline";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-log from daily note checkboxes")
			.setDesc(
				"When on, checking a planned line under the plan heading logs the matching event, and unchecking it removes the auto-logged event. Turn off if a sync tool rewriting daily notes causes duplicate events.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.autoLogFromDailyNotes)
					.onChange(async (v) => {
						this.plugin.settings.autoLogFromDailyNotes = v;
						await this.plugin.saveSettings();
						if (v) await this.plugin.resnapshotPlanChecks();
					}),
			);

		new Setting(containerEl)
			.setName("Record unplanned events in daily note")
			.setDesc(
				"When on, logging an event also writes a checked entry into that day's daily note (under the plan heading) if no matching planned line exists. When off, only existing planned lines get ticked.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.recordUnplannedEvents)
					.onChange(async (v) => {
						this.plugin.settings.recordUnplannedEvents = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Link activities to their definitions")
			.setDesc(
				"When on, planned and auto-recorded entries write their label as an Obsidian wikilink to the definition file (e.g. `[[running|Run]]`). Existing entries in daily notes aren't rewritten.",
			)
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.linkActivitiesToDefinitions)
					.onChange(async (v) => {
						this.plugin.settings.linkActivitiesToDefinitions = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Definitions").setHeading();

		new Setting(containerEl)
			.setName("New definition")
			.setDesc(
				"Create a habit, maintenance task, reverse habit, project, counter, or score.",
			)
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
		// Dormant stays with the live ones — a project that has gone quiet is
		// still something you are tracking. Only archived is put away.
		const live = sorted.filter((d) => d.status !== "archived");
		const archived = sorted.filter((d) => d.status === "archived");

		if (sorted.length === 0) {
			containerEl.createEl("p", {
				text: "No definitions yet. Use \"+ New\" above or run the \"Life Tracker: New definition\" command.",
				cls: "setting-item-description",
			});
		} else {
			if (live.length === 0) {
				containerEl.createEl("p", {
					text: "Nothing active — everything you track is archived.",
					cls: "setting-item-description",
				});
			}
			for (const def of live) {
				this.renderDefinitionRow(containerEl, def);
			}
			if (archived.length > 0) {
				new Setting(containerEl)
					.setName(`Archived (${archived.length})`)
					.setHeading();
				for (const def of archived) {
					this.renderDefinitionRow(containerEl, def);
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
