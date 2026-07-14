import { summarizeAll } from "./data/dashboard";
import type {
	Definition,
	DefinitionKind,
	Event,
	FieldValue,
} from "./data/types";
import { CURRENT_SCHEMA_VERSION, FIELD_KEY_RE } from "./data/types";
import type LifeTrackerPlugin from "./main";

/**
 * The in-process integration surface for other plugins (vault-assistant's
 * agent in particular). Descriptors deliberately match the MCP tool shape
 * (name / description / inputSchema) so an MCP-style client maps them 1:1.
 *
 * Contract: `invoke` never throws and always resolves to a JSON string;
 * failures come back as {"error": "..."} — the consumer is a language model.
 *
 * The on-disk file format (docs/integration.md) remains the contract for
 * decoupled READ access. This API exists for safe WRITES and computed
 * summaries: ULIDs, coercion, source-dedup, daily-note mirroring, and cache
 * invalidation all live in the plugin runtime and are easy to get wrong from
 * the outside.
 */

export const API_VERSION = "1.0.0";

export interface ToolDescriptor {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
}

export interface LifeTrackerApi {
	version: string;
	toolDescriptors: ToolDescriptor[];
	invoke(name: string, args: Record<string, unknown>): Promise<string>;
}

const KINDS: DefinitionKind[] = [
	"habit",
	"maintenance",
	"reverse-habit",
	"project",
	"counter",
];

const DESCRIPTORS: ToolDescriptor[] = [
	{
		name: "list_definitions",
		description:
			"List everything the user tracks in Life Tracker: habits, maintenance items, reverse habits, projects, and counters, with their cadence/interval, tags, and custom field schema.",
		inputSchema: {
			type: "object",
			properties: {
				include_archived: {
					type: "boolean",
					description: "Also include archived definitions. Default false.",
				},
			},
		},
	},
	{
		name: "query_events",
		description:
			"Fetch logged events, newest first. Filter by definition id and/or an inclusive ISO date range (local time, e.g. 2026-07-01).",
		inputSchema: {
			type: "object",
			properties: {
				definition: {
					type: "string",
					description: "Definition id. Omit for events across all definitions.",
				},
				from: { type: "string", description: "Inclusive start, YYYY-MM-DD." },
				to: { type: "string", description: "Inclusive end, YYYY-MM-DD." },
				limit: {
					type: "number",
					description: "Max events returned. Default 100.",
				},
			},
		},
	},
	{
		name: "get_summaries",
		description:
			"Computed status for everything tracked: habit period progress and streaks, maintenance freshness (ok/approaching/overdue), reverse-habit day counts, project activity/dormancy, counter totals and goals. The right first call for any 'how am I doing' question.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "log_event",
		description:
			"Log an event for a definition. Mirrors into the user's daily note like a manual log. Custom field values go in `fields` (they are coerced against the definition's field schema).",
		inputSchema: {
			type: "object",
			properties: {
				definition: { type: "string", description: "Definition id." },
				timestamp: {
					type: "string",
					description:
						"ISO timestamp (e.g. 2026-07-13T07:30). Defaults to now.",
				},
				value: {
					type: "number",
					description:
						"Numeric value (duration in the definition's unit, count, etc.). Defaults to 1.",
				},
				note: { type: "string", description: "Optional note." },
				fields: {
					type: "object",
					description: "Custom field values keyed by field key.",
				},
			},
			required: ["definition"],
		},
	},
	{
		name: "edit_event",
		description: "Edit an existing event's timestamp, value, note, or fields.",
		inputSchema: {
			type: "object",
			properties: {
				definition: { type: "string", description: "Definition id." },
				event_id: { type: "string", description: "The event's id." },
				timestamp: { type: "string" },
				value: { type: "number" },
				note: { type: "string" },
				fields: { type: "object" },
			},
			required: ["definition", "event_id"],
		},
	},
	{
		name: "delete_event",
		description: "Delete an event by id.",
		inputSchema: {
			type: "object",
			properties: {
				definition: { type: "string", description: "Definition id." },
				event_id: { type: "string", description: "The event's id." },
			},
			required: ["definition", "event_id"],
		},
	},
	{
		name: "plan_item",
		description:
			"Schedule a definition into the user's daily note as an unchecked plan line under the plan heading. When the user ticks it, the event is auto-logged.",
		inputSchema: {
			type: "object",
			properties: {
				definition: { type: "string", description: "Definition id." },
				date: { type: "string", description: "YYYY-MM-DD." },
				start_time: { type: "string", description: "HH:MM (24h)." },
				end_time: {
					type: "string",
					description: "Optional HH:MM end of the planned block.",
				},
			},
			required: ["definition", "date", "start_time"],
		},
	},
	{
		name: "create_definition",
		description:
			"Create a new thing to track. Kinds: habit (needs target_cadence like '4/week' or 'daily'), maintenance (needs interval_days), reverse-habit, project, counter. Ask the user before inventing definitions they didn't request.",
		inputSchema: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "Slug id (lowercase, hyphens), becomes the filename.",
				},
				name: { type: "string", description: "Display name." },
				kind: { type: "string", enum: KINDS },
				emoji: { type: "string" },
				tags: { type: "array", items: { type: "string" } },
				target_cadence: {
					type: "string",
					description: "Habits: e.g. 'daily', '4/week', '10/month'.",
				},
				interval_days: {
					type: "number",
					description: "Maintenance: redo every N days.",
				},
				warning_days: {
					type: "number",
					description: "Maintenance: warn this many days early. Default 2.",
				},
				unit: { type: "string", description: "Habit/counter unit label." },
				goal: { type: "number", description: "Counter goal." },
			},
			required: ["id", "name", "kind"],
		},
	},
];

