import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import Dashboard from "../components/Dashboard.svelte";
import type LifeTrackerPlugin from "../main";

export const VIEW_TYPE_DASHBOARD = "life-tracker-dashboard";

interface DashboardApi {
	refresh: () => void;
}

export class DashboardView extends ItemView {
	private component: ReturnType<typeof mount> | null = null;
	private api: DashboardApi | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LifeTrackerPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return "Life Tracker";
	}

	getIcon(): string {
		return "activity";
	}

	async onOpen(): Promise<void> {
		// Belt-and-braces for cross-device ordering: `onExternalSettingsChange` is
		// the intended signal when Sync rewrites data.json, but it doesn't fire
		// reliably on every platform. Re-reading here covers the common flow of
		// picking up the other device and opening the dashboard. Safe because every
		// settings mutation saves immediately, so disk is never behind memory.
		await this.plugin.loadSettings();

		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-dashboard");

		this.component = mount(Dashboard, {
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				registerApi: (api: DashboardApi) => {
					this.api = api;
				},
			},
		});

		const folder = this.plugin.data.definitionsFolder;
		const onChange = (path: string) => {
			if (!path.startsWith(`${folder}/`)) return;
			this.scheduleRefresh();
		};
		this.registerEvent(
			this.app.vault.on("modify", (file) => onChange(file.path)),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => onChange(file.path)),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => onChange(file.path)),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				onChange(file.path);
				onChange(oldPath);
			}),
		);
	}

	private scheduleRefresh(): void {
		if (this.refreshTimer !== null) return;
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			this.api?.refresh();
		}, 80);
	}

	refresh(): void {
		this.api?.refresh();
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== null) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		if (this.component) {
			unmount(this.component);
			this.component = null;
		}
		this.contentEl.empty();
	}
}
