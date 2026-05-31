import { beforeEach, describe, expect, test } from "bun:test";
import { DataLayer } from "../dataLayer";
import { coerceField } from "../coerce";
import {
	buildDefinitionFile,
	parseDefinitionFile,
} from "../definitionFile";
import type { Definition, Event } from "../types";
import { InMemoryVaultAdapter } from "../vaultAdapter";

const RUN_DEF: Definition = {
	id: "running",
	displayName: "Running",
	emoji: "🏃",
	kind: "habit",
	status: "active",
	tags: ["exercise"],
	created: "2026-04-01",
	schemaVersion: 1,
	valueType: "duration",
	unit: "minutes",
	targetCadence: "4/week",
	fieldSchema: [
		{ key: "quality", type: "number", range: [1, 5] },
		{ key: "route", type: "string" },
	],
};

function makeLayer(initial: Record<string, string> = {}): {
	layer: DataLayer;
	vault: InMemoryVaultAdapter;
} {
	let t = 1000;
	const vault = new InMemoryVaultAdapter(initial, () => t++);
	return { layer: new DataLayer(vault, "LifeTracker"), vault };
}

describe("DataLayer", () => {
	let layer: DataLayer;
	let vault: InMemoryVaultAdapter;

	beforeEach(() => {
		const made = makeLayer();
		layer = made.layer;
		vault = made.vault;
	});

	test("createDefinition writes a parseable file", async () => {
		await layer.createDefinition(RUN_DEF);
		const path = "LifeTracker/definitions/running.md";
		expect(await vault.exists(path)).toBe(true);
		const content = await vault.read(path);
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.definition.id).toBe("running");
		expect(parsed.definition.kind).toBe("habit");
	});

	test("appendEvent writes a parseable line and assigns a ULID", async () => {
		await layer.createDefinition(RUN_DEF);
		const e: Event = {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 32,
			note: "loop",
			fields: {
				quality: coerceField("4", RUN_DEF.fieldSchema![0]),
				route: coerceField("park", RUN_DEF.fieldSchema![1]),
			},
		};
		const written = await layer.appendEvent("running", e);
		expect(written.id).not.toBe("");
		const events = await layer.loadEvents("running");
		expect(events.length).toBe(1);
		expect(events[0].id).toBe(written.id);
		expect(events[0].fields.quality.coerced).toBe(4);
	});

	test("appendEvent persists across reload", async () => {
		await layer.createDefinition(RUN_DEF);
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 30,
			fields: {},
		});

		const fresh = new DataLayer(vault, "LifeTracker");
		const events = await fresh.loadEvents("running");
		expect(events.length).toBe(1);
		expect(events[0].value).toBe(30);
	});

	test("editEvent rewrites in place", async () => {
		await layer.createDefinition(RUN_DEF);
		const e = await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 30,
			fields: {},
		});
		await layer.editEvent("running", e.id, { value: 45, note: "longer" });
		const events = await layer.loadEvents("running");
		expect(events.length).toBe(1);
		expect(events[0].value).toBe(45);
		expect(events[0].note).toBe("longer");
	});

	test("deleteEvent removes the line", async () => {
		await layer.createDefinition(RUN_DEF);
		const e1 = await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 30,
			fields: {},
		});
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-29T07:14",
			value: 20,
			fields: {},
		});
		await layer.deleteEvent("running", e1.id);
		const events = await layer.loadEvents("running");
		expect(events.length).toBe(1);
		expect(events[0].value).toBe(20);
	});

	test("updateDefinition only replaces frontmatter, not events", async () => {
		await layer.createDefinition(RUN_DEF);
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 30,
			fields: {},
		});
		await layer.updateDefinition({
			...RUN_DEF,
			displayName: "Running (renamed)",
		});

		const def = await layer.getDefinition("running");
		expect(def?.displayName).toBe("Running (renamed)");
		const events = await layer.loadEvents("running");
		expect(events.length).toBe(1);
	});

	test("archive/unarchive flips status", async () => {
		await layer.createDefinition(RUN_DEF);
		await layer.archiveDefinition("running");
		expect((await layer.getDefinition("running"))?.status).toBe("archived");
		await layer.unarchiveDefinition("running");
		expect((await layer.getDefinition("running"))?.status).toBe("active");
	});

	test("retireField marks a field retired without touching events", async () => {
		await layer.createDefinition(RUN_DEF);
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 30,
			fields: {
				quality: coerceField("3", RUN_DEF.fieldSchema![0]),
			},
		});
		await layer.retireField("running", "quality");

		const def = await layer.getDefinition("running");
		const f = def?.fieldSchema?.find((x) => x.key === "quality");
		expect(f?.retired).toBe(true);
		const events = await layer.loadEvents("running");
		expect(events[0].fields.quality.coerced).toBe(3);
	});

	test("appendEvent dedups by source key", async () => {
		await layer.createDefinition(RUN_DEF);
		const first = await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:00:00.000Z",
			value: 30,
			source: "daily:2026-04-28T07:00",
			fields: {},
		});
		const second = await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:00:00.000Z",
			value: 30,
			source: "daily:2026-04-28T07:00",
			fields: {},
		});

		// Second call must return the first event's id (canonical), not mint a new one.
		expect(second.id).toBe(first.id);
		const events = await layer.loadEvents("running");
		expect(events.length).toBe(1);
		expect(events[0].source).toBe("daily:2026-04-28T07:00");
	});

	test("appendEvent without source does not dedup", async () => {
		await layer.createDefinition(RUN_DEF);
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:00:00.000Z",
			value: 30,
			fields: {},
		});
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:00:00.000Z",
			value: 30,
			fields: {},
		});
		const events = await layer.loadEvents("running");
		expect(events.length).toBe(2);
	});

	test("appendEvent dedup sees source already in file (cross-device sync race)", async () => {
		await layer.createDefinition(RUN_DEF);
		// Simulate the other device's event arriving via sync directly into the
		// definition file, without going through this DataLayer instance — i.e.
		// the in-memory cache is stale.
		const path = "LifeTracker/definitions/running.md";
		const stale = await vault.read(path);
		const synced = `${stale.trimEnd()}\n- 2026-04-28T07:00:00.000Z | 30 |  | id="01OTHER" source="daily:2026-04-28T07:00"\n`;
		await vault.write(path, synced);

		// Now this device tries to auto-log the same checkbox. The cache still
		// reflects an empty event list, but the atomic process() read inside
		// appendEvent must see the synced-in event and dedup.
		const result = await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:00:00.000Z",
			value: 30,
			source: "daily:2026-04-28T07:00",
			fields: {},
		});
		expect(result.id).toBe("01OTHER");

		const fresh = new DataLayer(vault, "LifeTracker");
		const events = await fresh.loadEvents("running");
		expect(events.length).toBe(1);
	});

	test("loadAllEvents merges across definitions, sorted by timestamp", async () => {
		await layer.createDefinition(RUN_DEF);
		await layer.createDefinition({
			...RUN_DEF,
			id: "yoga",
			displayName: "Yoga",
			fieldSchema: undefined,
		});
		await layer.appendEvent("running", {
			id: "",
			timestamp: "2026-04-28T07:14",
			value: 30,
			fields: {},
		});
		await layer.appendEvent("yoga", {
			id: "",
			timestamp: "2026-04-27T18:00",
			value: 40,
			fields: {},
		});
		const all = await layer.loadAllEvents();
		expect(all.length).toBe(2);
		expect(all[0].timestamp).toBe("2026-04-27T18:00");
		expect(all[1].timestamp).toBe("2026-04-28T07:14");
	});

	test("defaultDuration survives parse/serialize round-trip", () => {
		const def: Definition = {
			...RUN_DEF,
			defaultDuration: 30,
		};
		const content = buildDefinitionFile(def, "", []);
		expect(content).toContain("defaultDuration: 30");
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.definition.defaultDuration).toBe(30);
	});

	test("missing defaultDuration parses as undefined and is not serialized", () => {
		const content = buildDefinitionFile(RUN_DEF, "", []);
		expect(content).not.toContain("defaultDuration");
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.definition.defaultDuration).toBeUndefined();
	});

	test("definition file with body and existing events round-trips", () => {
		const events: Event[] = [
			{
				id: "01HW1",
				timestamp: "2026-04-28T07:14",
				value: 32,
				note: "morning loop",
				fields: {
					quality: coerceField("4", RUN_DEF.fieldSchema![0]),
					route: coerceField("park", RUN_DEF.fieldSchema![1]),
				},
			},
		];
		const content = buildDefinitionFile(
			RUN_DEF,
			"# Running\n\nSome notes.",
			events,
		);
		const parsed = parseDefinitionFile(content);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.definition.id).toBe("running");
		expect(parsed.events.length).toBe(1);
		expect(parsed.events[0].fields.quality.coerced).toBe(4);
		expect(parsed.body).toContain("Some notes.");
	});
});
