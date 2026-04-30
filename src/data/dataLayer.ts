import {
	appendEventLineToContent,
	buildDefinitionFile,
	parseDefinitionFile,
	removeEventLineFromContent,
	replaceEventLineInContent,
	replaceFrontmatter,
} from "./definitionFile";
import { serializeEventLine } from "./eventLine";
import { migrateDefinition } from "./migrations";
import { coerceField } from "./coerce";
import {
	type Definition,
	type Event,
	type FieldDef,
	type FieldValue,
} from "./types";
import { ulid } from "./ulid";
import type { VaultAdapter } from "./vaultAdapter";

export interface DateRange {
	from?: string;
	to?: string;
}

interface CacheEntry {
	path: string;
	mtime: number;
	definition: Definition;
	events: Event[];
	body: string;
	warnings: string[];
}

export interface LoadDefinitionsResult {
	definitions: Definition[];
	warnings: string[];
}

const DEFAULT_ROOT = "LifeTracker";

export class DataLayer {
	private cache = new Map<string, CacheEntry>();
	private pathById = new Map<string, string>();

	constructor(
		private vault: VaultAdapter,
		private root: string = DEFAULT_ROOT,
	) {}

	get definitionsFolder(): string {
		return `${this.root}/definitions`;
	}

	async loadDefinitions(): Promise<LoadDefinitionsResult> {
		const files = await this.vault.list(this.definitionsFolder);
		const definitions: Definition[] = [];
		const warnings: string[] = [];

		const seenIds = new Set<string>();

		for (const info of files) {
			const cached = [...this.cache.values()].find(
				(c) => c.path === info.path,
			);
			if (cached && cached.mtime === info.mtime) {
				if (!seenIds.has(cached.definition.id)) {
					definitions.push(cached.definition);
					seenIds.add(cached.definition.id);
				}
				continue;
			}
			const entry = await this.readAndCacheFile(info.path, info.mtime);
			if (!entry) {
				warnings.push(`failed to parse ${info.path}`);
				continue;
			}
			for (const w of entry.warnings) {
				warnings.push(`${info.path}: ${w}`);
			}
			if (seenIds.has(entry.definition.id)) {
				warnings.push(
					`duplicate definition id "${entry.definition.id}" at ${info.path}`,
				);
				continue;
			}
			definitions.push(entry.definition);
			seenIds.add(entry.definition.id);
		}

		this.pruneCache(new Set(files.map((f) => f.path)));

		return { definitions, warnings };
	}

	async loadEvents(definitionId: string, range?: DateRange): Promise<Event[]> {
		const entry = await this.requireEntry(definitionId);
		return filterByRange(entry.events, range);
	}

	async loadAllEvents(range?: DateRange): Promise<Event[]> {
		await this.loadDefinitions();
		const out: Event[] = [];
		for (const entry of this.cache.values()) {
			for (const e of filterByRange(entry.events, range)) out.push(e);
		}
		out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
		return out;
	}

	async appendEvent(definitionId: string, event: Event): Promise<Event> {
		const entry = await this.requireEntry(definitionId);
		const e: Event = { ...event };
		if (!e.id) e.id = ulid();

		e.fields = normalizeFields(e.fields, entry.definition.fieldSchema);

		const line = serializeEventLine(e, entry.definition.fieldSchema);
		const content = await this.vault.read(entry.path);
		const newContent = appendEventLineToContent(content, line);
		await this.vault.write(entry.path, newContent);
		await this.invalidate(entry.path);
		return e;
	}

	async editEvent(
		definitionId: string,
		eventId: string,
		patch: Partial<Omit<Event, "id">>,
	): Promise<Event> {
		const entry = await this.requireEntry(definitionId);
		const existing = entry.events.find((ev) => ev.id === eventId);
		if (!existing) {
			throw new Error(
				`event ${eventId} not found in definition ${definitionId}`,
			);
		}

		const merged: Event = {
			...existing,
			...patch,
			id: existing.id,
			fields: patch.fields
				? normalizeFields(patch.fields, entry.definition.fieldSchema)
				: existing.fields,
		};

		const newLine = serializeEventLine(merged, entry.definition.fieldSchema);
		const content = await this.vault.read(entry.path);
		const result = replaceEventLineInContent(content, eventId, newLine);
		if (!result.ok) {
			throw new Error(
				`event ${eventId} not found in file ${entry.path}`,
			);
		}
		await this.vault.write(entry.path, result.content);
		await this.invalidate(entry.path);
		return merged;
	}

	async deleteEvent(definitionId: string, eventId: string): Promise<void> {
		const entry = await this.requireEntry(definitionId);
		const content = await this.vault.read(entry.path);
		const result = removeEventLineFromContent(content, eventId);
		if (!result.ok) {
			throw new Error(
				`event ${eventId} not found in file ${entry.path}`,
			);
		}
		await this.vault.write(entry.path, result.content);
		await this.invalidate(entry.path);
	}

