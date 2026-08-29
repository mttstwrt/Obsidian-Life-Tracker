import type { Definition } from "./types";

export interface PlanLineSpec {
	kind: Definition["kind"];
	displayName: string;
	label?: string;
	startTime: string;
	endTime?: string;
	tags?: string[];
	/**
	 * If set, the line's label is wrapped in an Obsidian wikilink pointing to
	 * this target (typically the definition's id / file basename). When the
	 * target equals the rendered label, the alias is omitted to keep the line
	 * compact (`[[Run]]` rather than `[[Run|Run]]`).
	 */
	linkTarget?: string;
}

function formatLabelMaybeLinked(label: string, linkTarget?: string): string {
	if (!linkTarget) return label;
	const target = linkTarget.trim();
	if (target === "") return label;
	if (target === label) return `[[${target}]]`;
	return `[[${target}|${label}]]`;
}

const TAG_BY_KIND: Record<Definition["kind"], string> = {
	habit: "#habit",
	"reverse-habit": "#habit",
	maintenance: "#maint",
	project: "#work",
	counter: "#habit",
	score: "#habit",
};

function sanitizeTag(raw: string): string | null {
	const stripped = raw.trim().replace(/^#+/, "");
	if (stripped === "") return null;
	const cleaned = stripped
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_\-/]/g, "");
	if (cleaned === "") return null;
	return `#${cleaned}`;
}

function buildTagSuffix(kindTag: string, tags?: string[]): string {
	const out: string[] = [kindTag];
	const seen = new Set([kindTag]);
	for (const t of tags ?? []) {
		const s = sanitizeTag(t);
		if (s && !seen.has(s)) {
			seen.add(s);
			out.push(s);
		}
	}
	return out.join(" ");
}

export function formatPlanLine(spec: PlanLineSpec): string {
	const label = (spec.label ?? "").trim() || spec.displayName;
	const rendered = formatLabelMaybeLinked(label, spec.linkTarget);
	const tagSuffix = buildTagSuffix(TAG_BY_KIND[spec.kind], spec.tags);

	if (spec.kind === "maintenance") {
		return `- [ ] ${spec.startTime} ${rendered} ${tagSuffix}`;
	}

	const timeBlock = spec.endTime
		? `${spec.startTime} - ${spec.endTime}`
		: spec.startTime;

	if (spec.kind === "project") {
		return `- [ ] ${timeBlock} Project: ${rendered} ${tagSuffix}`;
	}

	return `- [ ] ${timeBlock} ${rendered} ${tagSuffix}`;
}

const HEADING_PREFIX_RE = /^#{1,6}\s/;

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function insertUnderHeading(
	content: string,
	heading: string,
	line: string,
): string {
	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const match = content.match(headingPattern);
	if (!match || match.index === undefined) {
		const sep = content === "" ? "" : content.endsWith("\n") ? "\n" : "\n\n";
		return `${content}${sep}## ${heading}\n\n${line}\n`;
	}

	const sectionStart = match.index + match[0].length;
	const remainder = content.slice(sectionStart);
	const lines = remainder.split("\n");

	let endRel = remainder.length;
	let charsSeen = 0;
	for (let i = 0; i < lines.length; i++) {
		const l = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(l)) {
			endRel = charsSeen;
			break;
		}
		charsSeen += l.length + (i < lines.length - 1 ? 1 : 0);
	}

	const before = content.slice(0, sectionStart + endRel).replace(/\s+$/, "");
	const after = content.slice(sectionStart + endRel).replace(/^\n+/, "");
	const tail = after === "" ? "\n" : `\n\n${after}`;
	return `${before}\n\n${line}${tail}`;
}

export interface PlannedBlock {
	startMin: number;
	endMin: number;
}

const TIME_RE_SOURCE = "(\\d{2}):(\\d{2})";
const PLAN_LINE_RE = new RegExp(
	`^\\s*(?:- \\[[ xX]\\]\\s*)?${TIME_RE_SOURCE}(?:\\s*-\\s*${TIME_RE_SOURCE})?(?:\\s|$)`,
);

