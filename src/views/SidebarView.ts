import { ItemView, type WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import SidebarPanel from "../components/SidebarPanel.svelte";
import type LifeTrackerPlugin from "../main";

export const VIEW_TYPE_SIDEBAR = "life-tracker-sidebar";

interface SidebarApi {
	refresh: () => void;
}

export class SidebarView extends ItemView {
	private component: ReturnType<typeof mount> | null = null;
	private api: SidebarApi | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LifeTrackerPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_SIDEBAR;
	}

	getDisplayText(): string {
		return "Life Tracker";
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("life-tracker-sidebar");

		this.component = mount(SidebarPanel, {
			target: this.contentEl,
			props: {
				plugin: this.plugin,
				registerApi: (api: SidebarApi) => {
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
