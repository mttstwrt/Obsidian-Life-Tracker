import { type App, moment as obsidianMoment } from "obsidian";

// Obsidian re-exports moment as `typeof Moment` (the namespace), which TS doesn't see as callable
// even though it is at runtime. Cast to the callable function form.
type MomentFactory = (
	input: string,
	format: string,
	strict?: boolean,
) => { format(f: string): string; isValid(): boolean };
const moment = obsidianMoment as unknown as MomentFactory;
import {
	DEFAULT_DAILY_NOTE_FORMAT,
	type DailyNoteConfig,
	type MarkPlanLineMatch,
	dailyNotePath,
	findOpenSlot,
	insertUnderHeading,
	markPlanLineCheckedForLabel,
	parseDailyNotePath,
	parsePlannedBlocks,
} from "./dailyNote";
import type { VaultAdapter } from "./vaultAdapter";

export function resolveDailyNoteConfig(app: App): DailyNoteConfig {
	const internal = (
		app as unknown as {
			internalPlugins?: {
				getPluginById?: (id: string) => {
					enabled?: boolean;
					instance?: { options?: { folder?: string; format?: string } };
				} | null;
			};
		}
	).internalPlugins;
	const plugin = internal?.getPluginById?.("daily-notes");
	const opts = plugin?.instance?.options;
	return {
		folder: opts?.folder?.trim() ?? "",
		format: opts?.format?.trim() || DEFAULT_DAILY_NOTE_FORMAT,
	};
}

export interface AddPlanLineOpts {
	app: App;
	vault: VaultAdapter;
	date: string;
	heading: string;
	line: string;
}

export async function addPlanLineToDailyNote(
	opts: AddPlanLineOpts,
): Promise<string> {
	const config = resolveDailyNoteConfig(opts.app);
	const path = dailyNotePath(opts.date, config, (date, format) =>
		moment(date, "YYYY-MM-DD").format(format),
	);

	if (await opts.vault.exists(path)) {
		const content = await opts.vault.read(path);
		const updated = insertUnderHeading(content, opts.heading, opts.line);
		await opts.vault.write(path, updated);
	} else {
		const slashIdx = path.lastIndexOf("/");
		if (slashIdx > 0) {
			await opts.vault.ensureFolder(path.slice(0, slashIdx));
		}
		const seed = insertUnderHeading("", opts.heading, opts.line);
		await opts.vault.create(path, seed);
	}

	return path;
}

export interface FindOpenSlotForDateOpts {
	app: App;
	vault: VaultAdapter;
	date: string;
	heading: string;
	durationMin: number;
	now?: () => Date;
}

export async function findOpenSlotForDate(
	opts: FindOpenSlotForDateOpts,
): Promise<string | null> {
	const config = resolveDailyNoteConfig(opts.app);
	const path = dailyNotePath(opts.date, config, (date, format) =>
		moment(date, "YYYY-MM-DD").format(format),
	);
	const blocks = (await opts.vault.exists(path))
		? parsePlannedBlocks(await opts.vault.read(path), opts.heading)
		: [];
	const now = (opts.now ?? (() => new Date()))();
	const todayStr = localDateString(now);
	const notBeforeMin =
		opts.date === todayStr
			? now.getHours() * 60 + now.getMinutes()
			: opts.date < todayStr
				? Number.POSITIVE_INFINITY // past day → no future slots possible
				: undefined;
	return findOpenSlot({
		blocks,
		durationMin: opts.durationMin,
		notBeforeMin,
	});
}

export function localDateString(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function localTimeString(d: Date): string {
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	return `${h}:${m}`;
}

export interface MarkPlanLineForEventOpts {
	app: App;
	vault: VaultAdapter;
	date: string;
	heading: string;
	label: string;
	time?: string;
	/**
	 * Called BEFORE the file is written, with the resolved daily-note path and the
	 * matched line. Use this to register the plan key with any modify-watcher state
	 * so the resulting file change isn't re-processed as a fresh check.
	 */
	beforeWrite?: (info: { path: string; matched: MarkPlanLineMatch }) => void;
}

/**
 * Resolve the daily note for `date`; if it has an unchecked plan line whose label
 * matches `label`, toggle it to checked. Returns the matched line and resolved path,
 * or null if no daily note exists or no match is found.
 */
export async function markPlanLineForEvent(
	opts: MarkPlanLineForEventOpts,
): Promise<{ path: string; matched: MarkPlanLineMatch } | null> {
	const config = resolveDailyNoteConfig(opts.app);
	const path = dailyNotePath(opts.date, config, (date, format) =>
		moment(date, "YYYY-MM-DD").format(format),
	);
	if (!(await opts.vault.exists(path))) return null;

	const content = await opts.vault.read(path);
	const result = markPlanLineCheckedForLabel(
		content,
		opts.heading,
		opts.label,
		opts.time,
	);
	if (!result.matched || result.updated === content) return null;

	opts.beforeWrite?.({ path, matched: result.matched });
	await opts.vault.write(path, result.updated);
	return { path, matched: result.matched };
}

/**
 * Resolve `path` to a daily-note date (`YYYY-MM-DD`) or null. Uses moment in strict
 * mode so an off-format file in the daily-notes folder doesn't accidentally trigger
 * sync. The pure parsing logic lives in `dailyNote.ts`; this just supplies moment.
 */
export function parseDailyNoteDateForApp(
	path: string,
	config: DailyNoteConfig,
): string | null {
	return parseDailyNotePath(path, config, (basename, format) => {
		const parsed = moment(basename, format, true);
		if (!parsed.isValid()) return null;
		return parsed.format("YYYY-MM-DD");
	});
}