export function parsePlannedBlocks(
	content: string,
	heading: string,
): PlannedBlock[] {
	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const match = content.match(headingPattern);
	if (!match || match.index === undefined) return [];

	const sectionStart = match.index + match[0].length;
	const lines = content.slice(sectionStart).split("\n");
	const blocks: PlannedBlock[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(line)) break;
		const m = PLAN_LINE_RE.exec(line);
		if (!m) continue;
		const startMin = Number(m[1]) * 60 + Number(m[2]);
		if (!Number.isFinite(startMin) || startMin < 0 || startMin >= 24 * 60) {
			continue;
		}
		let endMin = startMin;
		if (m[3] !== undefined) {
			endMin = Number(m[3]) * 60 + Number(m[4]);
			if (!Number.isFinite(endMin) || endMin < 0 || endMin >= 24 * 60) {
				continue;
			}
			if (endMin < startMin) continue;
		}
		blocks.push({ startMin, endMin });
	}
	blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
	return blocks;
}

export interface FindOpenSlotOpts {
	blocks: PlannedBlock[];
	durationMin: number;
	dayStartMin?: number;
	dayEndMin?: number;
	granularityMin?: number;
	/** Don't return any slot starting before this minute-of-day (e.g. "now" when planning today). */
	notBeforeMin?: number;
}

export const DEFAULT_DAY_START_MIN = 8 * 60; // 08:00
export const DEFAULT_DAY_END_MIN = 22 * 60; // 22:00
export const DEFAULT_SLOT_GRANULARITY_MIN = 15;

export function findOpenSlot(opts: FindOpenSlotOpts): string | null {
	const dayStart = opts.dayStartMin ?? DEFAULT_DAY_START_MIN;
	const dayEnd = opts.dayEndMin ?? DEFAULT_DAY_END_MIN;
	const gran = opts.granularityMin ?? DEFAULT_SLOT_GRANULARITY_MIN;
	const dur = opts.durationMin;
	if (!Number.isFinite(dur) || dur <= 0) return null;
	if (dayEnd <= dayStart) return null;

	// Point events (no duration) don't block.
	const blocks = opts.blocks
		.filter((b) => b.endMin > b.startMin)
		.slice()
		.sort((a, b) => a.startMin - b.startMin);

	const floor = Math.max(dayStart, opts.notBeforeMin ?? dayStart);
	let candidate = ceilTo(floor, gran);
	while (candidate + dur <= dayEnd) {
		const end = candidate + dur;
		const overlap = blocks.find(
			(b) => b.startMin < end && b.endMin > candidate,
		);
		if (!overlap) return formatMinutes(candidate);
		const next = ceilTo(overlap.endMin, gran);
		candidate = next > candidate ? next : candidate + gran;
	}
	return null;
}

function ceilTo(value: number, step: number): number {
	if (step <= 0) return value;
	return Math.ceil(value / step) * step;
}

