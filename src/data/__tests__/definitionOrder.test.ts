import { describe, expect, test } from "bun:test";
import {
	emptyDefinitionOrder,
	mergeDefinitionOrder,
	normalizeDefinitionOrder,
	reorderWithin,
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
		// Spelled out rather than spread from emptyDefinitionOrder(): the point
		// of this test is that every tab key comes back present, so it must not
		// be satisfied by whatever that helper happens to return.
		expect(normalizeDefinitionOrder({ habits: ["a", "b"] })).toEqual({
			habits: ["a", "b"],
			counters: [],
			maintenance: [],
			projects: [],
			scores: [],
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
			...emptyDefinitionOrder(),
			habits: ["a", "b"],
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
		const inMemory = { ...emptyDefinitionOrder(), counters: ["c1"] };
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
			scores: [],
		});
	});
});

describe("reorderWithin", () => {
	test("reorders a whole list when the group is everything", () => {
		expect(reorderWithin(["a", "b", "c"], ["c", "a", "b"])).toEqual([
			"c",
			"a",
			"b",
		]);
	});

	test("leaves filtered-out ids in their original slots", () => {
		// The tab stores a,b,c,d; a tag filter is hiding b and d, and the user
		// dragged c above a. b and d must not move or vanish.
		expect(reorderWithin(["a", "b", "c", "d"], ["c", "a"])).toEqual([
			"c",
			"b",
			"a",
			"d",
		]);
	});

	test("reordering reverse habits leaves plain habits untouched", () => {
		// Overview renders these as two groups over one `habits` key.
		const full = ["h1", "r1", "h2", "r2"];
		expect(reorderWithin(full, ["r2", "r1"])).toEqual(["h1", "r2", "h2", "r1"]);
		expect(reorderWithin(full, ["h2", "h1"])).toEqual(["h2", "r1", "h1", "r2"]);
	});

	test("appends group ids the stored order has never seen", () => {
		expect(reorderWithin(["a"], ["a", "new"])).toEqual(["a", "new"]);
		expect(reorderWithin([], ["x", "y"])).toEqual(["x", "y"]);
	});

	test("is a no-op when the group order is unchanged", () => {
		const full = ["a", "b", "c"];
		expect(reorderWithin(full, ["a", "c"])).toEqual(full);
	});

	test("keeps ids whose definitions are gone from the current view", () => {
		expect(reorderWithin(["stale", "a", "b"], ["b", "a"])).toEqual([
			"stale",
			"b",
			"a",
		]);
	});
});