function str(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function toFieldValues(v: unknown): Record<string, FieldValue> {
	const out: Record<string, FieldValue> = {};
	if (v && typeof v === "object" && !Array.isArray(v)) {
		for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
			out[key] = { raw: String(value) };
		}
	}
	return out;
}

function ok(value: unknown): string {
	return JSON.stringify(value);
}

function err(message: string): string {
	return JSON.stringify({ error: message });
}

/** Trim an event for model consumption: raw field strings, no coercion detail. */
function eventOut(definitionId: string, e: Event): Record<string, unknown> {
	const fields: Record<string, string> = {};
	for (const [k, v] of Object.entries(e.fields)) fields[k] = v.raw;
	return {
		definition: definitionId,
		id: e.id,
		timestamp: e.timestamp,
		...(e.value !== undefined ? { value: e.value } : {}),
		...(e.note ? { note: e.note } : {}),
		...(Object.keys(fields).length ? { fields } : {}),
	};
}

export function createApi(plugin: LifeTrackerPlugin): LifeTrackerApi {
	const handlers: Record<
		string,
		(args: Record<string, unknown>) => Promise<string>
	> = {
		list_definitions: async (args) => {
			const { definitions, warnings } = await plugin.data.loadDefinitions();
			const list = definitions
				.filter((d) => args.include_archived === true || d.status !== "archived")
				.map((d) => ({
					id: d.id,
					name: d.displayName,
					kind: d.kind,
					status: d.status,
					tags: d.tags,
					...(d.kind === "habit"
						? { target_cadence: d.targetCadence, unit: d.unit }
						: {}),
					...(d.kind === "maintenance"
						? { interval_days: d.intervalDays }
						: {}),
					...(d.kind === "counter" ? { unit: d.unit, goal: d.goal } : {}),
					fields: (d.fieldSchema ?? [])
						.filter((f) => !f.retired)
						.map((f) => ({
							key: f.key,
							type: f.type,
							required: f.required ?? false,
							...(f.options ? { options: f.options } : {}),
							...(f.prompt ? { prompt: f.prompt } : {}),
						})),
				}));
			return ok(warnings.length ? { definitions: list, warnings } : { definitions: list });
		},

		query_events: async (args) => {
			const definition = str(args.definition);
			const from = str(args.from) || undefined;
			// Make `to` inclusive of the whole end day for date-only inputs.
			const toRaw = str(args.to);
			const to = toRaw ? (toRaw.includes("T") ? toRaw : `${toRaw}T99`) : undefined;
			const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
			let events: Array<Record<string, unknown>>;
			if (definition) {
				const list = await plugin.data.loadEvents(definition, { from, to });
				events = list.map((e) => eventOut(definition, e));
			} else {
				const byDef = await plugin.data.loadEventsByDefinitionId({ from, to });
				events = [];
				for (const [id, list] of byDef) {
					for (const e of list) events.push(eventOut(id, e));
				}
			}
			events.sort((a, b) =>
				String(b.timestamp).localeCompare(String(a.timestamp)),
			);
			return ok({ events: events.slice(0, limit), total: events.length });
		},

		get_summaries: async () => {
			const { definitions } = await plugin.data.loadDefinitions();
			const eventsByDefinitionId = await plugin.data.loadEventsByDefinitionId();
			const s = summarizeAll({
				definitions,
				eventsByDefinitionId,
				now: new Date(),
				habitWindowMode: plugin.settings.habitWindowMode,
			});
			return ok({
				habits: s.habits.map((h) => ({
					id: h.definition.id,
					name: h.definition.displayName,
					period: h.periodLabel,
					done: h.periodCount,
					target: h.periodTarget,
					due_today: h.dueToday,
					streak: h.currentStreak,
					last_event: h.lastEventTimestamp ?? null,
				})),
				reverse_habits: s.reverseHabits.map((r) => ({
					id: r.definition.id,
					name: r.definition.displayName,
					days_since: r.daysSince,
					personal_best_days: r.personalBestDays,
					next_milestone: r.nextMilestone ?? null,
				})),
				maintenance: s.maintenance.map((m) => ({
					id: m.definition.id,
					name: m.definition.displayName,
					status: m.status,
					days_since: m.daysSince,
					interval_days: m.definition.intervalDays,
				})),
				projects: s.projects.map((p) => ({
					id: p.definition.id,
					name: p.definition.displayName,
					days_since_activity: p.daysSince,
					events_last_30d: p.eventsLast30,
					dormant: p.isDormant,
				})),
				counters: s.counters.map((c) => ({
					id: c.definition.id,
					name: c.definition.displayName,
					total: c.total,
					period_total: c.periodTotal,
					period: c.periodLabel,
					goal: c.goal ?? null,
				})),
			});
		},

		log_event: async (args) => {
			const definition = str(args.definition);
			if (!definition) return err("definition is required");
			const tsRaw = str(args.timestamp);
			if (tsRaw && Number.isNaN(new Date(tsRaw).getTime())) {
				return err(`invalid timestamp: "${tsRaw}"`);
			}
			const event: Event = {
				id: "",
				timestamp: tsRaw || new Date().toISOString(),
				value: typeof args.value === "number" ? args.value : 1,
				note: str(args.note) || undefined,
				fields: toFieldValues(args.fields),
			};
			const logged = await plugin.logEventViaApi(definition, event);
			return ok({ logged: eventOut(definition, logged) });
		},

		edit_event: async (args) => {
			const definition = str(args.definition);
			const eventId = str(args.event_id);
			if (!definition || !eventId) return err("definition and event_id are required");
			const patch: Partial<Omit<Event, "id">> = {};
			if (str(args.timestamp)) {
				if (Number.isNaN(new Date(str(args.timestamp)).getTime())) {
					return err(`invalid timestamp: "${str(args.timestamp)}"`);
				}
				patch.timestamp = str(args.timestamp);
			}
			if (typeof args.value === "number") patch.value = args.value;
			if (typeof args.note === "string") patch.note = args.note || undefined;
			if (args.fields !== undefined) patch.fields = toFieldValues(args.fields);
			const updated = await plugin.data.editEvent(definition, eventId, patch);
			plugin.refreshDashboards();
			return ok({ updated: eventOut(definition, updated) });
		},

		delete_event: async (args) => {
			const definition = str(args.definition);
			const eventId = str(args.event_id);
			if (!definition || !eventId) return err("definition and event_id are required");
			await plugin.data.deleteEvent(definition, eventId);
			plugin.refreshDashboards();
			return ok({ deleted: eventId });
		},

		plan_item: async (args) => {
			const definition = str(args.definition);
			const date = str(args.date);
			const startTime = str(args.start_time);
			if (!definition || !date || !startTime) {
				return err("definition, date, and start_time are required");
			}
			if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("date must be YYYY-MM-DD");
			if (!/^\d{1,2}:\d{2}$/.test(startTime)) return err("start_time must be HH:MM");
			const endTime = str(args.end_time) || undefined;
			if (endTime && !/^\d{1,2}:\d{2}$/.test(endTime)) return err("end_time must be HH:MM");
			const path = await plugin.planItemViaApi(definition, date, startTime, endTime);
			return ok({ planned: { definition, date, start_time: startTime }, daily_note: path });
		},

		create_definition: async (args) => {
			const id = str(args.id).trim();
			const name = str(args.name).trim();
			const kind = str(args.kind) as DefinitionKind;
			if (!id || !FIELD_KEY_RE.test(id.replace(/-/g, "_"))) {
				return err("id must be a lowercase slug (letters, digits, hyphens)");
			}
			if (!name) return err("name is required");
			if (!KINDS.includes(kind)) return err(`kind must be one of: ${KINDS.join(", ")}`);

			const base = {
				id,
				displayName: name,
				emoji: str(args.emoji) || undefined,
				status: "active" as const,
				tags: Array.isArray(args.tags)
					? args.tags.filter((t): t is string => typeof t === "string")
					: [],
				created: new Date().toISOString(),
				schemaVersion: CURRENT_SCHEMA_VERSION,
			};

			let def: Definition;
			switch (kind) {
				case "habit": {
					const cadence = str(args.target_cadence);
					if (!cadence) return err("habits need target_cadence (e.g. 'daily', '4/week')");
					def = {
						...base,
						kind,
						valueType: "boolean",
						unit: str(args.unit) || undefined,
						targetCadence: cadence,
					};
					break;
				}
				case "maintenance": {
					const interval = Number(args.interval_days);
					if (!Number.isFinite(interval) || interval < 1) {
						return err("maintenance needs interval_days (>= 1)");
					}
					def = {
						...base,
						kind,
						intervalDays: Math.floor(interval),
						warningThresholdDays: Math.max(0, Math.floor(Number(args.warning_days) || 2)),
					};
					break;
				}
				case "reverse-habit":
					def = { ...base, kind };
					break;
				case "project":
					def = { ...base, kind };
					break;
				case "counter":
					def = {
						...base,
						kind,
						unit: str(args.unit) || undefined,
						goal: typeof args.goal === "number" ? args.goal : undefined,
					};
					break;
			}

			await plugin.data.createDefinition(def);
			plugin.refreshDashboards();
			return ok({ created: { id, name, kind } });
		},
	};

	return {
		version: API_VERSION,
		toolDescriptors: DESCRIPTORS,
		async invoke(name, args): Promise<string> {
			const handler = handlers[name];
			if (!handler) return err(`unknown tool "${name}"`);
			try {
				return await handler(args ?? {});
			} catch (e) {
				return err((e as Error).message ?? String(e));
			}
		},
	};
}
