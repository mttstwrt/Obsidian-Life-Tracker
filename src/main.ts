import { Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { DataLayer } from "./data/dataLayer";
import {
	formatPlanLine,
	parseCheckedPlanLines,
	parseUncheckedPlanLines,
} from "./data/dailyNote";
import {
	addPlanLineToDailyNote,
	findOpenSlotForDate,
	localDateString,
	localTimeString,
	markPlanLineForEvent,
	parseDailyNoteDateForApp,
	removeAppendedPlanLine,
	resolveDailyNoteConfig,
	unmarkPlanLineForEvent,
} from "./data/dailyNoteService";
import type { PlanFormSuccess } from "./data/planForm";
import {
	autoEventToEventInput,
	buildAutoEvent,
	buildPlannedTimestamp,
	matchDefinitionByLabel,
} from "./data/planSync";
import { ObsidianVaultAdapter, type VaultAdapter } from "./data/vaultAdapter";
import type { Definition, Event } from "./data/types";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./views/DashboardView";
import { SidebarView, VIEW_TYPE_SIDEBAR } from "./views/SidebarView";
import { DefinitionFormModal } from "./views/DefinitionFormModal";
import { EventDetailModal } from "./views/EventDetailModal";
import { LogEventModal, type LogMode } from "./views/LogEventModal";
import { PickDefinitionModal } from "./views/PickDefinitionModal";
import { ReorderModal, type ReorderItem } from "./views/ReorderModal";
import { LifeTrackerSettingTab } from "./views/SettingsTab";
import { showUndoableLogNotice } from "./views/undoLogNotice";
import "virtual:uno.css";

export type OrderTabKey = "habits" | "counters" | "maintenance" | "projects";

interface LifeTrackerSettings {
	rootFolder: string;
	planHeading: string;
	recentDefinitionIds: string[];
	quickLogIds: string[];
	definitionOrder: Record<OrderTabKey, string[]>;
	habitWindowMode: "calendar" | "rolling";
	recordUnplannedEvents: boolean;
}

const DEFAULT_SETTINGS: LifeTrackerSettings = {
	rootFolder: "LifeTracker",
	planHeading: "Timeline",
	recentDefinitionIds: [],
	quickLogIds: [],
	definitionOrder: { habits: [], counters: [], maintenance: [], projects: [] },
	habitWindowMode: "calendar",
	recordUnplannedEvents: false,
};

const RECENT_LIMIT = 20;

function planKey(path: string, startTime: string, label: string): string {
	return `${path}::${startTime}::${label.toLowerCase()}`;
}

interface MarkedPlanInfo {
	path: string;
	startTime: string;
	label: string;
	/** True if we appended a brand-new checked line; false if we toggled an existing planned line. */
	appended: boolean;
}

export default class LifeTrackerPlugin extends Plugin {
	settings!: LifeTrackerSettings;
	data!: DataLayer;
	private vaultAdapter!: VaultAdapter;
	private processedPlanKeys = new Set<string>();

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.definitionOrder = {
			...DEFAULT_SETTINGS.definitionOrder,
			...(this.settings.definitionOrder ?? {}),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async setDefinitionOrder(tab: OrderTabKey, ids: string[]): Promise<void> {
		this.settings.definitionOrder[tab] = ids;
		await this.saveSettings();
		this.refreshDashboards();
	}

	refreshDashboards(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)) {
			const view = leaf.view as DashboardView;
			view.refresh?.();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)) {
			const view = leaf.view as SidebarView;
			view.refresh?.();
		}
	}

	async openReorderModal(tab: OrderTabKey): Promise<void> {
		const { definitions } = await this.data.loadDefinitions();
		const tabKinds: Record<OrderTabKey, Definition["kind"][]> = {
			habits: ["habit", "reverse-habit"],
			counters: ["counter"],
			maintenance: ["maintenance"],
			projects: ["project"],
		};
		const allowed = new Set(tabKinds[tab]);
		const tabDefs = definitions.filter(
			(d) => d.status === "active" && allowed.has(d.kind),
		);
		const order = this.settings.definitionOrder[tab] ?? [];
		const idx = new Map(order.map((id, i) => [id, i]));
		tabDefs.sort((a, b) => {
			const ai = idx.get(a.id);
			const bi = idx.get(b.id);
			if (ai !== undefined && bi !== undefined) return ai - bi;
			if (ai !== undefined) return -1;
			if (bi !== undefined) return 1;
			return a.displayName.localeCompare(b.displayName);
		});
		const items: ReorderItem[] = tabDefs.map((d) => ({
			id: d.id,
			label: d.displayName,
			emoji: d.emoji,
			hint: d.kind === "reverse-habit" ? "reverse" : undefined,
		}));
		const titles: Record<OrderTabKey, string> = {
			habits: "Reorder habits",
			counters: "Reorder counters",
			maintenance: "Reorder maintenance",
			projects: "Reorder projects",
		};
		new ReorderModal(this.app, {
			title: titles[tab],
			items,
			onSave: async (ids) => {
				await this.setDefinitionOrder(tab, ids);
			},
		}).open();
	}

	rebuildDataLayer(): void {
		this.vaultAdapter = new ObsidianVaultAdapter(this.app.vault);
		this.data = new DataLayer(this.vaultAdapter, this.settings.rootFolder);
		void this.ensureRootFolder();
	}

	private async ensureRootFolder(): Promise<void> {
		try {
			await this.vaultAdapter.ensureFolder(this.data.definitionsFolder);
		} catch (err) {
			console.warn("[life-tracker] failed to ensure root folder:", err);
		}
	}

	async onload() {
		await this.loadSettings();
		this.rebuildDataLayer();

		this.registerView(
			VIEW_TYPE_DASHBOARD,
			(leaf) => new DashboardView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_SIDEBAR,
			(leaf) => new SidebarView(leaf, this),
		);

		this.addRibbonIcon("activity", "Open Life Tracker dashboard", () => {
			this.openDashboard();
		});

		this.addRibbonIcon("list-checks", "Open Life Tracker sidebar", () => {
			this.openSidebar();
		});

		this.addCommand({
			id: "open-dashboard",
			name: "Open dashboard",
			callback: () => this.openDashboard(),
		});

		this.addCommand({
			id: "open-sidebar",
			name: "Open sidebar",
			callback: () => this.openSidebar(),
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

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					void this.handleDailyNoteModify(file);
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.snapshotExistingPlanChecks();
		});
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

	async openSidebar(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({
				type: VIEW_TYPE_SIDEBAR,
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
					onLogged: (_id, ev, mode) =>
						this.handleEventLogged(def, ev, mode),
					onPlan: (planned) => this.handlePlan(def, planned),
					findSlot: (date, durationMin) =>
						this.findOpenSlot(date, durationMin),
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
			onLogged: (_id, ev, mode) => this.handleEventLogged(def, ev, mode),
			onPlan: (planned) => this.handlePlan(def, planned),
			findSlot: (date, durationMin) =>
				this.findOpenSlot(date, durationMin),
		}).open();
	}

	private findOpenSlot(
		date: string,
		durationMin: number,
	): Promise<string | null> {
		return findOpenSlotForDate({
			app: this.app,
			vault: this.vaultAdapter,
			date,
			heading: this.settings.planHeading,
			durationMin,
		});
	}

	private async handlePlan(
		def: Definition,
		planned: PlanFormSuccess,
	): Promise<void> {
		try {
			const path = await addPlanLineToDailyNote({
				app: this.app,
				vault: this.vaultAdapter,
				date: planned.date,
				heading: this.settings.planHeading,
				line: planned.line,
			});
			new Notice(`Planned ${def.displayName} → ${path}`);
		} catch (err) {
			new Notice(`Failed to plan: ${(err as Error).message ?? String(err)}`);
			throw err;
		}
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
			const logged = await this.data.appendEvent(definitionId, {
				id: "",
				timestamp: new Date().toISOString(),
				value: 1,
				fields: {},
			});
			await this.handleEventLogged(def, logged, "create");
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

	private async snapshotExistingPlanChecks(): Promise<void> {
		const config = resolveDailyNoteConfig(this.app);
		const heading = this.settings.planHeading;
		for (const file of this.app.vault.getMarkdownFiles()) {
			const date = parseDailyNoteDateForApp(file.path, config);
			if (!date) continue;
			try {
				const content = await this.app.vault.cachedRead(file);
				for (const line of parseCheckedPlanLines(content, heading)) {
					this.processedPlanKeys.add(planKey(file.path, line.startTime, line.label));
				}
			} catch {
				// ignore unreadable files
			}
		}
	}

	private async handleDailyNoteModify(file: TFile): Promise<void> {
		const config = resolveDailyNoteConfig(this.app);
		const date = parseDailyNoteDateForApp(file.path, config);
		if (!date) return;

		let content: string;
		try {
			content = await this.app.vault.cachedRead(file);
		} catch {
			return;
		}

		const heading = this.settings.planHeading;
		const checked = parseCheckedPlanLines(content, heading);
		const unchecked = parseUncheckedPlanLines(content, heading);

		const checkedKeys = new Set<string>();
		const newLines: typeof checked = [];
		for (const line of checked) {
			const key = planKey(file.path, line.startTime, line.label);
			checkedKeys.add(key);
			if (!this.processedPlanKeys.has(key)) {
				newLines.push(line);
			}
		}

		// Index currently-unchecked lines so we can detect the checked→unchecked
		// transition for previously-tracked keys.
		const uncheckedByKey = new Map<string, (typeof unchecked)[number]>();
		for (const line of unchecked) {
			uncheckedByKey.set(
				planKey(file.path, line.startTime, line.label),
				line,
			);
		}

		// Tracked keys for this file that are no longer checked: either the user
		// unchecked the box (line still present, just `[ ]`) or removed/edited
		// the line. Only the still-present-but-unchecked case triggers an unlog;
		// a removed line is left alone so manual edits don't delete events.
		const uncheckedTransitions: (typeof unchecked)[number][] = [];
		const filePrefix = `${file.path}::`;
		for (const key of this.processedPlanKeys) {
			if (!key.startsWith(filePrefix)) continue;
			if (checkedKeys.has(key)) continue;
			this.processedPlanKeys.delete(key);
			const line = uncheckedByKey.get(key);
			if (line) uncheckedTransitions.push(line);
		}

		if (newLines.length === 0 && uncheckedTransitions.length === 0) return;

		// Mark new checked keys up-front to avoid re-entrancy from our own
		// appendEvent triggering further modifies on definition files.
		for (const line of newLines) {
			this.processedPlanKeys.add(planKey(file.path, line.startTime, line.label));
		}

		const { definitions } = await this.data.loadDefinitions();
		let logged = 0;
		let unlogged = 0;
		const skipped: string[] = [];

		for (const line of newLines) {
			const def = matchDefinitionByLabel(line.label, definitions);
			if (!def) {
				skipped.push(`no match for "${line.label}"`);
				continue;
			}
			const auto = buildAutoEvent(def, line, date);
			if (!auto) {
				skipped.push(`${def.displayName}: required fields, open log modal`);
				continue;
			}
			const existing = await this.data.loadEvents(def.id);
			if (existing.some((e) => e.timestamp === auto.timestamp)) continue;
			try {
				await this.data.appendEvent(def.id, autoEventToEventInput(auto));
				logged += 1;
			} catch (err) {
				console.warn("[life-tracker] auto-log failed:", err);
			}
		}

		for (const line of uncheckedTransitions) {
			const def = matchDefinitionByLabel(line.label, definitions);
			if (!def) continue;
			// Match by exact timestamp string. buildPlannedTimestamp produces the
			// same value the auto-log path stored, so this targets the auto-logged
			// event for this date+startTime — and avoids deleting events from
			// other days or manual logs (which carry seconds/milliseconds).
			const expected = buildPlannedTimestamp(date, line.startTime);
			if (!expected) continue;
			const existing = await this.data.loadEvents(def.id);
			const match = existing.find((e) => e.timestamp === expected);
			if (!match) continue;
			try {
				await this.data.deleteEvent(def.id, match.id);
				unlogged += 1;
			} catch (err) {
				console.warn("[life-tracker] auto-unlog failed:", err);
			}
		}

		if (logged > 0) {
			new Notice(
				logged === 1
					? `Auto-logged 1 event from daily note`
					: `Auto-logged ${logged} events from daily note`,
			);
		}
		if (unlogged > 0) {
			new Notice(
				unlogged === 1
					? `Removed 1 auto-logged event`
					: `Removed ${unlogged} auto-logged events`,
			);
		}
		if (skipped.length > 0) {
			console.info("[life-tracker] auto-log skipped:", skipped.join("; "));
		}
	}

	private async afterEventLogged(
		definitionId: string,
		event: Event,
	): Promise<MarkedPlanInfo | null> {
		await this.recordRecent(definitionId);
		const def = await this.data.getDefinition(definitionId);
		if (!def) return null;
		return await this.syncEventToDailyNote(def, event);
	}

	private async handleEventLogged(
		def: Definition,
		event: Event,
		mode: LogMode,
	): Promise<void> {
		const marked = await this.afterEventLogged(def.id, event);
		if (mode === "create") {
			showUndoableLogNotice(this.data, def.id, event.id, def.displayName, {
				onAfterDelete: marked
					? () => this.untickPlanLineForUndo(marked)
					: undefined,
			});
		}
	}

	private async syncEventToDailyNote(
		def: Definition,
		event: Event,
	): Promise<MarkedPlanInfo | null> {
		const ts = new Date(event.timestamp);
		if (Number.isNaN(ts.getTime())) return null;
		const date = localDateString(ts);
		const time = localTimeString(ts);
		try {
			const result = await markPlanLineForEvent({
				app: this.app,
				vault: this.vaultAdapter,
				date,
				heading: this.settings.planHeading,
				label: def.displayName,
				time,
				beforeWrite: ({ path, matched }) => {
					// Pre-register the plan key so the modify watcher doesn't
					// re-process this checkbox toggle as a fresh check.
					this.processedPlanKeys.add(
						planKey(path, matched.startTime, matched.label),
					);
				},
			});
			if (result) {
				return {
					path: result.path,
					startTime: result.matched.startTime,
					label: result.matched.label,
					appended: false,
				};
			}

			if (!this.settings.recordUnplannedEvents) return null;
			return await this.appendEventEntryToDailyNote(def, date, time);
		} catch (err) {
			console.warn("[life-tracker] sync event → checkbox failed:", err);
			return null;
		}
	}

	private async appendEventEntryToDailyNote(
		def: Definition,
		date: string,
		time: string,
	): Promise<MarkedPlanInfo | null> {
		const planned = formatPlanLine({
			kind: def.kind,
			displayName: def.displayName,
			startTime: time,
			tags: def.tags,
		});
		// Already happened — emit the line pre-checked.
		const line = planned.replace(/^(\s*-\s*)\[ \]/, "$1[x]");

		// Pre-register the plan key so the modify watcher treats the resulting
		// file change as already-processed and doesn't auto-log a duplicate.
		const path = await addPlanLineToDailyNote({
			app: this.app,
			vault: this.vaultAdapter,
			date,
			heading: this.settings.planHeading,
			line,
		});
		this.processedPlanKeys.add(planKey(path, time, def.displayName));

		return {
			path,
			startTime: time,
			label: def.displayName,
			appended: true,
		};
	}

	private async untickPlanLineForUndo(marked: MarkedPlanInfo): Promise<void> {
		// Pre-drop the plan key so the modify watcher doesn't try to also
		// auto-unlog the event we already deleted.
		this.processedPlanKeys.delete(
			planKey(marked.path, marked.startTime, marked.label),
		);
		if (marked.appended) {
			// Remove the line we added — leaving it as an unchecked phantom
			// would misrepresent the day's plan.
			await removeAppendedPlanLine({
				app: this.app,
				vault: this.vaultAdapter,
				path: marked.path,
				heading: this.settings.planHeading,
				label: marked.label,
				time: marked.startTime,
			});
			return;
		}
		await unmarkPlanLineForEvent({
			app: this.app,
			vault: this.vaultAdapter,
			path: marked.path,
			heading: this.settings.planHeading,
			label: marked.label,
			time: marked.startTime,
		});
	}

	private async recordRecent(id: string): Promise<void> {
		const list = [id, ...this.settings.recentDefinitionIds.filter((x) => x !== id)];
		this.settings.recentDefinitionIds = list.slice(0, RECENT_LIMIT);
		await this.saveSettings();
	}
}