	async createDefinition(
		def: Definition,
		opts: { body?: string; events?: Event[] } = {},
	): Promise<void> {
		const path = this.pathFor(def.id);
		if (await this.vault.exists(path)) {
			throw new Error(`definition file already exists: ${path}`);
		}
		const events = (opts.events ?? []).map((e) => ({
			...e,
			id: e.id || ulid(),
			fields: normalizeFields(e.fields, def.fieldSchema),
		}));
		const content = buildDefinitionFile(def, opts.body ?? "", events);
		await this.vault.create(path, content);
		await this.invalidate(path);
	}

	async updateDefinition(def: Definition): Promise<void> {
		const entry = await this.requireEntry(def.id);
		const content = await this.vault.read(entry.path);
		const newContent = replaceFrontmatter(content, def);
		await this.vault.write(entry.path, newContent);
		await this.invalidate(entry.path);
	}

	async archiveDefinition(id: string): Promise<void> {
		const entry = await this.requireEntry(id);
		await this.updateDefinition({
			...entry.definition,
			status: "archived",
		});
	}

	async unarchiveDefinition(id: string): Promise<void> {
		const entry = await this.requireEntry(id);
		await this.updateDefinition({
			...entry.definition,
			status: "active",
		});
	}

	async retireField(definitionId: string, key: string): Promise<void> {
		const entry = await this.requireEntry(definitionId);
		const schema = entry.definition.fieldSchema;
		if (!schema) throw new Error(`no fieldSchema on ${definitionId}`);
		const idx = schema.findIndex((f) => f.key === key);
		if (idx < 0) {
			throw new Error(
				`field "${key}" not found in fieldSchema for ${definitionId}`,
			);
		}
		const newSchema = schema.map((f, i) =>
			i === idx ? { ...f, retired: true } : f,
		);
		await this.updateDefinition({
			...entry.definition,
			fieldSchema: newSchema,
		});
	}

	async getDefinition(id: string): Promise<Definition | null> {
		const entry = await this.maybeEntry(id);
		return entry?.definition ?? null;
	}

	clearCache(): void {
		this.cache.clear();
		this.pathById.clear();
	}

	private async requireEntry(id: string): Promise<CacheEntry> {
		const entry = await this.maybeEntry(id);
		if (!entry) throw new Error(`definition not found: ${id}`);
		return entry;
	}

	private async maybeEntry(id: string): Promise<CacheEntry | null> {
		const cached = this.cache.get(id);
		if (cached) {
			const mtime = await this.vault.mtime(cached.path);
			if (mtime !== null && mtime === cached.mtime) return cached;
			if (mtime === null) {
				this.cache.delete(id);
			} else {
				const refreshed = await this.readAndCacheFile(cached.path, mtime);
				if (refreshed) return refreshed;
			}
		}

		const path = this.pathById.get(id) ?? this.pathFor(id);
		if (await this.vault.exists(path)) {
			const mtime = (await this.vault.mtime(path)) ?? 0;
			const entry = await this.readAndCacheFile(path, mtime);
			if (entry && entry.definition.id === id) return entry;
		}

		await this.loadDefinitions();
		return this.cache.get(id) ?? null;
	}

	private async readAndCacheFile(
		path: string,
		mtime: number,
	): Promise<CacheEntry | null> {
		const content = await this.vault.read(path);
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) return null;
		const migrated = migrateDefinition(parsed.definition);
		const entry: CacheEntry = {
			path,
			mtime,
			definition: migrated.definition,
			events: parsed.events,
			body: parsed.body,
			warnings: parsed.warnings,
		};
		this.cache.set(migrated.definition.id, entry);
		this.pathById.set(migrated.definition.id, path);
		return entry;
	}

	private async invalidate(path: string): Promise<void> {
		for (const [id, entry] of this.cache.entries()) {
			if (entry.path === path) {
				this.cache.delete(id);
			}
		}
		const mtime = await this.vault.mtime(path);
		if (mtime !== null) await this.readAndCacheFile(path, mtime);
	}

	private pruneCache(activePaths: Set<string>): void {
		for (const [id, entry] of this.cache.entries()) {
			if (!activePaths.has(entry.path)) {
				this.cache.delete(id);
				this.pathById.delete(id);
			}
		}
	}

	private pathFor(id: string): string {
		return `${this.definitionsFolder}/${id}.md`;
	}
}

function normalizeFields(
	fields: Record<string, FieldValue>,
	schema?: FieldDef[],
): Record<string, FieldValue> {
	const out: Record<string, FieldValue> = {};
	for (const [key, value] of Object.entries(fields)) {
		const def = schema?.find((f) => f.key === key);
		if (
			value &&
			typeof value.raw === "string" &&
			value.coerced === undefined &&
			value.coercionError === undefined &&
			value.rangeWarning === undefined
		) {
			out[key] = coerceField(value.raw, def);
		} else if (value && typeof value.raw === "string") {
			out[key] = value;
		} else {
			out[key] = coerceField(String(value), def);
		}
	}
	return out;
}

function filterByRange(events: Event[], range?: DateRange): Event[] {
	if (!range) return events;
	return events.filter((e) => {
		if (range.from && e.timestamp < range.from) return false;
		if (range.to && e.timestamp > range.to) return false;
		return true;
	});
}