function formatMinutes(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseTimeToMinutes(time: string): number | null {
	const m = /^(\d{2}):(\d{2})$/.exec(time);
	if (!m) return null;
	const h = Number(m[1]);
	const mm = Number(m[2]);
	if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
	return h * 60 + mm;
}

export interface CheckedPlanLine {
	startTime: string;
	endTime?: string;
	label: string;
	raw: string;
}

const CHECKED_PLAN_LINE_RE = new RegExp(
	`^\\s*-\\s*\\[[xX]\\]\\s*${TIME_RE_SOURCE}(?:\\s*-\\s*${TIME_RE_SOURCE})?\\s+(.*)$`,
);

const PROJECT_PREFIX_RE = /^Project:\s+/i;
const TRAILING_TAGS_RE = /(?:\s+#[A-Za-z0-9_\-/]+)+\s*$/;
// Tasks plugin metadata markers (done/due/start/scheduled/created/cancelled
// dates, recurrence, id, depends-on, priorities). Always trail the description,
// so we strip from the first marker to end-of-line.
const TASKS_METADATA_TRAILING_RE =
	/\s+[\u{1F4C5}\u{2705}\u{1F6EB}\u{23F3}\u{2795}\u{274C}\u{1F501}\u{1F194}\u{26D3}\u{1F53A}\u{23EB}\u{1F53C}\u{1F53D}\u{23EC}].*$/u;

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function unwrapWikilinks(s: string): string {
	return s.replace(WIKILINK_RE, (_, target: string, alias?: string) =>
		(alias ?? target).trim(),
	);
}

export function extractPlanLabel(text: string): string {
	let s = text.trim();
	s = s.replace(TASKS_METADATA_TRAILING_RE, "");
	s = s.replace(TRAILING_TAGS_RE, "");
	s = s.replace(PROJECT_PREFIX_RE, "");
	s = unwrapWikilinks(s);
	return s.trim();
}

export function parseCheckedPlanLines(
	content: string,
	heading: string,
): CheckedPlanLine[] {
	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const match = content.match(headingPattern);
	if (!match || match.index === undefined) return [];

	const sectionStart = match.index + match[0].length;
	const lines = content.slice(sectionStart).split("\n");
	const out: CheckedPlanLine[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(line)) break;
		const m = CHECKED_PLAN_LINE_RE.exec(line);
		if (!m) continue;
		const startMin = Number(m[1]) * 60 + Number(m[2]);
		if (!Number.isFinite(startMin) || startMin < 0 || startMin >= 24 * 60) {
			continue;
		}
		const startTime = `${m[1]}:${m[2]}`;
		let endTime: string | undefined;
		if (m[3] !== undefined) {
			const endMin = Number(m[3]) * 60 + Number(m[4]);
			if (!Number.isFinite(endMin) || endMin < 0 || endMin >= 24 * 60) {
				continue;
			}
			endTime = `${m[3]}:${m[4]}`;
		}
		const label = extractPlanLabel(m[5] ?? "");
		if (label === "") continue;
		out.push({ startTime, endTime, label, raw: line });
	}
	return out;
}

const UNCHECKED_PLAN_LINE_RE = new RegExp(
	`^\\s*-\\s*\\[ \\]\\s*${TIME_RE_SOURCE}(?:\\s*-\\s*${TIME_RE_SOURCE})?\\s+(.*)$`,
);

export function parseUncheckedPlanLines(
	content: string,
	heading: string,
): CheckedPlanLine[] {
	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const match = content.match(headingPattern);
	if (!match || match.index === undefined) return [];

	const sectionStart = match.index + match[0].length;
	const lines = content.slice(sectionStart).split("\n");
	const out: CheckedPlanLine[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(line)) break;
		const m = UNCHECKED_PLAN_LINE_RE.exec(line);
		if (!m) continue;
		const startMin = Number(m[1]) * 60 + Number(m[2]);
		if (!Number.isFinite(startMin) || startMin < 0 || startMin >= 24 * 60) {
			continue;
		}
		const startTime = `${m[1]}:${m[2]}`;
		let endTime: string | undefined;
		if (m[3] !== undefined) {
			const endMin = Number(m[3]) * 60 + Number(m[4]);
			if (!Number.isFinite(endMin) || endMin < 0 || endMin >= 24 * 60) {
				continue;
			}
			endTime = `${m[3]}:${m[4]}`;
		}
		const label = extractPlanLabel(m[5] ?? "");
		if (label === "") continue;
		out.push({ startTime, endTime, label, raw: line });
	}
	return out;
}

export interface MarkPlanLineMatch {
	startTime: string;
	endTime?: string;
	label: string;
	raw: string;
}

export interface MarkPlanLineResult {
	updated: string;
	matched: MarkPlanLineMatch | null;
}

