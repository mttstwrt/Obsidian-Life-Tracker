/**
 * Persisted display order for the dashboard's definition lists.
 *
 * The order lives in the plugin's `data.json` (under `.obsidian/`) rather than
 * in vault markdown, so it rides along with whatever syncs that folder. The
 * entries are definition `id`s, which come from each definition file's
 * frontmatter — stable across devices, unlike file paths or array positions.
 *
 * `data.json` is a whole-file write, so two devices reordering different tabs
 * between syncs can clobber each other. `mergeDefinitionOrder` narrows that
 * window by rebasing onto whatever is on disk at write time; see its docs.
 */

export type OrderTabKey = "habits" | "counters" | "maintenance" | "projects";

export const ORDER_TAB_KEYS: OrderTabKey[] = [
	"habits",
	"counters",
	"maintenance",
	"projects",
];

export type DefinitionOrder = Record<OrderTabKey, string[]>;

export function emptyDefinitionOrder(): DefinitionOrder {
	return { habits: [], counters: [], maintenance: [], projects: [] };
}

/**
 * Coerce whatever came out of `data.json` into a full `DefinitionOrder`.
 * Anything unrecognized — a missing tab, a non-array value, non-string entries,
 * duplicate ids — is dropped rather than thrown on, matching the data layer's
 * "never lose the user's file to a parse error" rule.
 */
export function normalizeDefinitionOrder(raw: unknown): DefinitionOrder {
	const out = emptyDefinitionOrder();
	if (!raw || typeof raw !== "object") return out;
	const obj = raw as Record<string, unknown>;
	for (const tab of ORDER_TAB_KEYS) {
		const value = obj[tab];
		if (!Array.isArray(value)) continue;
		const seen = new Set<string>();
		for (const entry of value) {
			if (typeof entry !== "string" || entry === "") continue;
			if (seen.has(entry)) continue;
			seen.add(entry);
			out[tab].push(entry);
		}
	}
	return out;
}

/**
 * Rebase a just-edited tab order onto the copy currently on disk.
 *
 * Called right before writing `data.json`. `onDisk` is a fresh read, so it
 * already contains any reorder Sync pulled in from another device since this
 * one loaded its settings. Taking `onDisk` as the base and overlaying only the
 * tab the user actually touched means a phone reordering habits and a laptop
 * reordering projects both survive, instead of whichever wrote last winning
 * every tab.
 *
 * `fallback` covers the case where the tab is absent from disk entirely (fresh
 * install, or a device that has never written that tab) — the in-memory value
 * is better than nothing there.
 */
export function mergeDefinitionOrder(
	onDisk: unknown,
	fallback: DefinitionOrder,
	changed: { tab: OrderTabKey; ids: string[] },
): DefinitionOrder {
	const diskOrder = normalizeDefinitionOrder(onDisk);
	const merged = emptyDefinitionOrder();
	for (const tab of ORDER_TAB_KEYS) {
		merged[tab] =
			diskOrder[tab].length > 0 ? diskOrder[tab] : [...(fallback[tab] ?? [])];
	}
	merged[changed.tab] = normalizeDefinitionOrder({
		[changed.tab]: changed.ids,
	})[changed.tab];
	return merged;
}
