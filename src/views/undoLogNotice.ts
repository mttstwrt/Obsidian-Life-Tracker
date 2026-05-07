import { Notice } from "obsidian";
import type { DataLayer } from "../data/dataLayer";

export interface UndoableLogNoticeOpts {
	timeoutMs?: number;
	/** Runs after the event delete succeeds. Failures here are logged, not surfaced. */
	onAfterDelete?: () => Promise<void>;
}

export function showUndoableLogNotice(
	data: DataLayer,
	definitionId: string,
	eventId: string,
	displayName: string,
	opts: UndoableLogNoticeOpts = {},
): void {
	const fragment = document.createDocumentFragment();
	fragment.createSpan({ text: `Logged ${displayName} · ` });
	const undoLink = fragment.createEl("a", { text: "Undo" });
	undoLink.setAttr("href", "#");

	const notice = new Notice(fragment, opts.timeoutMs ?? 8000);

	undoLink.addEventListener("click", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await data.deleteEvent(definitionId, eventId);
		} catch (err) {
			new Notice(`Undo failed: ${(err as Error).message ?? String(err)}`);
			return;
		}
		if (opts.onAfterDelete) {
			try {
				await opts.onAfterDelete();
			} catch (err) {
				console.warn("[life-tracker] undo cleanup failed:", err);
			}
		}
		notice.hide();
		new Notice(`Undone ${displayName}`, 3000);
	});
}