/**
 * Find the first unchecked plan line under `heading` whose label (after stripping
 * the time prefix, optional `Project:` prefix, and trailing tags) matches `label`
 * case-insensitively, and toggle `[ ]` → `[x]`.
 *
 * If `preferredTime` (HH:MM) is provided, prefers a candidate whose start time
 * matches exactly; otherwise picks the first match in document order. Multiple
 * planned lines for the same label work (each event consumes one).
 */
export function markPlanLineCheckedForLabel(
	content: string,
	heading: string,
	label: string,
	preferredTime?: string,
): MarkPlanLineResult {
	const target = label.trim().toLowerCase();
	if (target === "") return { updated: content, matched: null };

	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const head = content.match(headingPattern);
	if (!head || head.index === undefined) {
		return { updated: content, matched: null };
	}

	const sectionStart = head.index + head[0].length;
	const remainder = content.slice(sectionStart);
	const lines = remainder.split("\n");

	type Candidate = {
		index: number;
		startTime: string;
		endTime?: string;
		lineLabel: string;
		raw: string;
	};
	const candidates: Candidate[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(line)) break;
		const m = UNCHECKED_PLAN_LINE_RE.exec(line);
		if (!m) continue;
		const startTime = `${m[1]}:${m[2]}`;
		const endTime = m[3] !== undefined ? `${m[3]}:${m[4]}` : undefined;
		const lineLabel = extractPlanLabel(m[5] ?? "");
		if (lineLabel.toLowerCase() === target) {
			candidates.push({ index: i, startTime, endTime, lineLabel, raw: line });
		}
	}

	if (candidates.length === 0) return { updated: content, matched: null };

	const chosen =
		(preferredTime && candidates.find((c) => c.startTime === preferredTime)) ||
		candidates[0];

	const newLine = chosen.raw.replace(/^(\s*-\s*)\[ \]/, "$1[x]");
	lines[chosen.index] = newLine;
	const updated = content.slice(0, sectionStart) + lines.join("\n");

	return {
		updated,
		matched: {
			startTime: chosen.startTime,
			endTime: chosen.endTime,
			label: chosen.lineLabel,
			raw: newLine,
		},
	};
}

/**
 * Find the first checked plan line under `heading` whose label matches `label`
 * (case-insensitively) and delete it entirely. Used for undoing an
 * auto-appended log entry, where the line didn't exist before the log and
 * shouldn't survive the undo as a phantom unchecked entry.
 *
 * If `preferredTime` is provided, prefers an exact start-time match.
 */
export function removeCheckedPlanLineForLabel(
	content: string,
	heading: string,
	label: string,
	preferredTime?: string,
): MarkPlanLineResult {
	const target = label.trim().toLowerCase();
	if (target === "") return { updated: content, matched: null };

	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const head = content.match(headingPattern);
	if (!head || head.index === undefined) {
		return { updated: content, matched: null };
	}

	const sectionStart = head.index + head[0].length;
	const remainder = content.slice(sectionStart);
	const lines = remainder.split("\n");

	type Candidate = {
		index: number;
		startTime: string;
		endTime?: string;
		lineLabel: string;
		raw: string;
	};
	const candidates: Candidate[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(line)) break;
		const m = CHECKED_PLAN_LINE_RE.exec(line);
		if (!m) continue;
		const startTime = `${m[1]}:${m[2]}`;
		const endTime = m[3] !== undefined ? `${m[3]}:${m[4]}` : undefined;
		const lineLabel = extractPlanLabel(m[5] ?? "");
		if (lineLabel.toLowerCase() === target) {
			candidates.push({ index: i, startTime, endTime, lineLabel, raw: line });
		}
	}

	if (candidates.length === 0) return { updated: content, matched: null };

	const chosen =
		(preferredTime && candidates.find((c) => c.startTime === preferredTime)) ||
		candidates[0];

	lines.splice(chosen.index, 1);
	const updated = content.slice(0, sectionStart) + lines.join("\n");

	return {
		updated,
		matched: {
			startTime: chosen.startTime,
			endTime: chosen.endTime,
			label: chosen.lineLabel,
			raw: chosen.raw,
		},
	};
}

