import { describe, expect, test } from "bun:test";
import {
	emptyDefinitionOrder,
	mergeDefinitionOrder,
	normalizeDefinitionOrder,
} from "../definitionOrder";

describe("normalizeDefinitionOrder", () => {
	test("fills in every tab when given nothing", () => {
		expect(normalizeDefinitionOrder(undefined)).toEqual(emptyDefinitionOrder());
		expect(normalizeDefinitionOrder(null)).toEqual(emptyDefinitionOrder());
		expect(normalizeDefinitionOrder("nonsense")).toEqual(
			emptyDefinitionOrder(),
		);
	});

	test("keeps known tabs and backfills missing ones", () => {
		expect(normalizeDefinitionOrder({ habits: ["a", "b"] })).toEqual({
			habits: ["a", "b"],
			counters: [],
			maintenance: [],
			projects: [],
		});
	});

	test("drops junk entries instead of throwing", () => {
		const out = normalizeDefinitionOrder({
			habits: ["a", 42, null, "", "b"],
			counters: "not-an-array",
			bogusTab: ["x"],
		});
		expect(out.habits).toEqual(["a", "b"]);
		expect(out.counters).toEqual([]);
		expect(out).not.toHaveProperty("bogusTab");
	});

	test("dedupes ids that a bad merge may have doubled", () => {
		expect(
			normalizeDefinitionOrder({ habits: ["a", "b", "a"] }).habits,
		).toEqual(["a", "b"]);
	});
});

describe("mergeDefinitionOrder", () => {
	test("writes the tab the user just reordered", () => {
		const merged = mergeDefinitionOrder(
			emptyDefinitionOrder(),
			emptyDefinitionOrder(),
			{ tab: "habits", ids: ["c", "a", "b"] },
		);
		expect(merged.habits).toEqual(["c", "a", "b"]);
	});

	test("keeps another device's reorder of a different tab", () => {
		// Phone reordered projects and synced; this device still has the old copy
		// in memory and is now saving a habits reorder.
		const onDisk = {
			habits: ["a", "b"],
			counters: [],
			maintenance: [],
			projects: ["p2", "p1"],
		};
		const inMemory = {
			habits: ["a", "b"],
			counters: [],
			maintenance: [],
			projects: ["p1", "p2"],
		};

		const merged = mergeDefinitionOrder(onDisk, inMemory, {
			tab: "habits",
			ids: ["b", "a"],
		});

		expect(merged.habits).toEqual(["b", "a"]);
		expect(merged.projects).toEqual(["p2", "p1"]);
	});

	test("the edited tab wins over disk even when disk is newer", () => {
		const merged = mergeDefinitionOrder(
			{ habits: ["x", "y", "z"] },
			emptyDefinitionOrder(),
			{ tab: "habits", ids: ["z", "y", "x"] },
		);
		expect(merged.habits).toEqual(["z", "y", "x"]);
	});

	test("falls back to memory for tabs absent from disk", () => {
		const inMemory = {
			habits: [],
			counters: ["c1"],
			maintenance: [],
			projects: [],
		};
		const merged = mergeDefinitionOrder({}, inMemory, {
			tab: "habits",
			ids: ["h1"],
		});
		expect(merged.counters).toEqual(["c1"]);
		expect(merged.habits).toEqual(["h1"]);
	});

	test("survives a corrupt or partial data.json", () => {
		const merged = mergeDefinitionOrder(null, emptyDefinitionOrder(), {
			tab: "projects",
			ids: ["p1"],
		});
		expect(merged).toEqual({
			habits: [],
			counters: [],
			maintenance: [],
			projects: ["p1"],
		});
	});
});