/**
 * Inverse of `markPlanLineCheckedForLabel`: find the first checked plan line under
 * `heading` whose label matches `label` case-insensitively, and toggle `[x]` → `[ ]`.
 *
 * If `preferredTime` is provided, prefers an exact start-time match. This is the
 * case we care about for undo — the line we just ticked has a known start time, so
 * we want to flip the same one back rather than the first label match.
 */
export function unmarkPlanLineCheckedForLabel(
	content: string,
	heading: string,
	label: string,
	preferredTime?: string,
): MarkPlanLineResult {
	const target = label.trim().toLowerCase();
	if (target === "") return { updated: content, matched: null };

	const headingPattern = new RegExp(
		`^##\\s+${escapeRegex(heading)}\\s*$`,
		"m",
	);
	const head = content.match(headingPattern);
	if (!head || head.index === undefined) {
		return { updated: content, matched: null };
	}

	const sectionStart = head.index + head[0].length;
	const remainder = content.slice(sectionStart);
	const lines = remainder.split("\n");

	type Candidate = {
		index: number;
		startTime: string;
		endTime?: string;
		lineLabel: string;
		raw: string;
	};
	const candidates: Candidate[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i > 0 && HEADING_PREFIX_RE.test(line)) break;
		const m = CHECKED_PLAN_LINE_RE.exec(line);
		if (!m) continue;
		const startTime = `${m[1]}:${m[2]}`;
		const endTime = m[3] !== undefined ? `${m[3]}:${m[4]}` : undefined;
		const lineLabel = extractPlanLabel(m[5] ?? "");
		if (lineLabel.toLowerCase() === target) {
			candidates.push({ index: i, startTime, endTime, lineLabel, raw: line });
		}
	}

	if (candidates.length === 0) return { updated: content, matched: null };

	const chosen =
		(preferredTime && candidates.find((c) => c.startTime === preferredTime)) ||
		candidates[0];

	const newLine = chosen.raw.replace(/^(\s*-\s*)\[[xX]\]/, "$1[ ]");
	lines[chosen.index] = newLine;
	const updated = content.slice(0, sectionStart) + lines.join("\n");

	return {
		updated,
		matched: {
			startTime: chosen.startTime,
			endTime: chosen.endTime,
			label: chosen.lineLabel,
			raw: newLine,
		},
	};
}

export interface DailyNoteConfig {
	folder: string;
	format: string;
}

export const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";

export type FormatDate = (date: string, format: string) => string;

export function dailyNotePath(
	date: string,
	config: DailyNoteConfig,
	formatDate: FormatDate,
): string {
	const filename = formatDate(date, config.format);
	const folder = config.folder.replace(/^\/+|\/+$/g, "");
	return folder ? `${folder}/${filename}.md` : `${filename}.md`;
}

/**
 * Inverse of `dailyNotePath`: given a vault path and the daily-note config,
 * return the `YYYY-MM-DD` date the file represents, or null if it isn't a
 * daily-note file (wrong folder, wrong format, nested deeper, etc.).
 *
 * `parseBasename` should parse the basename (no `.md`) against `format` and
 * return `YYYY-MM-DD` or null. Strict matching is the caller's responsibility.
 */
export type ParseBasename = (basename: string, format: string) => string | null;

export function parseDailyNotePath(
	path: string,
	config: DailyNoteConfig,
	parseBasename: ParseBasename,
): string | null {
	if (!path.endsWith(".md")) return null;
	const folder = config.folder.replace(/^\/+|\/+$/g, "");
	let rel: string;
	if (folder) {
		const prefix = `${folder}/`;
		if (!path.startsWith(prefix)) return null;
		rel = path.slice(prefix.length);
	} else {
		rel = path;
	}
	const basename = rel.slice(0, -3);
	if (basename === "") return null;
	return parseBasename(basename, config.format);
}
